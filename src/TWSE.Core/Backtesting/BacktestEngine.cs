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

        // Run continuous simulation through the entire history to establish the canonical trade record
        decimal initialCash = backtestParams.InitialCapital > 0 ? backtestParams.InitialCapital : 1000000m;
        decimal positionSize = backtestParams.PositionSize > 0 ? backtestParams.PositionSize : initialCash;
        decimal cash = initialCash;
        TradeRecord? openTrade = null;
        var allTrades = new List<TradeRecord>();
        var dailyEquities = new List<decimal>();

        for (int i = 0; i < history.Count; i++)
        {
            var currentDay = history[i];
            decimal dailyEquity = cash + (openTrade != null ? openTrade.Quantity * currentDay.Close : 0m);
            dailyEquities.Add(dailyEquity);

            if (i < history.Count - 1)
            {
                var nextDay = history[i + 1];

                if (openTrade == null)
                {
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
                            int maxShares = (int)(positionSize / price);
                            int quantity = (maxShares / 1000) * 1000;

                            // For high-priced stocks, allow trading at least 1 unit (1000 shares)
                            if (quantity == 0)
                            {
                                quantity = 1000;
                            }

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
                else
                {
                    bool isSell = configs.Any(cfg => cfg.Exit != null && cfg.Exit.Any() && _evaluator.EvaluateAll(cfg.Exit, history, i));

                    if (isSell)
                    {
                        decimal price = nextDay.Open;
                        if (price > 0)
                        {
                            openTrade.SellDate = nextDay.Date;
                            openTrade.SellPrice = price;

                            cash += openTrade.TotalRevenue ?? 0;
                            allTrades.Add(openTrade);
                            openTrade = null;
                        }
                    }
                }
            }
        }

        // Close open trade at end of history
        if (openTrade != null)
        {
            var lastDay = history[^1];
            openTrade.SellDate = lastDay.Date;
            openTrade.SellPrice = lastDay.Close;
            cash += openTrade.TotalRevenue ?? 0;
            allTrades.Add(openTrade);
            openTrade = null;
        }

        // Interval filtering: trades belonging to [startDate, endDate]
        var filteredTrades = allTrades.Where(t =>
            (!startDate.HasValue || t.BuyDate.Date >= startDate.Value) &&
            (!endDate.HasValue || t.BuyDate.Date <= endDate.Value)
        ).ToList();

        result.Trades = filteredTrades;

        // Cumulative compound return of interval trades
        decimal compoundReturn = 1m;
        foreach (var t in filteredTrades)
        {
            compoundReturn *= (1m + (t.ReturnRate ?? 0m));
        }

        if (filteredTrades.Count > 0)
        {
            result.FinalCapital = Math.Round(result.InitialCapital * compoundReturn, 2);
        }
        else
        {
            result.FinalCapital = result.InitialCapital;
        }

        // Window boundary indices for equity curve analysis
        int startIndex = 0;
        if (startDate.HasValue)
        {
            for (int k = 0; k < history.Count; k++)
            {
                if (history[k].Date.Date >= startDate.Value)
                {
                    startIndex = k;
                    break;
                }
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

        // Calculate Annualized Return based on test window span
        DateTime windowStart = startDate.HasValue ? startDate.Value : history[startIndex].Date.Date;
        DateTime windowEnd = endDate.HasValue ? endDate.Value : history[endIndex].Date.Date;
        double days = (windowEnd - windowStart).TotalDays;
        if (days > 30 && (1m + result.TotalReturn) > 0m)
        {
            result.AnnualizedReturn = (decimal)(Math.Pow((double)(1m + result.TotalReturn), 365.0 / days) - 1);
        }
        else
        {
            result.AnnualizedReturn = result.TotalReturn;
        }

        // Max drawdown and Sharpe ratio within the requested interval window
        decimal intervalPeak = dailyEquities[startIndex];
        decimal intervalMaxDrawdown = 0;
        var intervalDailyReturns = new List<decimal>();

        for (int k = startIndex; k <= endIndex; k++)
        {
            decimal eq = dailyEquities[k];
            if (eq > intervalPeak) intervalPeak = eq;
            decimal dd = intervalPeak > 0 ? (intervalPeak - eq) / intervalPeak : 0;
            if (dd > intervalMaxDrawdown) intervalMaxDrawdown = dd;

            if (k > startIndex && dailyEquities[k - 1] > 0)
            {
                intervalDailyReturns.Add((eq - dailyEquities[k - 1]) / dailyEquities[k - 1]);
            }
        }

        result.MaxDrawdown = intervalMaxDrawdown;

        if (intervalDailyReturns.Count > 1)
        {
            decimal avgDailyReturn = intervalDailyReturns.Average();
            decimal sumOfSquares = intervalDailyReturns.Select(val => (val - avgDailyReturn) * (val - avgDailyReturn)).Sum();
            decimal stdDev = (decimal)Math.Sqrt((double)sumOfSquares / (intervalDailyReturns.Count - 1));

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
