using TWSE.Core.Data;
using TWSE.Core.Models;
using Xunit;

namespace TWSE.Tests.Data;

public class SqliteRepositoryTests : IDisposable
{
    private readonly string _dbPath;
    private readonly string _connectionString;
    private readonly SqliteRepository _repo;

    public SqliteRepositoryTests()
    {
        _dbPath = Path.GetTempFileName();
        _connectionString = $"Data Source={_dbPath}";
        _repo = new SqliteRepository(_connectionString);
        _repo.InitializeDatabaseAsync().Wait();
    }

    public void Dispose()
    {
        if (File.Exists(_dbPath))
        {
            try { File.Delete(_dbPath); } catch { /* ignore */ }
        }
    }

    [Fact]
    public async Task InsertAndGetStocks_ShouldWork()
    {
        var stocks = new List<StockInfo>
        {
            new StockInfo { Code = "2330", Name = "台積電", Industry = "半導體業" }
        };

        await _repo.InsertStocksAsync(stocks);
        var result = await _repo.GetAllStocksAsync();

        Assert.Single(result);
        Assert.Equal("2330", result[0].Code);
    }
    
    [Fact]
    public async Task InsertAndGetDailyPrices_ShouldWork()
    {
        var prices = new List<OHLCV>
        {
            new OHLCV { StockCode = "2330", Date = new DateTime(2023, 1, 1), Open = 500, High = 510, Low = 490, Close = 505, Volume = 1000 }
        };

        await _repo.InsertDailyPricesAsync(prices);
        var result = await _repo.GetDailyPricesAsync("2330");

        Assert.Single(result);
        Assert.Equal(505, result[0].Close);
        
        var latestDate = await _repo.GetLatestPriceDateAsync("2330");
        Assert.Equal(new DateTime(2023, 1, 1), latestDate);
    }

    [Fact]
    public async Task SignalTracking_BatchInsertUpdateAndSummary_ShouldWork()
    {
        var items = new List<SignalTrackingItem>
        {
            new SignalTrackingItem
            {
                SignalDate = DateTime.Now.AddDays(-2).ToString("yyyy-MM-dd"),
                StockCode = "2330",
                SignalType = "BUY",
                StrategyName = "多頭排列突破",
                EntryPrice = 1000m,
                Status = "Pending"
            },
            new SignalTrackingItem
            {
                SignalDate = DateTime.Now.AddDays(-2).ToString("yyyy-MM-dd"),
                StockCode = "2317",
                SignalType = "SELL",
                StrategyName = "高檔死亡交叉",
                EntryPrice = 200m,
                Status = "Pending"
            }
        };

        await _repo.BatchInsertSignalTrackingAsync(items);
        var pending = await _repo.GetPendingSignalTrackingAsync();
        Assert.Equal(2, pending.Count);

        // Update tracking with actual returns
        pending[0].NextClose = 1020m;
        pending[0].Return1D = 0.02m;
        pending[0].IsWin = 1;
        pending[0].Status = "Verified";

        pending[1].NextClose = 190m;
        pending[1].Return1D = 0.05m;
        pending[1].IsWin = 1;
        pending[1].Status = "Verified";

        await _repo.BatchUpdateSignalTrackingAsync(pending);

        var summary = await _repo.GetVerificationSummaryAsync(60);
        Assert.Equal(2, summary.TotalTrackedSignals);
        Assert.Equal(2, summary.TotalVerifiedSignals);
        Assert.Equal(1.0m, summary.OverallWinRate1D);
        Assert.Equal(2, summary.StrategyMetrics.Count);
    }
}

