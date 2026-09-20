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
        _logger.LogInformation("Starting daily analysis for {TargetDate:yyyy-MM-dd} (Holdings + Unowned Top 20 Buy/Sell)...", targetDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var stockRepo = scope.ServiceProvider.GetRequiredService<IStockRepository>();
            var evaluator = scope.ServiceProvider.GetRequiredService<IConditionEvaluator>();

            // 1. 取得策略目錄
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

            // 載入所有策略 JSON
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

            var allSignals = new List<DailySignal>();

            // 2. 目前持股的操作分析 (Portfolio Analysis)
            var portfolio = await stockRepo.GetPortfolioAsync();
            var portfolioCodes = portfolio.Select(p => p.StockCode).ToHashSet();

            foreach (var item in portfolio)
            {
                var history = await stockRepo.GetDailyPricesAsync(item.StockCode);
                if (history.Count == 0) continue;

                var lastIndex = history.Count - 1;
                var lastClose = history[lastIndex].Close;

                string action = "Hold";
                string? triggeredStrategy = null;

                // 先檢測 Exit 條件 (出場優先)
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

                // 若未觸發出場，檢測 Entry 條件 (加碼買進)
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
                    SignalType = action, // "Hold", "Buy", "Sell"
                    StrategyName = triggeredStrategy ?? "持股操作診斷",
                    SuggestedPrice = lastClose,
                    LastClose = lastClose
                });
            }

            // 3. 掃描未持有股票，篩選出最推薦買進 (Top 20) 與最推薦賣出 (Top 20)
            var activeCodes = await stockRepo.GetStockCodesWithPricesAsync();
            var unownedCodes = activeCodes.Where(code => !portfolioCodes.Contains(code)).ToList();

            var buyCandidates = new List<(string Code, decimal LastClose, decimal Volume, string StrategyName, double Score)>();
            var sellCandidates = new List<(string Code, decimal LastClose, decimal Volume, string StrategyName, double Score)>();

            foreach (var code in unownedCodes)
            {
                var history = await stockRepo.GetDailyPricesAsync(code);
                if (history.Count < 20) continue; // 至少需 20 根 K 棒以計算均線與指標

                var lastIndex = history.Count - 1;
                var lastClose = history[lastIndex].Close;
                var lastVol = history[lastIndex].Volume;

                // 檢測推薦買進 (Entry)
                foreach (var (name, config) in loadedStrategies)
                {
                    var entryConditions = (config.Entry != null && config.Entry.Any())
                        ? config.Entry
                        : (config.Screen ?? new List<string>());

                    if (entryConditions.Any() && evaluator.EvaluateAll(entryConditions, history, lastIndex))
                    {
                        // 評分機制：以成交量與流動性作為主要排序依據
                        double score = (double)lastVol;
                        buyCandidates.Add((code, lastClose, lastVol, name, score));
                        break;
                    }
                }

                // 檢測推薦賣出 / 避開 (Exit)
                foreach (var (name, config) in loadedStrategies)
                {
                    if (config.Exit != null && config.Exit.Any())
                    {
                        if (evaluator.EvaluateAll(config.Exit, history, lastIndex))
                        {
                            double score = (double)lastVol;
                            sellCandidates.Add((code, lastClose, lastVol, name, score));
                            break;
                        }
                    }
                }
            }

            // 取 Top 20 推薦買進 (依成交量/流動性排序)
            var top20Buys = buyCandidates
                .OrderByDescending(c => c.Score)
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

            // 取 Top 20 推薦賣出 (依成交量/活躍度排序)
            var top20Sells = sellCandidates
                .OrderByDescending(c => c.Score)
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

            // 4. 存入資料庫
            if (allSignals.Any())
            {
                await stockRepo.InsertDailySignalsAsync(allSignals, targetDate);
                _logger.LogInformation("Daily analysis finished: {HoldingsCount} holdings evaluated, {BuyCount} unowned buys, {SellCount} unowned sells recorded for {Date:yyyy-MM-dd}.",
                    portfolio.Count, top20Buys.Count, top20Sells.Count, targetDate);
            }
            else
            {
                _logger.LogInformation("No signals generated for {Date:yyyy-MM-dd}.", targetDate);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed during daily analysis.");
        }
    }
}
