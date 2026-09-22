using System.Collections.Concurrent;
using System.Text.Json;
using TWSE.Core.Data;
using TWSE.Core.Models;
using TWSE.Core.Screening;

namespace TWSE.Web.Services;

public class HistoricalReplayService
{
    private readonly IStockRepository _stockRepo;
    private readonly IConditionEvaluator _evaluator;
    private readonly ILogger<HistoricalReplayService> _logger;

    private readonly object _lock = new();
    private CancellationTokenSource? _cts;
    private SimulationStatus _status = new();
    private SimulationSummary? _latestSummary;

    public HistoricalReplayService(
        IStockRepository stockRepo,
        IConditionEvaluator evaluator,
        ILogger<HistoricalReplayService> logger)
    {
        _stockRepo = stockRepo;
        _evaluator = evaluator;
        _logger = logger;
    }

    public SimulationStatus GetStatus()
    {
        lock (_lock)
        {
            if (_status.Status == "Running" && _status.StartTime.HasValue)
            {
                _status.ElapsedSeconds = Math.Round((DateTime.Now - _status.StartTime.Value).TotalSeconds, 1);
            }
            return _status;
        }
    }

    public SimulationSummary? GetLatestSummary()
    {
        lock (_lock)
        {
            return _latestSummary;
        }
    }

    public void CancelSimulation()
    {
        lock (_lock)
        {
            if (_status.Status == "Running")
            {
                _cts?.Cancel();
                _status.Status = "Cancelled";
                _status.Message = "使用者已手動終止歷史回放模擬";
                _status.FinishTime = DateTime.Now;
            }
        }
    }

    public SimulationStatus StartSimulation(SimulationRequest request)
    {
        lock (_lock)
        {
            if (_status.Status == "Running")
            {
                return _status;
            }

            _cts?.Cancel();
            _cts = new CancellationTokenSource();
            var token = _cts.Token;

            var simId = Guid.NewGuid().ToString("N")[..8];
            _status = new SimulationStatus
            {
                SimulationId = simId,
                Status = "Running",
                Message = "正在初始化歷史回放模擬引擎...",
                ProgressPercentage = 0,
                StartTime = DateTime.Now,
                CurrentDate = request.StartDate.ToString("yyyy-MM-dd")
            };

            Task.Run(async () => await RunWalkForwardSimulationAsync(simId, request, token), token);
            return _status;
        }
    }

