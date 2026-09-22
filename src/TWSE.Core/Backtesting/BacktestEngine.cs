using TWSE.Core.Models;
using TWSE.Core.Screening;

namespace TWSE.Core.Backtesting;

public class BacktestEngine : IBacktestEngine
{
    private readonly IConditionEvaluator _evaluator;

    public BacktestEngine(IConditionEvaluator evaluator)
    {
        _evaluator = evaluator;
    }

    public Task<BacktestResult> RunAsync(string stockCode, StrategyConfig config, IReadOnlyList<OHLCV> history)
    {
        return RunComboAsync(stockCode, new List<StrategyConfig> { config }, "AND", 100, config.Backtest, history);
    }

    public Task<BacktestResult> RunComboAsync(
        string stockCode,
        List<StrategyConfig> configs,
        string logicMode,
        double minScorePercent,
        BacktestParams backtestParams,
        IReadOnlyList<OHLCV> history)
    {
        var result = new BacktestResult
        {
            StockCode = stockCode,
            InitialCapital = backtestParams.InitialCapital,
            FinalCapital = backtestParams.InitialCapital
        };

        if (history.Count < 2 || configs == null || !configs.Any()) return Task.FromResult(result);

        DateTime? startDate = DateTime.TryParse(backtestParams.StartDate, out var sd) ? sd.Date : null;
        DateTime? endDate = DateTime.TryParse(backtestParams.EndDate, out var ed) ? ed.Date : null;

        // Find the index where evaluation starts (preserving previous data for indicator warmup)
        int startIndex = 0;
        if (startDate.HasValue)
        {
            startIndex = -1;
            for (int k = 0; k < history.Count; k++)
            {
                if (history[k].Date.Date >= startDate.Value)
                {
                    startIndex = k;
                    break;
                }
            }
            if (startIndex < 0 || startIndex >= history.Count - 1)
            {
                return Task.FromResult(result); // No data within test window
            }
        }

        int endIndex = history.Count - 1;
        if (endDate.HasValue)
        {
            for (int k = history.Count - 1; k >= startIndex; k--)
            {
                if (history[k].Date.Date <= endDate.Value)
                {
                    endIndex = k;
                    break;
                }
            }
        }

        if (endIndex <= startIndex) return Task.FromResult(result);

        decimal cash = result.InitialCapital;
        TradeRecord? openTrade = null;
        decimal peakCapital = cash;
        decimal maxDrawdown = 0;
        var dailyReturns = new List<decimal>();
        decimal previousEquity = cash;

        for (int i = startIndex; i <= endIndex; i++)
        {
            var currentDay = history[i];

            // Mark-to-market daily equity (Cash + Current Holding Market Value)
            decimal dailyEquity = cash + (openTrade != null ? openTrade.Quantity * currentDay.Close : 0m);

            if (i > startIndex && previousEquity > 0)
            {
                decimal dailyReturn = (dailyEquity - previousEquity) / previousEquity;
                dailyReturns.Add(dailyReturn);
            }
            previousEquity = dailyEquity;

            if (dailyEquity > peakCapital) peakCapital = dailyEquity;
            decimal drawdown = peakCapital > 0 ? (peakCapital - dailyEquity) / peakCapital : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;

            // Signal evaluation and execution for the next trading day
            if (i < endIndex)
            {
                var nextDay = history[i + 1];

                if (openTrade == null)
                {
                    // Multi-strategy entry condition evaluation
                    int matchedEntries = 0;
                    foreach (var cfg in configs)
                    {
                        var entryList = (cfg.Entry != null && cfg.Entry.Any())
                            ? cfg.Entry
                            : (cfg.Screen ?? new List<string>());

                        if (entryList.Any() && _evaluator.EvaluateAll(entryList, history, i))
                        {
                            matchedEntries++;
                        }
                    }

                    double score = (double)matchedEntries / configs.Count * 100.0;
                    bool isBuy = logicMode.ToUpperInvariant() switch
                    {
                        "AND" => matchedEntries == configs.Count,
                        "OR" => matchedEntries > 0,
                        "SCORE" => score >= minScorePercent,
                        _ => matchedEntries == configs.Count
                    };

                    if (isBuy)
                    {
                        decimal price = nextDay.Open;
                        if (price > 0)
                        {
                            int maxShares = (int)(backtestParams.PositionSize / price);
                            int quantity = (maxShares / 1000) * 1000;

                            if (quantity == 0 && cash >= price * 1000 && backtestParams.PositionSize >= price)
                            {
                                quantity = 1000; // Allow at least 1 unit if funds permit
                            }

                            if (quantity > 0 && cash >= quantity * price)
                            {
                                openTrade = new TradeRecord
                                {
                                    StockCode = stockCode,
                                    BuyDate = nextDay.Date,
                                    BuyPrice = price,
                                    Quantity = quantity,
                                    CommissionRate = backtestParams.CommissionRate,
                                    TaxRate = backtestParams.TaxRate
                                };
                                cash -= openTrade.TotalCost;
                            }
                        }
                    }
                }
                else
                {
                    // Multi-strategy exit condition evaluation (any strategy triggering exit exits trade)
                    bool isSell = configs.Any(cfg => cfg.Exit != null && cfg.Exit.Any() && _evaluator.EvaluateAll(cfg.Exit, history, i));

                    if (isSell)
                    {
                        decimal price = nextDay.Open;
                        if (price > 0)
                        {
                            openTrade.SellDate = nextDay.Date;
                            openTrade.SellPrice = price;

                            cash += openTrade.TotalRevenue ?? 0;
                            result.Trades.Add(openTrade);
                            openTrade = null;
                        }
                    }
                }
            }
        }

        // Force close at the end of the backtest period if still open
        if (openTrade != null)
        {
            var lastDay = history[endIndex];
            openTrade.SellDate = lastDay.Date;
            openTrade.SellPrice = lastDay.Close;
            cash += openTrade.TotalRevenue ?? 0;
            result.Trades.Add(openTrade);
            openTrade = null;
        }

        result.FinalCapital = cash;
        result.MaxDrawdown = maxDrawdown;

        // Calculate Annualized Return based on test window span
        double days = (history[endIndex].Date - history[startIndex].Date).TotalDays;
        if (days > 0 && (1 + result.TotalReturn) > 0)
        {
            result.AnnualizedReturn = (decimal)(Math.Pow((double)(1 + result.TotalReturn), 365.0 / days) - 1);
        }

        // Calculate Annualized Sharpe Ratio based on daily equity returns
        if (dailyReturns.Count > 1)
        {
            decimal avgDailyReturn = dailyReturns.Average();
            decimal sumOfSquares = dailyReturns.Select(val => (val - avgDailyReturn) * (val - avgDailyReturn)).Sum();
            decimal stdDev = (decimal)Math.Sqrt((double)sumOfSquares / (dailyReturns.Count - 1));

            if (stdDev > 0)
            {
                result.SharpeRatio = (avgDailyReturn / stdDev) * (decimal)Math.Sqrt(252);
            }
        }

        return Task.FromResult(result);
    }

    public async Task<List<BacktestResult>> ScanAllAsync(StrategyConfig config, Dictionary<string, IReadOnlyList<OHLCV>> allHistories)
    {
        var results = new List<BacktestResult>();
        foreach (var kvp in allHistories)
        {
            results.Add(await RunAsync(kvp.Key, config, kvp.Value));
        }

        // Sort by Total Return descending
        return results.OrderByDescending(r => r.TotalReturn).ToList();
    }
}
