using TWSE.Core.Indicators;
using TWSE.Core.Models;
using Xunit;

namespace TWSE.Tests.Indicators;

public class IndicatorServiceTests
{
    private readonly SkenderIndicatorService _service = new();
    
    private List<OHLCV> GenerateDummyData(int count)
    {
        var list = new List<OHLCV>();
        for (int i = 0; i < count; i++)
        {
            list.Add(new OHLCV
            {
                StockCode = "TEST",
                Date = DateTime.Today.AddDays(i - count),
                Open = 100 + i,
                High = 105 + i,
                Low = 95 + i,
                Close = 102 + i,
                Volume = 1000 + (i * 10)
            });
        }
        return list;
    }

    [Fact]
    public void CalculateSma_ShouldReturnCorrectCountAndValues()
    {
        var data = GenerateDummyData(30);
        var result = _service.CalculateSma(data, 10).ToList();

        Assert.Equal(30, result.Count);
        Assert.Null(result[8].Sma);
        Assert.NotNull(result[9].Sma);
    }

    [Fact]
    public void CrossAbove_ShouldReturnTrue_WhenCrossing()
    {
        var line1 = new List<double?> { 10, 15, 20 };
        var line2 = new List<double?> { 12, 16, 18 };

        var crossed = _service.CrossAbove(line1, line2, 2);
        Assert.True(crossed);
        
        var notCrossed = _service.CrossAbove(line1, line2, 1);
        Assert.False(notCrossed);
    }
    
    [Fact]
    public void CrossBelow_ShouldReturnTrue_WhenCrossing()
    {
        var line1 = new List<double?> { 20, 15, 10 };
        var line2 = new List<double?> { 18, 14, 12 };

        var crossed = _service.CrossBelow(line1, line2, 2);
        Assert.True(crossed);
        
        var notCrossed = _service.CrossBelow(line1, line2, 1);
        Assert.False(notCrossed);
    }
}
