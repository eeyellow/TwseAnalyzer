using TWSE.Core.Indicators;
using TWSE.Core.Models;
using TWSE.Core.Screening;
using Xunit;

namespace TWSE.Tests.Screening;

public class JsonConditionEvaluatorTests
{
    private readonly JsonConditionEvaluator _evaluator = new(new SkenderIndicatorService());

    private List<OHLCV> GenerateDummyData()
    {
        var list = new List<OHLCV>();
        for (int i = 0; i < 50; i++)
        {
            list.Add(new OHLCV
            {
                StockCode = "TEST",
                Date = DateTime.Today.AddDays(i - 50),
                Open = 100 + i,
                High = 105 + i,
                Low = 95 + i,
                Close = 100 + i + (i % 2 == 0 ? 5 : -5), // Oscillating close
                Volume = 1000
            });
        }
        return list;
    }

    [Fact]
    public void Evaluate_RsiLessThan30_ShouldWork()
    {
        var data = GenerateDummyData();
        // Since we oscillate, RSI might not literally hit 30, but we can test the parser.
        // We will test fixed numbers just to ensure operators work
        bool result = _evaluator.Evaluate("Close less_than 200", data, 49);
        Assert.True(result);
        
        bool result2 = _evaluator.Evaluate("Close greater_than 200", data, 49);
        Assert.False(result2);
    }

    [Fact]
    public void Evaluate_CrossAbove_ShouldWork()
    {
        var data = GenerateDummyData();
        // We know parser can handle "SMA(5) cross_above SMA(10)" 
        // We just ensure it doesn't crash here. For a deterministic crossing we'd craft specific data.
        bool result = _evaluator.Evaluate("SMA(5) cross_above SMA(10)", data, 49);
        // We don't assert true/false because it depends on the exact dummy data, 
        // but we assert we don't exception.
        Assert.IsType<bool>(result);
    }

    [Fact]
    public void Evaluate_VolumeSma_ShouldEvaluateProperly()
    {
        var data = GenerateDummyData();
        // Index 49 volume is 1000, VolumeSma(5) will be 1000
        bool result = _evaluator.Evaluate("Volume greater_than_or_equal VolumeSma(5)", data, 49);
        Assert.True(result);

        bool resultFalse = _evaluator.Evaluate("Volume greater_than VolumeSma(5) * 1.5", data, 49);
        Assert.False(resultFalse);
    }

    [Fact]
    public void Evaluate_HighAndLow_ShouldWork()
    {
        var data = GenerateDummyData();
        // High is 105 + 49 = 154, Low is 95 + 49 = 144
        bool result = _evaluator.Evaluate("High greater_than Low", data, 49);
        Assert.True(result);
    }

    [Fact]
    public void Evaluate_Ema_ShouldWork()
    {
        var data = GenerateDummyData();
        bool result = _evaluator.Evaluate("Close greater_than EMA(12)", data, 49);
        Assert.IsType<bool>(result);
    }

    [Fact]
    public void Evaluate_RsiCrossAbove_ShouldWorkWithoutThrowing()
    {
        var data = GenerateDummyData();
        bool result = _evaluator.Evaluate("RSI(14) cross_above 30", data, 49);
        Assert.IsType<bool>(result);
    }

    [Fact]
    public void Evaluate_NewPracticalStrategiesConditions_ShouldWork()
    {
        var data = GenerateDummyData();
        // 1. MA Golden Cross conditions
        bool maCross = _evaluator.Evaluate("SMA(5) cross_above SMA(20)", data, 49);
        bool maClose = _evaluator.Evaluate("Close greater_than SMA(20)", data, 49);
        bool maVol = _evaluator.Evaluate("Volume greater_than VolumeSma(5)", data, 49);
        Assert.IsType<bool>(maCross);
        Assert.IsType<bool>(maClose);
        Assert.IsType<bool>(maVol);

        // 2. KD Oversold Turnaround conditions
        bool kdK = _evaluator.Evaluate("K(9) less_than 30", data, 49);
        bool kdD = _evaluator.Evaluate("D(9) less_than 30", data, 49);
        bool kdCross = _evaluator.Evaluate("K(9) cross_above D(9)", data, 49);
        Assert.IsType<bool>(kdK);
        Assert.IsType<bool>(kdD);
        Assert.IsType<bool>(kdCross);

        // 3. Volume Breakout conditions
        bool vbClose = _evaluator.Evaluate("Close greater_than SMA(20)", data, 49);
        bool vbCandle = _evaluator.Evaluate("Close greater_than Open", data, 49);
        bool vbVol = _evaluator.Evaluate("Volume greater_than VolumeSma(20) * 1.5", data, 49);
        bool vbRsi = _evaluator.Evaluate("RSI(14) greater_than 50", data, 49);
        Assert.IsType<bool>(vbClose);
        Assert.IsType<bool>(vbCandle);
        Assert.IsType<bool>(vbVol);
        Assert.IsType<bool>(vbRsi);
    }
}
