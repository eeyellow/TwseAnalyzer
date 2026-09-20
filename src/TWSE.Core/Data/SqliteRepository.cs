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

        var createPortfolioTable = @"
            CREATE TABLE IF NOT EXISTS portfolio (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                avg_cost REAL NOT NULL,
                selected_strategy TEXT
            );";

        var createDailySignalsTable = @"
            CREATE TABLE IF NOT EXISTS daily_signals (
                date TEXT NOT NULL,
                code TEXT NOT NULL,
                signal_type TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                suggested_price REAL,
                last_close REAL NOT NULL,
                PRIMARY KEY (date, code, strategy_name)
            );";

        var createIndex = @"
            CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);
            CREATE INDEX IF NOT EXISTS idx_daily_signals_date ON daily_signals(date);
        ";

        await connection.ExecuteAsync(createStocksTable);
        await connection.ExecuteAsync(createDailyPricesTable);
        await connection.ExecuteAsync(createPortfolioTable);
        await connection.ExecuteAsync(createDailySignalsTable);
        await connection.ExecuteAsync(createIndex);

        try
        {
            await connection.ExecuteAsync("ALTER TABLE portfolio ADD COLUMN selected_strategy TEXT;");
        }
        catch { /* Column may already exist */ }

        // 自動同步舊有 data/portfolio.json (若存在且資料庫為空)
        try
        {
            var count = await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM portfolio;");
            if (count == 0)
            {
                var jsonPath = Path.Combine(Directory.GetCurrentDirectory(), "data", "portfolio.json");
                if (File.Exists(jsonPath))
                {
                    var json = await File.ReadAllTextAsync(jsonPath);
                    var items = System.Text.Json.JsonSerializer.Deserialize<List<PortfolioItem>>(json);
                    if (items != null && items.Any())
                    {
                        foreach (var item in items)
                        {
                            await UpdatePortfolioItemAsync(item);
                        }
                    }
                }
            }
        }
        catch { /* Ignore migration errors */ }
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

    public async Task<List<string>> GetStockCodesWithPricesAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT DISTINCT code FROM daily_prices";
        var codes = await connection.QueryAsync<string>(sql);
        return codes.ToList();
    }

    public async Task<DateTime?> GetLatestPriceDateAsync(string stockCode)
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT MAX(date) FROM daily_prices WHERE code = @StockCode";
        var dateText = await connection.QuerySingleOrDefaultAsync<string>(sql, new { StockCode = stockCode });
        
        if (string.IsNullOrEmpty(dateText)) return null;
        return DateTime.Parse(dateText);
    }

    public async Task<List<PortfolioItem>> GetPortfolioAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT code as StockCode, name as StockName, quantity, avg_cost as AvgCost, selected_strategy as SelectedStrategy FROM portfolio ORDER BY code";
        return (await connection.QueryAsync<PortfolioItem>(sql)).ToList();
    }

    public async Task UpdatePortfolioItemAsync(PortfolioItem item)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var sql = @"
            INSERT INTO portfolio (code, name, quantity, avg_cost, selected_strategy)
            VALUES (@StockCode, @StockName, @Quantity, @AvgCost, @SelectedStrategy)
            ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                quantity = excluded.quantity,
                avg_cost = excluded.avg_cost,
                selected_strategy = excluded.selected_strategy;";
        await connection.ExecuteAsync(sql, item);
    }

    public async Task DeletePortfolioItemAsync(string stockCode)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var sql = "DELETE FROM portfolio WHERE code = @StockCode";
        await connection.ExecuteAsync(sql, new { StockCode = stockCode });
    }

    public async Task InsertDailySignalsAsync(IEnumerable<DailySignal> signals, DateTime date)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        // 每次重新插入當日同一策略的信號前，先清空當日的舊紀錄（可避免重複或更新不乾淨）
        var deleteSql = "DELETE FROM daily_signals WHERE date = @DateText";
        await connection.ExecuteAsync(deleteSql, new { DateText = date.ToString("yyyy-MM-dd") }, transaction);

        var sql = @"
            INSERT INTO daily_signals (date, code, signal_type, strategy_name, suggested_price, last_close)
            VALUES (@DateText, @StockCode, @SignalType, @StrategyName, @SuggestedPrice, @LastClose)
            ON CONFLICT(date, code, strategy_name) DO UPDATE SET
                signal_type = excluded.signal_type,
                suggested_price = excluded.suggested_price,
                last_close = excluded.last_close;";

        var param = signals.Select(s => new {
            DateText = s.Date.ToString("yyyy-MM-dd"),
            s.StockCode,
            s.SignalType,
            s.StrategyName,
            s.SuggestedPrice,
            s.LastClose
        });

        await connection.ExecuteAsync(sql, param, transaction);
        await transaction.CommitAsync();
    }

    private class DailySignalDto
    {
        public string DateText { get; set; } = string.Empty;
        public string StockCode { get; set; } = string.Empty;
        public string SignalType { get; set; } = string.Empty;
        public string StrategyName { get; set; } = string.Empty;
        public decimal? SuggestedPrice { get; set; }
        public double LastClose { get; set; } // SQLite REAL often maps safely to double, then we cast
    }

    public async Task<List<DailySignal>> GetDailySignalsAsync(DateTime date)
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = "SELECT date as DateText, code as StockCode, signal_type as SignalType, strategy_name as StrategyName, suggested_price as SuggestedPrice, last_close as LastClose FROM daily_signals WHERE date = @DateText ORDER BY code";
        
        var dtoList = await connection.QueryAsync<DailySignalDto>(sql, new { DateText = date.ToString("yyyy-MM-dd") });
        
        return dtoList.Select(d => new DailySignal {
            Date = DateTime.Parse(d.DateText),
            StockCode = d.StockCode,
            SignalType = d.SignalType,
            StrategyName = d.StrategyName,
            SuggestedPrice = d.SuggestedPrice,
            LastClose = (decimal)d.LastClose
        }).ToList();
    }

    public async Task<DateTime?> GetLatestSignalDateAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        var dateStr = await connection.QueryFirstOrDefaultAsync<string>("SELECT MAX(date) FROM daily_signals");
        return string.IsNullOrEmpty(dateStr) ? null : DateTime.Parse(dateStr);
    }
}
