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
            var allHistories = await stockRepo.GetMarketRecentPricesBatchAsync(120);

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
            
            if (!Directory.Exists(strategiesDir))
            {
                _logger.LogWarning("Strategies directory not found at {Path}", strategiesDir);
                return;
            }

            var strategyFiles = Directory.GetFiles(strategiesDir, "*.json");
            var loadedStrategies = new List<(string Name, StrategyConfig Config)>();
            foreach (var file in strategyFiles)
            {
                var strategyName = Path.GetFileNameWithoutExtension(file);
                var json = await File.ReadAllTextAsync(file);
                var config = JsonSerializer.Deserialize<StrategyConfig>(json);
                if (config != null)
                {
                    loadedStrategies.Add((strategyName, config));
                }
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

                var lastIndex = history.Count - 1;
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
            // 步驟 5: 平行運算未持有個股，套用自適應權重推薦 Top 20 買進與賣出
            // ==========================================
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
                var lastIndex = history.Count - 1;
                var lastClose = history[lastIndex].Close;
                var lastVol = history[lastIndex].Volume;

                // 檢測買進條件
                foreach (var (name, config) in loadedStrategies)
                {
                    var entryConditions = (config.Entry != null && config.Entry.Any())
                        ? config.Entry
                        : (config.Screen ?? new List<string>());

                    if (entryConditions.Any() && evaluator.EvaluateAll(entryConditions, history, lastIndex))
                    {
                        // 取得自適應動態權重
                        strategyWeights.TryGetValue(name, out var adaptWeight);
                        if (adaptWeight <= 0) adaptWeight = 1.0m;

                        // 綜合推薦分數 = 成交量 (流動性) * 策略實戰勝率權重
                        double weightedScore = (double)lastVol * (double)adaptWeight;
                        buyCandidates.Add((code, lastClose, lastVol, name, weightedScore));

                        // 收集全市場追蹤清單
                        allMarketSignals.Add(new SignalTrackingItem
                        {
                            SignalDate = targetDate.ToString("yyyy-MM-dd"),
                            StockCode = code,
                            SignalType = "Buy",
                            StrategyName = name,
                            EntryPrice = lastClose,
                            Status = "Pending"
                        });
                        break;
                    }
                }

                // 檢測賣出 / 避開條件
                foreach (var (name, config) in loadedStrategies)
                {
                    if (config.Exit != null && config.Exit.Any())
                    {
                        if (evaluator.EvaluateAll(config.Exit, history, lastIndex))
                        {
                            strategyWeights.TryGetValue(name, out var adaptWeight);
                            if (adaptWeight <= 0) adaptWeight = 1.0m;

                            double weightedScore = (double)lastVol * (double)adaptWeight;
                            sellCandidates.Add((code, lastClose, lastVol, name, weightedScore));

                            allMarketSignals.Add(new SignalTrackingItem
                            {
                                SignalDate = targetDate.ToString("yyyy-MM-dd"),
                                StockCode = code,
                                SignalType = "Sell",
                                StrategyName = name,
                                EntryPrice = lastClose,
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
