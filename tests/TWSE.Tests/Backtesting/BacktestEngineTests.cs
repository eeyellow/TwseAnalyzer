using TWSE.Core.Backtesting;
using TWSE.Core.Indicators;
using TWSE.Core.Models;
using TWSE.Core.Screening;
using Xunit;

namespace TWSE.Tests.Backtesting;

public class BacktestEngineTests
{
    private readonly BacktestEngine _engine;

    public BacktestEngineTests()
    {
        var indicatorService = new SkenderIndicatorService();
        var evaluator = new JsonConditionEvaluator(indicatorService);
        _engine = new BacktestEngine(evaluator);
    }

    private List<OHLCV> GenerateTestData(int count, decimal initialPrice = 100)
    {
        var list = new List<OHLCV>();
        var baseDate = new DateTime(2023, 1, 1);
        decimal price = initialPrice;

        for (int i = 0; i < count; i++)
        {
            price += (i % 2 == 0 ? 1 : -0.5m);
            list.Add(new OHLCV
            {
                StockCode = "2330",
                Date = baseDate.AddDays(i),
                Open = price,
                High = price + 2,
                Low = price - 2,
                Close = price,
                Volume = 1000
            });
        }
        return list;
    }

    [Fact]
    public async Task RunAsync_MaxDrawdown_ShouldNotArtificiallyJumpOnStockPurchase()
    {
        // Setup steady upward trend so drawdown should be small, not equal to position size / capital
        var data = new List<OHLCV>();
        var baseDate = new DateTime(2023, 1, 1);
        for (int i = 0; i < 60; i++)
        {
            var p = 100m + i; // Prices strictly rising: 100, 101, 102...
            data.Add(new OHLCV
            {
                StockCode = "2330",
                Date = baseDate.AddDays(i),
                Open = p,
                High = p + 1,
                Low = p - 1,
                Close = p,
                Volume = 5000
            });
        }

        var config = new StrategyConfig
        {
            Backtest = new BacktestParams
            {
                InitialCapital = 1000000,
                PositionSize = 800000, // 80% position
            },
            Entry = new List<string> { "Close greater_than 100" }, // Triggers immediately on day 1
            Exit = new List<string> { "Close greater_than 150" }
        };

        var result = await _engine.RunAsync("2330", config, data);

        // With strictly increasing price, mark-to-market MaxDrawdown should be 0 (or near 0 due to commission)
        // Definitely NOT 80% (which was the bug where cash dropped from 1M to 200k)
        Assert.True(result.MaxDrawdown < 0.05m, $"MaxDrawdown was {result.MaxDrawdown:P2}, should be near 0%");
        Assert.True(result.TotalReturn > 0);
    }

    [Fact]
    public async Task RunAsync_ShouldKeepHistoryWarmupWhenStartDateProvided()
    {
        // 100 days of history, StartDate set at day 50
        // Strategy requires SMA(20). If warmup is preserved, day 50 can evaluate SMA(20) immediately!
        var data = GenerateTestData(100);
        var testStartDate = data[50].Date.ToString("yyyy-MM-dd");

        var config = new StrategyConfig
        {
            Backtest = new BacktestParams
            {
                StartDate = testStartDate,
                InitialCapital = 100000,
                PositionSize = 100000
            },
            Entry = new List<string> { "Close greater_than SMA(20)" },
            Exit = new List<string> { "Close less_than SMA(20)" }
        };

        var result = await _engine.RunAsync("2330", config, data);

        // If warmup works, SMA(20) is already available at index 50
        Assert.NotNull(result);
        Assert.True(result.Trades.All(t => t.BuyDate >= data[50].Date));
    }

    [Fact]
    public async Task RunComboAsync_ShouldEvaluateMultiStrategyComboCorrectly()
    {
        var data = GenerateTestData(80);
        var configA = new StrategyConfig
        {
            Entry = new List<string> { "Close greater_than 90" },
            Exit = new List<string> { "Close greater_than 200" }
        };
        var configB = new StrategyConfig
        {
            Entry = new List<string> { "Close greater_than 1000" }, // Impossible condition
            Exit = new List<string> { "Close greater_than 200" }
        };

        var backtestParams = new BacktestParams
        {
            InitialCapital = 1000000,
            PositionSize = 1000000
        };

        // In AND mode: configA and configB must both match. Since configB impossible, 0 trades.
        var resultAnd = await _engine.RunComboAsync("2330", new List<StrategyConfig> { configA, configB }, "AND", 100, backtestParams, data);
        Assert.Equal(0, resultAnd.TotalTrades);

        // In OR mode: either configA or configB matches. Since configA matches, trades occur.
        var resultOr = await _engine.RunComboAsync("2330", new List<StrategyConfig> { configA, configB }, "OR", 50, backtestParams, data);
        Assert.True(resultOr.TotalTrades > 0);
    }
}
