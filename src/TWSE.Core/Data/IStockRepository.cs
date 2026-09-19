using TWSE.Core.Models;

namespace TWSE.Core.Data;

public interface IStockRepository
{
    Task InitializeDatabaseAsync();
    Task InsertStocksAsync(IEnumerable<StockInfo> stocks);
    Task<List<StockInfo>> GetAllStocksAsync();
    
    Task InsertDailyPricesAsync(IEnumerable<OHLCV> prices);
    Task<List<OHLCV>> GetDailyPricesAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null);
    
    Task<DateTime?> GetLatestPriceDateAsync(string stockCode);

    // Portfolio
    Task<List<PortfolioItem>> GetPortfolioAsync();
    Task UpdatePortfolioItemAsync(PortfolioItem item);
    Task DeletePortfolioItemAsync(string stockCode);

    // Daily Signals
    Task InsertDailySignalsAsync(IEnumerable<DailySignal> signals, DateTime date);
    Task<List<DailySignal>> GetDailySignalsAsync(DateTime date);
}
