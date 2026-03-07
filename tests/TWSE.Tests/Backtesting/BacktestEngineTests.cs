using Moq;
using TWSE.Core.Backtesting;
using TWSE.Core.Models;
using TWSE.Core.Screening;
using Xunit;

namespace TWSE.Tests.Backtesting;

public class BacktestEngineTests
{
    private readonly Mock<IConditionEvaluator> _evaluatorMock = new();
    private readonly BacktestEngine _engine;

    public BacktestEngineTests()
    {
        _engine = new BacktestEngine(_evaluatorMock.Object);
    }

    [Fact]
    public async Task RunAsync_GivenBuyAndSellConditions_ShouldExecuteTrades()
    {
        var history = new List<OHLCV>
        {
            new OHLCV { Date = new DateTime(2023, 1, 1), Open = 100, Close = 100 },
            new OHLCV { Date = new DateTime(2023, 1, 2), Open = 100, Close = 105 }, // buy condition met here
            new OHLCV { Date = new DateTime(2023, 1, 3), Open = 110, Close = 110 }, // execute buy at 110, sell condition met here
            new OHLCV { Date = new DateTime(2023, 1, 4), Open = 120, Close = 120 }  // execute sell at 120
        };

        var config = new StrategyConfig
        {
            Backtest = new BacktestParams { InitialCapital = 1000000, PositionSize = 200000 },
            Entry = new List<string> { "condition 1" },
            Exit = new List<string> { "condition 2" }
        };

        _evaluatorMock.Setup(e => e.EvaluateAll(config.Entry, It.IsAny<IReadOnlyList<OHLCV>>(), 1)).Returns(true);
        _evaluatorMock.Setup(e => e.EvaluateAll(config.Exit, It.IsAny<IReadOnlyList<OHLCV>>(), 2)).Returns(true);

        var result = await _engine.RunAsync("2330", config, history);

        Assert.Single(result.Trades);
        var trade = result.Trades.First();
        Assert.Equal(new DateTime(2023, 1, 3), trade.BuyDate);
        Assert.Equal(110, trade.BuyPrice);
        Assert.Equal(new DateTime(2023, 1, 4), trade.SellDate);
        Assert.Equal(120, trade.SellPrice);
    }
    [Fact]
    public async Task RunAsync_GivenZeroInitialCapital_ShouldNotThrowDivideByZero()
    {
        var history = new List<OHLCV>
        {
            new OHLCV { Date = new DateTime(2023, 1, 1), Open = 100, Close = 100 },
            new OHLCV { Date = new DateTime(2023, 1, 2), Open = 100, Close = 105 }
        };

        var config = new StrategyConfig
        {
            Backtest = new BacktestParams { InitialCapital = 0, PositionSize = 1000 },
            Entry = new List<string>(),
            Exit = new List<string>()
        };

        var result = await _engine.RunAsync("2330", config, history);

        Assert.NotNull(result);
        Assert.Equal(0, result.TotalReturn);
    }

    [Fact]
    public async Task RunAsync_GivenZeroOpenPrice_ShouldNotThrowDivideByZero()
    {
        var history = new List<OHLCV>
        {
            new OHLCV { Date = new DateTime(2023, 1, 1), Open = 100, Close = 100 },
            new OHLCV { Date = new DateTime(2023, 1, 2), Open = 0, Close = 0 },   // zero price day
            new OHLCV { Date = new DateTime(2023, 1, 3), Open = 110, Close = 110 }
        };

        var config = new StrategyConfig
        {
            Backtest = new BacktestParams { InitialCapital = 1000000, PositionSize = 200000 },
            Entry = new List<string> { "condition 1" },
            Exit = new List<string> { "condition 2" }
        };

        // Entry triggers on day 0 → execution on day 1 which has Open=0, should be skipped
        _evaluatorMock.Setup(e => e.EvaluateAll(config.Entry, It.IsAny<IReadOnlyList<OHLCV>>(), 0)).Returns(true);

        var result = await _engine.RunAsync("TEST", config, history);

        Assert.NotNull(result);
        Assert.Empty(result.Trades); // No trade should have been opened
    }
}
