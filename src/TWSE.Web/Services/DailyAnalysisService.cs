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
        _logger.LogInformation("Starting daily analysis for {TargetDate:yyyy-MM-dd}...", targetDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var stockRepo = scope.ServiceProvider.GetRequiredService<IStockRepository>();
            var screener = scope.ServiceProvider.GetRequiredService<IScreener>();
            var evaluator = scope.ServiceProvider.GetRequiredService<IConditionEvaluator>();

            // 1. Get strategies
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
            var signals = new List<DailySignal>();

            // 2. Scan all stocks for Buy Signals
            var screenerConfig = new ScreenerConfig { Limit = 30 };
            foreach (var file in strategyFiles)
            {
                var strategyName = Path.GetFileNameWithoutExtension(file);
                var json = await File.ReadAllTextAsync(file);
                var config = JsonSerializer.Deserialize<StrategyConfig>(json);
                if (config == null) continue;

                var entryConditions = (config.Entry != null && config.Entry.Any())
                    ? config.Entry
                    : (config.Screen ?? new List<string>());

                if (!entryConditions.Any()) continue;

                screenerConfig.Screen = entryConditions;
                var matched = await screener.ScanAsync(screenerConfig);

                foreach (var match in matched)
                {
                    // get the latest price directly from history for last_close
                    var history = await stockRepo.GetDailyPricesAsync(match.Code);
                    if (history.Count == 0) continue;
                    
                    var lastClose = history[^1].Close;

                    signals.Add(new DailySignal
                    {
                        Date = targetDate,
                        StockCode = match.Code,
                        SignalType = "Buy",
                        StrategyName = strategyName,
                        SuggestedPrice = lastClose, // In the future this can be an estimated buy price
                        LastClose = lastClose
                    });
                }
            }

            // 3. Scan portfolio for Sell Signals
            var portfolio = await stockRepo.GetPortfolioAsync();
            foreach (var file in strategyFiles)
            {
                var strategyName = Path.GetFileNameWithoutExtension(file);
                var json = await File.ReadAllTextAsync(file);
                var config = JsonSerializer.Deserialize<StrategyConfig>(json);
                if (config == null || config.Exit == null || !config.Exit.Any()) continue;

                foreach (var item in portfolio)
                {
                    // If user specified a strategy for this portfolio item, only evaluate matching strategy
                    if (!string.IsNullOrEmpty(item.SelectedStrategy) &&
                        !item.SelectedStrategy.Equals(Path.GetFileName(file), StringComparison.OrdinalIgnoreCase) &&
                        !item.SelectedStrategy.Equals(strategyName, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var history = await stockRepo.GetDailyPricesAsync(item.StockCode);
                    if (history.Count == 0) continue;

                    var lastIndex = history.Count - 1;
                    if (evaluator.EvaluateAll(config.Exit, history, lastIndex))
                    {
                        signals.Add(new DailySignal
                        {
                            Date = targetDate,
                            StockCode = item.StockCode,
                            SignalType = "Sell",
                            StrategyName = strategyName,
                            SuggestedPrice = history[lastIndex].Close,
                            LastClose = history[lastIndex].Close
                        });
                    }
                }
            }

            // 4. Save to Database
            if (signals.Any())
            {
                await stockRepo.InsertDailySignalsAsync(signals, targetDate);
                _logger.LogInformation("Successfully inserted {Count} signals into the daily_signals table for {Date:yyyy-MM-dd}.", signals.Count, targetDate);
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
