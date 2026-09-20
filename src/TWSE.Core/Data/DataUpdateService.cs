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
        
        // Overlap by 7 days to heal recent gaps, handle weekend/holiday transitions, and overwrite incomplete intraday bars.
        var startDate = latestDate?.AddDays(-7);
        
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