    private async Task RunWalkForwardSimulationAsync(string simId, SimulationRequest request, CancellationToken token)
    {
        var startTime = DateTime.Now;
        _logger.LogInformation("Starting Walk-Forward Historical Simulation [{SimId}] from {Start:yyyy-MM-dd} to {End:yyyy-MM-dd}...",
            simId, request.StartDate, request.EndDate);

        try
        {
            // 1. 載入策略配置
            UpdateStatus(s => { s.Message = "正在載入多策略邏輯模型..."; });
            var loadedStrategies = await LoadStrategiesAsync(request.SelectedStrategies);
            if (!loadedStrategies.Any())
            {
                throw new InvalidOperationException("未找到可執行的策略配置檔案 (strategies/*.json)");
            }

            // 2. 批次載入全市場歷史資料 (涵蓋暖機緩衝區 180 天)
            UpdateStatus(s => { s.Message = "正在載入全市場歷史日線數據 (請稍候)..."; });
            var warmupStart = request.StartDate.AddDays(-180);
            var allHistories = await _stockRepo.GetHistoricalPricesRangeBatchAsync(warmupStart, request.EndDate);
            var allStocks = (await _stockRepo.GetAllStocksAsync())
                .ToDictionary(st => st.Code, st => st, StringComparer.OrdinalIgnoreCase);

            if (!allHistories.Any())
            {
                throw new InvalidOperationException("歷史資料庫中無此時間區間的行情數據");
            }

            // 3. 彙整回放期間內所有有效交易日 (依日期升冪排序)
            var tradingDays = allHistories.Values
                .SelectMany(list => list.Select(p => p.Date.Date))
                .Where(d => d >= request.StartDate.Date && d <= request.EndDate.Date)
                .Distinct()
                .OrderBy(d => d)
                .ToList();

            if (!tradingDays.Any())
            {
                throw new InvalidOperationException("指定區間內無交易日資料");
            }

            UpdateStatus(s =>
            {
                s.TotalTradingDays = tradingDays.Count;
                s.Message = $"已載入 {allHistories.Count} 檔標的，共 {tradingDays.Count} 個歷史交易日。開始逐日滾動計算...";
            });

            // 4. 平行化計算個股全時段訊號與前向結算
            // 由於各策略條件與指標為因果性質 (Causal)，在單一股票時間序列上評估 index i 等同於當日在回放點的評估。
            var generatedSignals = new ConcurrentBag<SignalTrackingItem>();
            int processedStockCount = 0;
            int totalStocks = allHistories.Count;

            var parallelOptions = new ParallelOptions
            {
                CancellationToken = token,
                MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount - 1)
            };

            Parallel.ForEach(allHistories, parallelOptions, kvp =>
            {
                token.ThrowIfCancellationRequested();
                var stockCode = kvp.Key;
                var history = kvp.Value;

                if (history.Count < 20) return;

                // 建立該股票日期至 index 的對照
                for (int i = 0; i < history.Count; i++)
                {
                    var bar = history[i];
                    var barDate = bar.Date.Date;
                    if (barDate < request.StartDate.Date || barDate > request.EndDate.Date) continue;
                    if (i < 20) continue; // 需要至少 20 根 K 線計算均量與指標

                    // 1. 流動性與噪聲判定 (20日均量 < 門檻視為冷門假突破噪聲)
                    var past20 = history.Skip(Math.Max(0, i - 19)).Take(20).ToList();
                    var vol20d = past20.Any() ? past20.Average(p => p.Volume) / 1000m : bar.Volume / 1000m;
                    bool isNoise = vol20d < request.Min20dVolume;
                    string? noiseReason = isNoise ? $"20日均量不足 {request.Min20dVolume} 張 (冷門股)" : null;

                    // 2. 檢測買進條件
                    foreach (var (stratName, config) in loadedStrategies)
                    {
                        var entryConditions = (config.Entry != null && config.Entry.Any())
                            ? config.Entry
                            : (config.Screen ?? new List<string>());

                        if (entryConditions.Any() && _evaluator.EvaluateAll(entryConditions, history, i))
                        {
                            var sig = new SignalTrackingItem
                            {
                                SignalDate = barDate.ToString("yyyy-MM-dd"),
                                StockCode = stockCode,
                                SignalType = "Buy",
                                StrategyName = stratName,
                                EntryPrice = bar.Close,
                                Volume20dAvg = Math.Round(vol20d, 1),
                                IsNoise = isNoise ? 1 : 0,
                                NoiseReason = noiseReason,
                                Status = "Pending"
                            };

                            // 前向走勢結算 (Forward Verification: T+1, T+3, T+5)
                            SettleSignalForward(sig, history, i);
                            generatedSignals.Add(sig);
                            break; // 該標的當天避免重複觸發同向訊號
                        }
                    }

                    // 3. 檢測賣出 / 避開條件
                    foreach (var (stratName, config) in loadedStrategies)
                    {
                        if (config.Exit != null && config.Exit.Any())
                        {
                            if (_evaluator.EvaluateAll(config.Exit, history, i))
                            {
                                var sig = new SignalTrackingItem
                                {
                                    SignalDate = barDate.ToString("yyyy-MM-dd"),
                                    StockCode = stockCode,
                                    SignalType = "Sell",
                                    StrategyName = stratName,
                                    EntryPrice = bar.Close,
                                    Volume20dAvg = Math.Round(vol20d, 1),
                                    IsNoise = isNoise ? 1 : 0,
                                    NoiseReason = noiseReason,
                                    Status = "Pending"
                                };

                                SettleSignalForward(sig, history, i);
                                generatedSignals.Add(sig);
                                break;
                            }
                        }
                    }
                }

                var currentCount = Interlocked.Increment(ref processedStockCount);
                if (currentCount % 200 == 0 || currentCount == totalStocks)
                {
                    UpdateStatus(s =>
                    {
                        s.ProgressPercentage = Math.Round((double)currentCount / totalStocks * 80.0, 1);
                        s.TotalSignalsGenerated = generatedSignals.Count;
                        s.Message = $"已完成 {currentCount}/{totalStocks} 檔標的歷史前向迴歸運算...";
                    });
                }
            });

            token.ThrowIfCancellationRequested();

            // 5. 滾動時間軸模擬推進與統計聚合 (80% -> 100%)
            var signalList = generatedSignals.ToList();
            UpdateStatus(s =>
            {
                s.ProgressPercentage = 85;
                s.Message = "正在彙整歷年逐季勝率、自適應權重與最適投資組合矩陣...";
            });

            var summary = BuildSimulationSummary(simId, request, signalList, tradingDays, allStocks, startTime);

            UpdateStatus(s =>
            {
                s.Status = "Completed";
                s.ProgressPercentage = 100;
                s.ProcessedTradingDays = tradingDays.Count;
                s.TotalSignalsGenerated = signalList.Count;
                s.SettledSignalsCount = signalList.Count(x => x.Status == "Verified");
                s.FinishTime = DateTime.Now;
                s.ElapsedSeconds = Math.Round((DateTime.Now - startTime).TotalSeconds, 1);
                s.Message = $"歷史滾動回放模擬完成！共驗證 {tradingDays.Count} 個交易日、{signalList.Count} 筆訊號。";
            });

            lock (_lock)
            {
                _latestSummary = summary;
            }

            _logger.LogInformation("Historical simulation [{SimId}] finished in {Elapsed:F1}s with {Count} signals.",
                simId, (DateTime.Now - startTime).TotalSeconds, signalList.Count);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Simulation [{SimId}] was cancelled by user.", simId);
            UpdateStatus(s =>
            {
                s.Status = "Cancelled";
                s.Message = "歷史回放已被使用者終止";
                s.FinishTime = DateTime.Now;
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Historical simulation [{SimId}] failed.", simId);
            UpdateStatus(s =>
            {
                s.Status = "Failed";
                s.Error = ex.Message;
                s.Message = $"模擬失敗: {ex.Message}";
                s.FinishTime = DateTime.Now;
            });
        }
    }

    private static void SettleSignalForward(SignalTrackingItem sig, List<OHLCV> history, int signalIndex)
    {
        // 第 0 根為信號日，第 1 根為 T+1 日
        if (signalIndex + 1 < history.Count)
        {
            var day1 = history[signalIndex + 1];
            sig.NextOpen = day1.Open;
            sig.NextClose = day1.Close;

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
        }

        if (signalIndex + 3 < history.Count)
        {
            var day3 = history[signalIndex + 3];
            sig.Return3D = sig.SignalType == "Sell"
                ? (sig.EntryPrice - day3.Close) / sig.EntryPrice
                : (day3.Close - sig.EntryPrice) / sig.EntryPrice;
        }

        if (signalIndex + 5 < history.Count)
        {
            var day5 = history[signalIndex + 5];
            sig.Return5D = sig.SignalType == "Sell"
                ? (sig.EntryPrice - day5.Close) / sig.EntryPrice
                : (day5.Close - sig.EntryPrice) / sig.EntryPrice;

            var window5 = history.Skip(signalIndex + 1).Take(5).ToList();
            if (window5.Any())
            {
                var maxHigh = window5.Max(b => b.High);
                var minLow = window5.Min(b => b.Low);

                sig.MaxReturn5D = (maxHigh - sig.EntryPrice) / sig.EntryPrice;
                sig.MaxDrawdown5D = (minLow - sig.EntryPrice) / sig.EntryPrice;
                sig.Status = "Verified";
            }
        }
    }

    private SimulationSummary BuildSimulationSummary(
        string simId,
        SimulationRequest request,
        List<SignalTrackingItem> signals,
        List<DateTime> tradingDays,
        Dictionary<string, StockInfo> allStocks,
        DateTime startTime)
    {
        var cleanSignals = signals.Where(s => s.IsNoise == 0).ToList();
        var noiseSignals = signals.Where(s => s.IsNoise == 1).ToList();
        var verifiedClean = cleanSignals.Where(s => s.Status == "Verified").ToList();

        // 1. 全局指標計算
        int totalCleanWins = cleanSignals.Count(s => s.IsWin == 1);
        int totalRawWins = signals.Count(s => s.IsWin == 1);

        double overallCleanWinRate = cleanSignals.Any()
            ? Math.Round((double)totalCleanWins / cleanSignals.Count * 100.0, 1)
            : 0;

        double overallRawWinRate = signals.Any()
            ? Math.Round((double)totalRawWins / signals.Count * 100.0, 1)
            : 0;

        double avgRet1D = cleanSignals.Any() ? Math.Round((double)cleanSignals.Average(s => s.Return1D) * 100.0, 2) : 0;
        double avgRet3D = cleanSignals.Where(s => s.Return3D.HasValue).DefaultIfEmpty().Average(s => (double)(s?.Return3D ?? 0)) * 100.0;
        double avgRet5D = cleanSignals.Where(s => s.Return5D.HasValue).DefaultIfEmpty().Average(s => (double)(s?.Return5D ?? 0)) * 100.0;

        // 計算整體獲利因子 (Profit Factor)
        var grossProfit = cleanSignals.Where(s => (s.Return5D ?? s.Return1D) > 0).Sum(s => (double)(s.Return5D.HasValue ? s.Return5D.Value : s.Return1D));
        var grossLoss = Math.Abs(cleanSignals.Where(s => (s.Return5D ?? s.Return1D) < 0).Sum(s => (double)(s.Return5D.HasValue ? s.Return5D.Value : s.Return1D)));
        double overallProfitFactor = grossLoss > 0.0001 ? Math.Round(grossProfit / grossLoss, 2) : (grossProfit > 0 ? 99.0 : 1.0);

        // 2. 歷年逐季勝率走勢統計 (Quarterly Performance Trends)
        var quarterlyGroups = signals
            .GroupBy(s =>
            {
                if (DateTime.TryParse(s.SignalDate, out var dt))
                {
                    int q = (dt.Month - 1) / 3 + 1;
                    return (dt.Year, QuarterNumber: q, Key: $"{dt.Year}-Q{q}");
                }
                return (Year: 2020, QuarterNumber: 1, Key: "2020-Q1");
            })
            .OrderBy(g => g.Key.Year)
            .ThenBy(g => g.Key.QuarterNumber)
            .ToList();

        var quarterlyTrends = new List<QuarterlyPerformance>();
        foreach (var qg in quarterlyGroups)
        {
            var qSignals = qg.ToList();
            var qClean = qSignals.Where(s => s.IsNoise == 0).ToList();
            var qNoise = qSignals.Where(s => s.IsNoise == 1).ToList();

            int qWins = qClean.Count(s => s.IsWin == 1);
            int qRawWins = qSignals.Count(s => s.IsWin == 1);

            double qCleanWinRate = qClean.Any() ? Math.Round((double)qWins / qClean.Count * 100.0, 1) : 0;
            double qRawWinRate = qSignals.Any() ? Math.Round((double)qRawWins / qSignals.Count * 100.0, 1) : 0;

            double qRet1D = qClean.Any() ? Math.Round((double)qClean.Average(s => s.Return1D) * 100.0, 2) : 0;
            double qRet3D = qClean.Where(s => s.Return3D.HasValue).DefaultIfEmpty().Average(s => (double)(s != null && s.Return3D.HasValue ? s.Return3D.Value : 0)) * 100.0;
            double qRet5D = qClean.Where(s => s.Return5D.HasValue).DefaultIfEmpty().Average(s => (double)(s != null && s.Return5D.HasValue ? s.Return5D.Value : 0)) * 100.0;

            var qProfit = qClean.Where(s => (s.Return5D ?? s.Return1D) > 0).Sum(s => (double)(s.Return5D.HasValue ? s.Return5D.Value : s.Return1D));
            var qLoss = Math.Abs(qClean.Where(s => (s.Return5D ?? s.Return1D) < 0).Sum(s => (double)(s.Return5D.HasValue ? s.Return5D.Value : s.Return1D)));
            double qProfitFactor = qLoss > 0.0001 ? Math.Round(qProfit / qLoss, 2) : (qProfit > 0 ? 10.0 : 1.0);

            // 判斷該季度市場特徵標籤
            string trendTag = "區間震盪整理 ⚖️";
            if (qRet5D >= 3.5) trendTag = "大多頭主升段 🔥";
            else if (qRet5D > 1.0) trendTag = "溫和震盪偏多 📈";
            else if (qRet5D <= -3.0) trendTag = "空頭劇烈修正 🌧️";
            else if (qRet5D < 0) trendTag = "弱勢防守階段 🛡️";

            quarterlyTrends.Add(new QuarterlyPerformance
            {
                Quarter = qg.Key.Key,
                Year = qg.Key.Year,
                QuarterNumber = qg.Key.QuarterNumber,
                TotalSignals = qSignals.Count,
                CleanSignals = qClean.Count,
                NoiseSignals = qNoise.Count,
                WinSignals = qWins,
                CleanWinRate = qCleanWinRate,
                RawWinRate = qRawWinRate,
                AvgReturn1D = qRet1D,
                AvgReturn3D = Math.Round(qRet3D, 2),
                AvgReturn5D = Math.Round(qRet5D, 2),
                ProfitFactor = qProfitFactor,
                MarketTrend = trendTag
            });
        }

        // 3. 各策略歷史表現統計
        var strategyMetrics = signals
            .GroupBy(s => s.StrategyName)
            .Select(g =>
            {
                var stSignals = g.ToList();
                var stClean = stSignals.Where(s => s.IsNoise == 0).ToList();
                var stNoise = stSignals.Where(s => s.IsNoise == 1).ToList();

                int cleanWins = stClean.Count(s => s.IsWin == 1);
                double cleanWinRate = stClean.Any() ? Math.Round((double)cleanWins / stClean.Count * 100.0, 1) : 0;
                double rawWinRate = stSignals.Any() ? Math.Round((double)stSignals.Count(s => s.IsWin == 1) / stSignals.Count * 100.0, 1) : 0;

                double avgPnl = stClean.Any()
                    ? Math.Round((double)stClean.Average(s => s.Return5D.HasValue ? s.Return5D.Value : s.Return1D) * 100.0, 2)
                    : 0;

                // 動態權重
                decimal weight = 1.0m;
                if (cleanWinRate >= 65 && avgPnl > 2.0) weight = 1.4m;
                else if (cleanWinRate >= 55) weight = 1.15m;
                else if (cleanWinRate < 45) weight = 0.7m;

                return new StrategyPerformanceMetric
                {
                    StrategyName = g.Key,
                    TotalSignals = stSignals.Count,
                    VerifiedSignals = stClean.Count(s => s.Status == "Verified"),
                    CleanSignals = stClean.Count,
                    NoiseCount = stNoise.Count,
                    WinCount = cleanWins,
                    WinRate = (decimal)cleanWinRate,
                    RawWinRate = (decimal)rawWinRate,
                    AvgReturn1D = (decimal)(stClean.Any() ? stClean.Average(s => s.Return1D) * 100.0m : 0m),
                    AvgReturn3D = (decimal)avgPnl,
                    ProfitFactor = (decimal)overallProfitFactor,
                    AdaptiveWeight = weight,
                    StatusRecommendation = cleanWinRate >= 60 ? "ScaledUp" : (cleanWinRate < 45 ? "Demoted" : "Active"),
                    DedicatedUniverseCount = 0
                };
            })
            .OrderByDescending(m => m.WinRate)
            .ToList();

        // 4. 個股 × 策略歷史最適適配排行榜 (Top Stock Affinities)
        var stockAffinities = cleanSignals
            .GroupBy(s => (s.StockCode, s.StrategyName))
            .Where(g => g.Count() >= 5) // 至少出現 5 次訊號具備統計顯著性
            .Select(g =>
            {
                var list = g.ToList();
                int wins = list.Count(s => s.IsWin == 1);
                double winRate = Math.Round((double)wins / list.Count * 100.0, 1);
                double avgPnl = Math.Round((double)list.Average(s => s.Return5D.HasValue ? s.Return5D.Value : s.Return1D) * 100.0, 2);

                allStocks.TryGetValue(g.Key.StockCode, out var sInfo);
                var pnlFactor = Math.Min(avgPnl / 5.0, 1.0) * 40.0;
                var score = Math.Round((winRate / 100.0 * 60.0) + Math.Max(0, pnlFactor), 1);

                string fitLevel = "Good";
                if (score >= 70 && winRate >= 65) fitLevel = "Optimal";
                else if (score < 40 && winRate < 40) fitLevel = "Mismatched";

                return new StockStrategyAffinity
                {
                    StockCode = g.Key.StockCode,
                    StockName = sInfo?.Name ?? "個股",
                    Industry = sInfo?.Industry ?? "",
                    StrategyName = g.Key.StrategyName,
                    SampleCount = list.Count,
                    WinCount = wins,
                    WinRate = (decimal)winRate,
                    AvgReturn1D = (decimal)(list.Average(s => s.Return1D) * 100.0m),
                    ProfitFactor = (decimal)(pnlFactor / 10.0),
                    AffinityScore = (decimal)score,
                    FitLevel = fitLevel,
                    IsRecommendedUniverse = fitLevel == "Optimal"
                };
            })
            .OrderByDescending(a => a.AffinityScore)
            .Take(100)
            .ToList();

        // 5. 產業族群 × 策略歷史適配排行榜
        var industryAffinities = cleanSignals
            .Where(s => allStocks.ContainsKey(s.StockCode) && !string.IsNullOrEmpty(allStocks[s.StockCode].Industry))
            .GroupBy(s => (allStocks[s.StockCode].Industry, s.StrategyName))
            .Where(g => g.Count() >= 8)
            .Select(g =>
            {
                var list = g.ToList();
                int wins = list.Count(s => s.IsWin == 1);
                double winRate = Math.Round((double)wins / list.Count * 100.0, 1);
                double avgPnl = Math.Round((double)list.Average(s => s.Return5D.HasValue ? s.Return5D.Value : s.Return1D) * 100.0, 2);

                string rec = "Suitable";
                if (winRate >= 60 && avgPnl >= 1.5) rec = "HighlySuitable";
                else if (winRate < 45 || avgPnl < -0.5) rec = "Caution";

                return new IndustryStrategyAffinity
                {
                    Industry = g.Key.Industry,
                    StrategyName = g.Key.StrategyName,
                    SampleCount = list.Count,
                    WinCount = wins,
                    WinRate = (decimal)winRate,
                    AvgReturn1D = (decimal)(list.Average(s => s.Return1D) * 100.0m),
                    ProfitFactor = (decimal)(Math.Max(0.5, 1.0 + avgPnl / 10.0)),
                    FitRecommendation = rec
                };
            })
            .OrderByDescending(i => i.WinRate)
            .ToList();

        return new SimulationSummary
        {
            SimulationId = simId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            TotalTradingDays = tradingDays.Count,
            TotalSignalsGenerated = signals.Count,
            TotalNoiseIsolated = noiseSignals.Count,
            TotalCleanSignals = cleanSignals.Count,
            OverallCleanWinRate = overallCleanWinRate,
            OverallRawWinRate = overallRawWinRate,
            OverallAvgReturn1D = avgRet1D,
            OverallAvgReturn3D = Math.Round(avgRet3D, 2),
            OverallAvgReturn5D = Math.Round(avgRet5D, 2),
            OverallProfitFactor = overallProfitFactor,
            TotalExecutionSeconds = Math.Round((DateTime.Now - startTime).TotalSeconds, 1),
            QuarterlyTrends = quarterlyTrends,
            StrategyPerformances = strategyMetrics,
            TopStockAffinities = stockAffinities,
            IndustryAffinities = industryAffinities
        };
    }

    private void UpdateStatus(Action<SimulationStatus> updateAction)
    {
        lock (_lock)
        {
            updateAction(_status);
        }
    }

    private async Task<List<(string Name, StrategyConfig Config)>> LoadStrategiesAsync(List<string>? selectedStrategies)
    {
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
            return new List<(string, StrategyConfig)>();
        }

        var selectedSet = selectedStrategies != null && selectedStrategies.Any()
            ? new HashSet<string>(selectedStrategies, StringComparer.OrdinalIgnoreCase)
            : null;

        var files = Directory.GetFiles(strategiesDir, "*.json");
        var list = new List<(string, StrategyConfig)>();
        foreach (var file in files)
        {
            var stratName = Path.GetFileNameWithoutExtension(file);
            if (selectedSet != null && !selectedSet.Contains(stratName)) continue;

            var json = await File.ReadAllTextAsync(file);
            var cfg = JsonSerializer.Deserialize<StrategyConfig>(json);
            if (cfg != null)
            {
                list.Add((stratName, cfg));
            }
        }
        return list;
    }
}
