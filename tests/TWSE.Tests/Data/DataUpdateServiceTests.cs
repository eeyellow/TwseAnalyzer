using Moq;
using TWSE.Core.Data;
using TWSE.Core.Models;
using Xunit;

namespace TWSE.Tests.Data;

public class DataUpdateServiceTests
{
    [Fact]
    public async Task UpdateHistoricalDataAsync_WhenNoDataExists_ShouldFetchAll()
    {
        var repoMock = new Mock<IStockRepository>();
        repoMock.Setup(r => r.GetLatestPriceDateAsync("2330")).ReturnsAsync((DateTime?)null);

        var fetcherMock = new Mock<IYahooFetcher>();
        fetcherMock.Setup(f => f.FetchHistoricalDataAsync("2330", null, null))
            .ReturnsAsync(new List<OHLCV> { new OHLCV { StockCode = "2330", Date = new DateTime(2023, 1, 1) } });

        var service = new DataUpdateService(repoMock.Object, fetcherMock.Object);

        await service.UpdateHistoricalDataAsync("2330");

        repoMock.Verify(r => r.InsertDailyPricesAsync(It.IsAny<IEnumerable<OHLCV>>()), Times.Once);
    }
}
