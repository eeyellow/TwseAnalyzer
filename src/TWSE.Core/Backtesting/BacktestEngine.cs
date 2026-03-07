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
        var result = new BacktestResult
        {
            StockCode = stockCode,
            InitialCapital = config.Backtest.InitialCapital,
            FinalCapital = config.Backtest.InitialCapital
        };

        if (history.Count == 0) return Task.FromResult(result);

        // Filter history by StartDate and EndDate if provided
        var filteredHistory = history.Where(h =>
        {
            bool ok = true;
            if (DateTime.TryParse(config.Backtest.StartDate, out var sd)) ok &= h.Date >= sd;
            if (DateTime.TryParse(config.Backtest.EndDate, out var ed)) ok &= h.Date <= ed;
            return ok;
        }).ToList();

        if (filteredHistory.Count < 2) return Task.FromResult(result);

        decimal currentCapital = result.InitialCapital;
        TradeRecord? openTrade = null;
        decimal peakCapital = currentCapital;
        decimal maxDrawdown = 0;
        var dailyReturns = new List<decimal>();
        decimal previousCapital = currentCapital;

        for (int i = 0; i < filteredHistory.Count - 1; i++) // Cannot evaluate on the last day since execution is next day
        {
            // Calculate daily return for Sharpe Ratio later
            decimal dailyReturn = previousCapital != 0 ? (currentCapital - previousCapital) / previousCapital : 0m;
            dailyReturns.Add(dailyReturn);
            previousCapital = currentCapital;

            // Check max drawdown
            if (currentCapital > peakCapital) peakCapital = currentCapital;
            decimal drawdown = peakCapital > 0 ? (peakCapital - currentCapital) / peakCapital : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;

            // Execution happens next day open
            var nextDay = filteredHistory[i + 1];

            if (openTrade == null)
            {
                // Check entry conditions
                if (_evaluator.EvaluateAll(config.Entry, filteredHistory, i))
                {
                    // Execute entry
                    decimal price = nextDay.Open;
                    if (price <= 0) continue; // Skip if price data is invalid

                    int maxShares = (int)(config.Backtest.PositionSize / price);
                    int quantity = (maxShares / 1000) * 1000; // Round down to multiple of 1000

                    if (quantity > 0 && currentCapital >= quantity * price)
                    {
                        openTrade = new TradeRecord
                        {
                            StockCode = stockCode,
                            BuyDate = nextDay.Date,
                            BuyPrice = price,
                            Quantity = quantity,
                            CommissionRate = config.Backtest.CommissionRate,
                            TaxRate = config.Backtest.TaxRate
                        };
                        currentCapital -= openTrade.TotalCost;
                    }
                }
            }
            else
            {
                // Check exit conditions
                if (_evaluator.EvaluateAll(config.Exit, filteredHistory, i))
                {
                    // Execute exit
                    decimal price = nextDay.Open;
                    if (price <= 0) continue; // Skip if price data is invalid

                    openTrade.SellDate = nextDay.Date;
                    openTrade.SellPrice = price;

                    currentCapital += openTrade.TotalRevenue ?? 0;
                    result.Trades.Add(openTrade);
                    openTrade = null;
                }
            }
        }

        // Force close at the end if still open
        if (openTrade != null)
        {
            var lastDay = filteredHistory[^1];
            openTrade.SellDate = lastDay.Date;
            openTrade.SellPrice = lastDay.Close; // Close price of the last day
            currentCapital += openTrade.TotalRevenue ?? 0;
            result.Trades.Add(openTrade);
        }

        result.FinalCapital = currentCapital;
        result.MaxDrawdown = maxDrawdown;

        // Calculate Annualized Return
        double days = (filteredHistory[^1].Date - filteredHistory[0].Date).TotalDays;
        if (days > 0)
        {
            result.AnnualizedReturn = (decimal)(Math.Pow((double)(1 + result.TotalReturn), 365.0 / days) - 1);
        }

        // Calculate Sharpe Ratio (simplified, assuming 0 risk free rate, based on daily returns)
        if (dailyReturns.Count > 1)
        {
            decimal avgDailyReturn = dailyReturns.Average();
            decimal sumOfSquaresOfDifferences = dailyReturns.Select(val => (val - avgDailyReturn) * (val - avgDailyReturn)).Sum();
            decimal stdDev = (decimal)Math.Sqrt((double)sumOfSquaresOfDifferences / (dailyReturns.Count - 1));
            
            if (stdDev > 0)
            {
                result.SharpeRatio = (avgDailyReturn / stdDev) * (decimal)Math.Sqrt(252); // Annualized Sharpe
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
