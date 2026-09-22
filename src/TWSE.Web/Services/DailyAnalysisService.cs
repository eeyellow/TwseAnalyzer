using System.Text.Json;
using TWSE.Core.Data;
using TWSE.Core.Models;
using TWSE.Core.Screening;

namespace TWSE.Web.Services;

public class DailyAnalysisService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DailyAnalysisService> _logger;

    public DailyAnalysisService(IServiceProvider serviceProvider, ILogger<DailyAnalysisService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task RunAnalysisAsync(DateTime targetDate)
    {
        _logger.LogInformation("Starting adaptive daily analysis & verification for {TargetDate:yyyy-MM-dd}...", targetDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var stockRepo = scope.ServiceProvider.GetRequiredService<IStockRepository>();
            var evaluator = scope.ServiceProvider.GetRequiredService<IConditionEvaluator>();

            // ==========================================
            // 步驟 1: 高效批次載入全市場最近 120 天日線快照 (單次 SQL 查詢，記憶體分組)
            // ==========================================
            var allHistories = await stockRepo.GetMarketRecentPricesBatchAsync(120, targetDate);

            // ==========================================
            // 步驟 2: 迴歸驗證歷史訊號 (Forward Verification) - 使用記憶體快照
            // ==========================================
            await VerifyHistoricalSignalsAsync(stockRepo, targetDate, allHistories);

            // ==========================================
            // 步驟 3: 計算策略實戰勝率與自適應權重 (Adaptive Weights)
            // ==========================================
            var verificationSummary = await stockRepo.GetVerificationSummaryAsync(60);
            var strategyWeights = verificationSummary.StrategyMetrics
                .ToDictionary(m => m.StrategyName, m => m.AdaptiveWeight, StringComparer.OrdinalIgnoreCase);

            // ==========================================
            // 步驟 4: 載入策略模型定義
            // ==========================================
            string? strategiesDir = null;
            var current = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (current != null)
            {
                var candidate = Path.Combine(current.FullName, "strategies");
                if (Directory.Exists(candidate)) { strategiesDir = candidate; break; }
                current = current.Parent;
            }
            if (strategiesDir == null)
            {
                var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
                while (baseDir != null)
                {
                    var candidate = Path.Combine(baseDir.FullName, "strategies");
                    if (Directory.Exists(candidate)) { strategiesDir = candidate; break; }
                    baseDir = baseDir.Parent;
                }
            }
            strategiesDir ??= Path.Combine(Directory.GetCurrentDirectory(), "strategies");

            var loadedStrategies = new List<(string Name, StrategyConfig Config)>();
            if (Directory.Exists(strategiesDir))
            {
                var strategyFiles = Directory.GetFiles(strategiesDir, "*.json");
                foreach (var file in strategyFiles)
                {
                    var strategyName = Path.GetFileNameWithoutExtension(file);
                    try
                    {
                        var json = await File.ReadAllTextAsync(file);
                        var config = JsonSerializer.Deserialize<StrategyConfig>(json);
                        if (config != null)
                        {
                            loadedStrategies.Add((strategyName, config));
                        }
                    }
                    catch { }
                }
            }

            if (!loadedStrategies.Any())
            {
                _logger.LogWarning("在 strategies 目錄中未找到任何策略 JSON 設定檔，請確認已上傳策略檔案至伺服器目錄。");
                return;
            }

            // 4.1 目前持股操作健檢
            var portfolio = await stockRepo.GetPortfolioAsync();
            var portfolioCodes = portfolio.Select(p => p.StockCode).ToHashSet();
            var allSignals = new List<DailySignal>();
            var newTrackingItems = new List<SignalTrackingItem>();

            foreach (var item in portfolio)
            {
                if (!allHistories.TryGetValue(item.StockCode, out var history) || history.Count == 0)
                {
                    history = await stockRepo.GetDailyPricesAsync(item.StockCode);
                }
                if (history == null || history.Count == 0) continue;

                var lastIndex = history.FindLastIndex(p => p.Date.Date <= targetDate.Date);
                if (lastIndex < 0) continue;
                var lastClose = history[lastIndex].Close;

                string action = "Hold";
                string? triggeredStrategy = null;

                // 先檢測 Exit (出場優先)
                foreach (var (name, config) in loadedStrategies)
                {
                    if (config.Exit != null && config.Exit.Any())
                    {
                        if (evaluator.EvaluateAll(config.Exit, history, lastIndex))
                        {
                            action = "Sell";
                            triggeredStrategy = name;
                            break;
                        }
                    }
                }

                // 若未出場，檢測 Entry (加碼買進)
                if (action == "Hold")
                {
                    foreach (var (name, config) in loadedStrategies)
                    {
                        var entryConditions = (config.Entry != null && config.Entry.Any())
                            ? config.Entry
                            : (config.Screen ?? new List<string>());

                        if (entryConditions.Any() && evaluator.EvaluateAll(entryConditions, history, lastIndex))
                        {
                            action = "Buy";
                            triggeredStrategy = name;
                            break;
                        }
                    }
                }

                allSignals.Add(new DailySignal
                {
                    Date = targetDate,
                    StockCode = item.StockCode,
                    SignalType = action,
                    StrategyName = triggeredStrategy ?? "持股操作診斷",
                    SuggestedPrice = lastClose,
                    LastClose = lastClose
                });
            }

            // ==========================================
            // 步驟 5: 平行運算未持有個股，套用「個股/族群-策略適配組合矩陣」精選推薦
            // ==========================================
            var allStocks = (await stockRepo.GetAllStocksAsync()).ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
            var affinityLookup = verificationSummary.TopStockAffinities
                .GroupBy(a => $"{a.StockCode}_{a.StrategyName}", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var industryLookup = verificationSummary.IndustryAffinities
                .GroupBy(a => $"{a.Industry}_{a.StrategyName}", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var unownedHistories = allHistories
                .Where(kvp => !portfolioCodes.Contains(kvp.Key) && kvp.Value.Count >= 20)
                .ToList();

            var buyCandidates = new System.Collections.Concurrent.ConcurrentBag<(string Code, decimal LastClose, decimal Volume, string StrategyName, double WeightedScore)>();
            var sellCandidates = new System.Collections.Concurrent.ConcurrentBag<(string Code, decimal LastClose, decimal Volume, string StrategyName, double WeightedScore)>();
            var allMarketSignals = new System.Collections.Concurrent.ConcurrentBag<SignalTrackingItem>();

            Parallel.ForEach(unownedHistories, kvp =>
            {
                var code = kvp.Key;
                var history = kvp.Value;
                var lastIndex = history.FindLastIndex(p => p.Date.Date <= targetDate.Date);
                if (lastIndex < 20) return;
                var lastClose = history[lastIndex].Close;
                var lastVol = history[lastIndex].Volume;

                // 1. 流動性與噪聲判定 (20日均量 < 300張 視為低流動性冷門股/殭屍股，不推薦且隔離學習)
                var past20 = history.Take(lastIndex + 1).TakeLast(20).ToList();
                var vol20d = past20.Any() ? past20.Average(p => p.Volume) / 1000m : lastVol / 1000m;

                bool isNoise = false;
                string? noiseReason = null;
                if (vol20d < 300m)
                {
                    isNoise = true;
                    noiseReason = $"低流動性 (20日均量 {Math.Round(vol20d, 0)} 張 < 300張)";
                }
                else if (history.Count >= 2 && history[lastIndex].Low == history[lastIndex].High && lastVol < 100000)
                {
                    isNoise = true;
                    noiseReason = "極端跳空或流動性異常";
                }

                allStocks.TryGetValue(code, out var sInfo);
                var industry = sInfo?.Industry ?? "";

                // 2. 檢測買進條件
                foreach (var (name, config) in loadedStrategies)
                {
                    var entryConditions = (config.Entry != null && config.Entry.Any())
                        ? config.Entry
                        : (config.Screen ?? new List<string>());

                    if (entryConditions.Any() && evaluator.EvaluateAll(entryConditions, history, lastIndex))
                    {
                        strategyWeights.TryGetValue(name, out var adaptWeight);
                        if (adaptWeight <= 0) adaptWeight = 1.0m;

                        // 適配加成倍數：針對不同個股與產業族群動態調整，非一體適用
                        double affinityMultiplier = 1.0;
                        if (affinityLookup.TryGetValue($"{code}_{name}", out var aff))
                        {
                            if (aff.FitLevel == "Optimal") affinityMultiplier = 1.5; // 黃金適配組合
                            else if (aff.FitLevel == "Good") affinityMultiplier = 1.2;
                            else if (aff.FitLevel == "Mismatched") affinityMultiplier = 0.2; // 嚴重不適合此個股
                        }
                        else if (!string.IsNullOrEmpty(industry) && industryLookup.TryGetValue($"{industry}_{name}", out var indAff))
                        {
                            if (indAff.FitRecommendation == "HighlySuitable") affinityMultiplier = 1.25;
                            else if (indAff.FitRecommendation == "Caution") affinityMultiplier = 0.5;
                        }

                        // 只有非噪聲股且非嚴重互斥的個股才納入 Top 推薦池
                        if (!isNoise && affinityMultiplier > 0.3)
                        {
                            double weightedScore = (double)lastVol * (double)adaptWeight * affinityMultiplier;
                            buyCandidates.Add((code, lastClose, lastVol, name, weightedScore));
                        }

                        allMarketSignals.Add(new SignalTrackingItem
                        {
                            SignalDate = targetDate.ToString("yyyy-MM-dd"),
                            StockCode = code,
                            SignalType = "Buy",
                            StrategyName = name,
                            EntryPrice = lastClose,
                            Volume20dAvg = Math.Round(vol20d, 1),
                            IsNoise = isNoise ? 1 : 0,
                            NoiseReason = noiseReason,
                            Status = "Pending"
                        });
                        break;
                    }
                }

                // 3. 檢測賣出 / 避開條件
                foreach (var (name, config) in loadedStrategies)
                {
                    if (config.Exit != null && config.Exit.Any())
                    {
                        if (evaluator.EvaluateAll(config.Exit, history, lastIndex))
                        {
                            strategyWeights.TryGetValue(name, out var adaptWeight);
                            if (adaptWeight <= 0) adaptWeight = 1.0m;

                            double affinityMultiplier = 1.0;
                            if (affinityLookup.TryGetValue($"{code}_{name}", out var aff))
                            {
                                if (aff.FitLevel == "Optimal") affinityMultiplier = 1.5;
                                else if (aff.FitLevel == "Mismatched") affinityMultiplier = 0.2;
                            }
                            else if (!string.IsNullOrEmpty(industry) && industryLookup.TryGetValue($"{industry}_{name}", out var indAff))
                            {
                                if (indAff.FitRecommendation == "HighlySuitable") affinityMultiplier = 1.25;
                                else if (indAff.FitRecommendation == "Caution") affinityMultiplier = 0.5;
                            }

                            if (!isNoise && affinityMultiplier > 0.3)
                            {
                                double weightedScore = (double)lastVol * (double)adaptWeight * affinityMultiplier;
                                sellCandidates.Add((code, lastClose, lastVol, name, weightedScore));
                            }

                            allMarketSignals.Add(new SignalTrackingItem
                            {
                                SignalDate = targetDate.ToString("yyyy-MM-dd"),
                                StockCode = code,
                                SignalType = "Sell",
                                StrategyName = name,
                                EntryPrice = lastClose,
                                Volume20dAvg = Math.Round(vol20d, 1),
                                IsNoise = isNoise ? 1 : 0,
                                NoiseReason = noiseReason,
                                Status = "Pending"
                            });
                            break;
                        }
                    }
                }
            });

            // 挑選 Top 20 推薦買進
            var top20Buys = buyCandidates
                .OrderByDescending(c => c.WeightedScore)
                .Take(20)
                .ToList();

            foreach (var item in top20Buys)
            {
                allSignals.Add(new DailySignal
                {
                    Date = targetDate,
                    StockCode = item.Code,
                    SignalType = "Buy",
                    StrategyName = item.StrategyName,
                    SuggestedPrice = item.LastClose,
                    LastClose = item.LastClose
                });
            }

            // 挑選 Top 20 推薦賣出
            var top20Sells = sellCandidates
                .OrderByDescending(c => c.WeightedScore)
                .Take(20)
                .ToList();

            foreach (var item in top20Sells)
            {
                allSignals.Add(new DailySignal
                {
                    Date = targetDate,
                    StockCode = item.Code,
                    SignalType = "Sell",
                    StrategyName = item.StrategyName,
                    SuggestedPrice = item.LastClose,
                    LastClose = item.LastClose
                });
            }

            // ==========================================
            // 步驟 6: 批次寫入資料庫
            // ==========================================
            if (allSignals.Any())
            {
                await stockRepo.InsertDailySignalsAsync(allSignals, targetDate);
            }

            if (allMarketSignals.Any())
            {
                await stockRepo.BatchInsertSignalTrackingAsync(allMarketSignals);
            }

            _logger.LogInformation("Daily analysis complete: {HoldingsCount} holdings, {BuyCount} unowned top buys, {SellCount} top sells, {TrackCount} signals tracked.",
                portfolio.Count, top20Buys.Count, top20Sells.Count, allMarketSignals.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed during daily analysis.");
        }
    }

    /// <summary>
    /// 對歷史產生的訊號進行真實走勢迴歸結算 (T+1, T+3, T+5 勝負與報酬)
    /// </summary>
    private async Task VerifyHistoricalSignalsAsync(IStockRepository stockRepo, DateTime currentDate, Dictionary<string, List<OHLCV>> allHistories)
    {
        try
        {
            var pendingSignals = await stockRepo.GetPendingSignalTrackingAsync();
            if (!pendingSignals.Any()) return;

            var updatedSignals = new List<SignalTrackingItem>();

            foreach (var sig in pendingSignals)
            {
                if (!DateTime.TryParse(sig.SignalDate, out var signalDate)) continue;
                if (signalDate.Date >= currentDate.Date) continue; // 當天的訊號次日才能驗證

                // 優先使用記憶體快照比對價格，避免 N+1 磁碟查詢
                List<OHLCV>? forwardPrices = null;
                if (allHistories.TryGetValue(sig.StockCode, out var history))
                {
                    var sigIdx = history.FindIndex(p => p.Date.Date >= signalDate.Date);
                    if (sigIdx >= 0)
                    {
                        forwardPrices = history.Skip(sigIdx).ToList();
                    }
                }

                if (forwardPrices == null || forwardPrices.Count <= 1)
                {
                    forwardPrices = await stockRepo.GetDailyPricesAsync(sig.StockCode, signalDate);
                }

                if (forwardPrices.Count <= 1) continue; // 尚無次日行情

                // 自動補齊流動性與噪聲判定 (若先前未記錄)
                if (sig.Volume20dAvg == 0 && allHistories.TryGetValue(sig.StockCode, out var fullHist))
                {
                    var sigIdxInFull = fullHist.FindIndex(p => p.Date.Date >= signalDate.Date);
                    if (sigIdxInFull >= 0)
                    {
                        var pastWindow = fullHist.Take(sigIdxInFull + 1).TakeLast(20).ToList();
                        if (pastWindow.Any())
                        {
                            sig.Volume20dAvg = Math.Round(pastWindow.Average(p => p.Volume) / 1000m, 1);
                            if (sig.Volume20dAvg < 300m)
                            {
                                sig.IsNoise = 1;
                                sig.NoiseReason = $"低流動性 (20日均量 {sig.Volume20dAvg} 張 < 300張)";
                            }
                        }
                    }
                }

                // 第 0 根為信號日，第 1 根為 T+1 日
                var day1 = forwardPrices[1];
                sig.NextOpen = day1.Open;
                sig.NextClose = day1.Close;

                // 計算 T+1 報酬率 (若是賣出/避開訊號，跌越多視為做空/避險收益越大)
                if (sig.SignalType == "Sell")
                {
                    sig.Return1D = sig.EntryPrice > 0 ? (sig.EntryPrice - day1.Close) / sig.EntryPrice : 0;
                    sig.IsWin = sig.Return1D > 0 ? 1 : 0;
                }
                else
                {
                    sig.Return1D = sig.EntryPrice > 0 ? (day1.Close - sig.EntryPrice) / sig.EntryPrice : 0;
                    sig.IsWin = sig.Return1D > 0 ? 1 : 0;
                }

                // T+3 表現
                if (forwardPrices.Count >= 4)
                {
                    var day3 = forwardPrices[3];
                    sig.Return3D = sig.SignalType == "Sell"
                        ? (sig.EntryPrice - day3.Close) / sig.EntryPrice
                        : (day3.Close - sig.EntryPrice) / sig.EntryPrice;
                }

                // T+5 表現與最大浮盈/浮虧 (MFE / MAE)
                if (forwardPrices.Count >= 6)
                {
                    var day5 = forwardPrices[5];
                    sig.Return5D = sig.SignalType == "Sell"
                        ? (sig.EntryPrice - day5.Close) / sig.EntryPrice
                        : (day5.Close - sig.EntryPrice) / sig.EntryPrice;

                    var window5 = forwardPrices.Skip(1).Take(5).ToList();
                    var maxHigh = window5.Max(b => b.High);
                    var minLow = window5.Min(b => b.Low);

                    sig.MaxReturn5D = (maxHigh - sig.EntryPrice) / sig.EntryPrice;
                    sig.MaxDrawdown5D = (minLow - sig.EntryPrice) / sig.EntryPrice;
                    sig.Status = "Verified";
                }

                updatedSignals.Add(sig);
            }

            if (updatedSignals.Any())
            {
                await stockRepo.BatchUpdateSignalTrackingAsync(updatedSignals);
                _logger.LogInformation("Verified {Count} historical signals against market performance.", updatedSignals.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed during historical signal verification.");
        }
    }
}
