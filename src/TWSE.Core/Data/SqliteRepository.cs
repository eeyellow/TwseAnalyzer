using Microsoft.Data.Sqlite;
using Dapper;
using TWSE.Core.Models;

namespace TWSE.Core.Data;

public class SqliteRepository : IStockRepository
{
    private readonly string _connectionString;

    public SqliteRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task InitializeDatabaseAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        await connection.ExecuteAsync("PRAGMA journal_mode = WAL;");
        await connection.ExecuteAsync("PRAGMA synchronous = NORMAL;");

        var createStocksTable = @"
            CREATE TABLE IF NOT EXISTS stocks (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                industry TEXT NOT NULL
            );";

        var createDailyPricesTable = @"
            CREATE TABLE IF NOT EXISTS daily_prices (
                code TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                PRIMARY KEY (code, date)
            );";

        var createIndex = @"
            CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);
        ";

        await connection.ExecuteAsync(createStocksTable);
        await connection.ExecuteAsync(createDailyPricesTable);
        await connection.ExecuteAsync(createIndex);
    }

    public async Task InsertStocksAsync(IEnumerable<StockInfo> stocks)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var sql = @"
            INSERT INTO stocks (code, name, industry)
            VALUES (@Code, @Name, @Industry)
            ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                industry = excluded.industry;";

        await connection.ExecuteAsync(sql, stocks, transaction);
        await transaction.CommitAsync();
    }

    public async Task<List<StockInfo>> GetAllStocksAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT * FROM stocks ORDER BY code";
        return (await connection.QueryAsync<StockInfo>(sql)).ToList();
    }

    public async Task InsertDailyPricesAsync(IEnumerable<OHLCV> prices)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var sql = @"
            INSERT INTO daily_prices (code, date, open, high, low, close, volume)
            VALUES (@StockCode, @DateText, @Open, @High, @Low, @Close, @Volume)
            ON CONFLICT(code, date) DO UPDATE SET
                open = excluded.open,
                high = excluded.high,
                low = excluded.low,
                close = excluded.close,
                volume = excluded.volume;";

        var param = prices.Select(p => new {
            p.StockCode,
            DateText = p.Date.ToString("yyyy-MM-dd"),
            p.Open,
            p.High,
            p.Low,
            p.Close,
            p.Volume
        });

        await connection.ExecuteAsync(sql, param, transaction);
        await transaction.CommitAsync();
    }

    public async Task<List<OHLCV>> GetDailyPricesAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        
        var sql = "SELECT code as StockCode, date as DateText, open, high, low, close, volume FROM daily_prices WHERE code = @StockCode";
        
        if (startDate.HasValue) sql += $" AND date >= '{startDate.Value:yyyy-MM-dd}'";
        if (endDate.HasValue) sql += $" AND date <= '{endDate.Value:yyyy-MM-dd}'";
        
        sql += " ORDER BY date ASC";

        var dtoList = await connection.QueryAsync<dynamic>(sql, new { StockCode = stockCode });

        return dtoList.Select(d => new OHLCV {
            StockCode = d.StockCode,
            Date = DateTime.Parse(d.DateText),
            Open = (decimal)d.open,
            High = (decimal)d.high,
            Low = (decimal)d.low,
            Close = (decimal)d.close,
            Volume = (decimal)d.volume
        }).ToList();
    }

    public async Task<DateTime?> GetLatestPriceDateAsync(string stockCode)
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT MAX(date) FROM daily_prices WHERE code = @StockCode";
        var dateText = await connection.QuerySingleOrDefaultAsync<string>(sql, new { StockCode = stockCode });
        
        if (string.IsNullOrEmpty(dateText)) return null;
        return DateTime.Parse(dateText);
    }
}
