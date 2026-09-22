using TWSE.Core.Data;
using Xunit;
using Xunit.Abstractions;

namespace TWSE.Tests.Data;

public class YahooFetcherIntegrationTests
{
    private readonly ITestOutputHelper _output;

    public YahooFetcherIntegrationTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task Fetch2330_ShouldReturnData()
    {
        var fetcher = new TWSE.Core.Data.YahooFetcher();
        var data = await fetcher.FetchHistoricalDataAsync("2330", DateTime.Today.AddDays(-10), DateTime.Today);
        _output.WriteLine($"Fetched {data.Count} rows.");
        foreach (var row in data)
        {
            _output.WriteLine($"Row Date: {row.Date:yyyy-MM-dd}");
        }
        Assert.NotEmpty(data);
    }

    [Fact]
    public async Task Fetch8069_OTC_ShouldReturnData()
    {
        var fetcher = new TWSE.Core.Data.YahooFetcher();
        var data = await fetcher.FetchHistoricalDataAsync("8069", DateTime.Today.AddDays(-10), DateTime.Today);
        _output.WriteLine($"Fetched OTC 8069 rows: {data.Count}");
        Assert.NotEmpty(data);
    }

    [Fact]
    public async Task FetchInvalid_ShouldReturnEmpty()
    {
        var fetcher = new TWSE.Core.Data.YahooFetcher();
        var data = await fetcher.FetchHistoricalDataAsync("INVALID999", DateTime.Today.AddDays(-10), DateTime.Today);
        Assert.Empty(data);
    }
}
