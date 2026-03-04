using TWSE.Core.Models;

namespace TWSE.Core.Data;

public interface IYahooFetcher
{
    Task<List<OHLCV>> FetchHistoricalDataAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null);
}
