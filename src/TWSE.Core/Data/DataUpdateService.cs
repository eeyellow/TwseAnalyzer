namespace TWSE.Core.Data;

public class DataUpdateService : IDataUpdateService
{
    private readonly IStockRepository _repository;
    private readonly IYahooFetcher _fetcher;

    public DataUpdateService(IStockRepository repository, IYahooFetcher fetcher)
    {
        _repository = repository;
        _fetcher = fetcher;
    }

    public async Task UpdateHistoricalDataAsync(string stockCode)
    {
        var latestDate = await _repository.GetLatestPriceDateAsync(stockCode);
        
        // If we have data, we want to fetch starting from the next day.
        var startDate = latestDate?.AddDays(1);
        
        // Yahoo API uses inclusive dates. If we already have up to yesterday, startDate will be today.
        var data = await _fetcher.FetchHistoricalDataAsync(stockCode, startDate, null);
        
        if (data.Any())
        {
            await _repository.InsertDailyPricesAsync(data);
        }
    }

    public async Task UpdateAllHistoricalDataAsync(IEnumerable<string> stockCodes)
    {
        foreach (var code in stockCodes)
        {
            await UpdateHistoricalDataAsync(code);
        }
    }
}
