using TWSE.Core.Models;

namespace TWSE.Core.Data;

public interface ITwseFetcher
{
    Task<List<StockInfo>> FetchListedStocksAsync();
}
