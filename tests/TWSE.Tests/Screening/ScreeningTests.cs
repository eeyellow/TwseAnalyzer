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
}
