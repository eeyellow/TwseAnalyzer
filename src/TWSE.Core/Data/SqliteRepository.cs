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

        var createSignalTrackingTable = @"
            CREATE TABLE IF NOT EXISTS signal_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_date TEXT NOT NULL,
                code TEXT NOT NULL,
                signal_type TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                entry_price REAL NOT NULL,
                next_open REAL,
                next_close REAL,
                return_1d REAL,
                return_3d REAL,
                return_5d REAL,
                max_return_5d REAL,
                max_drawdown_5d REAL,
                volume_20d_avg REAL DEFAULT 0,
                is_noise INTEGER NOT NULL DEFAULT 0,
                noise_reason TEXT,
                status TEXT NOT NULL DEFAULT 'Pending',
                is_win INTEGER NOT NULL DEFAULT 0,
                features_json TEXT,
                created_at TEXT NOT NULL,
                verified_at TEXT,
                UNIQUE(signal_date, code, strategy_name)
            );";

        var createIndex = @"
            CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);
            CREATE INDEX IF NOT EXISTS idx_daily_signals_date ON daily_signals(date);
            CREATE INDEX IF NOT EXISTS idx_tracking_date_code ON signal_tracking(signal_date, code);
            CREATE INDEX IF NOT EXISTS idx_tracking_status ON signal_tracking(status);
        ";

        await connection.ExecuteAsync(createStocksTable);
        await connection.ExecuteAsync(createDailyPricesTable);
        await connection.ExecuteAsync(createPortfolioTable);
        await connection.ExecuteAsync(createDailySignalsTable);
        await connection.ExecuteAsync(createSignalTrackingTable);
        await connection.ExecuteAsync(createIndex);

        try
        {
            await connection.ExecuteAsync("ALTER TABLE portfolio ADD COLUMN selected_strategy TEXT;");
        }
        catch { /* Column may already exist */ }

        try
        {
            await connection.ExecuteAsync("ALTER TABLE signal_tracking ADD COLUMN volume_20d_avg REAL DEFAULT 0;");
        }
        catch { }
        try
        {
            await connection.ExecuteAsync("ALTER TABLE signal_tracking ADD COLUMN is_noise INTEGER DEFAULT 0;");
        }
        catch { }
        try
        {
            await connection.ExecuteAsync("ALTER TABLE signal_tracking ADD COLUMN noise_reason TEXT;");
        }
        catch { }

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

    // --- 高效批次與自適應驗證實作 ---

    public async Task<Dictionary<string, List<OHLCV>>> GetMarketRecentPricesBatchAsync(int lookbackDays = 120)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var minDate = DateTime.Now.Date.AddDays(-lookbackDays).ToString("yyyy-MM-dd");
        var sql = "SELECT code as StockCode, date as DateText, open, high, low, close, volume FROM daily_prices WHERE date >= @MinDate ORDER BY code, date ASC";
        var dtoList = await connection.QueryAsync<dynamic>(sql, new { MinDate = minDate });

        var dict = new Dictionary<string, List<OHLCV>>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in dtoList)
        {
            string code = d.StockCode;
            if (!dict.TryGetValue(code, out var list))
            {
                list = new List<OHLCV>();
                dict[code] = list;
            }
            list.Add(new OHLCV
            {
                StockCode = code,
                Date = DateTime.Parse(d.DateText),
                Open = (decimal)d.open,
                High = (decimal)d.high,
                Low = (decimal)d.low,
                Close = (decimal)d.close,
                Volume = (decimal)d.volume
            });
        }
        return dict;
    }

    public async Task<Dictionary<string, List<OHLCV>>> GetHistoricalPricesRangeBatchAsync(DateTime startDate, DateTime endDate)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var minDate = startDate.ToString("yyyy-MM-dd");
        var maxDate = endDate.ToString("yyyy-MM-dd");
        var sql = "SELECT code as StockCode, date as DateText, open, high, low, close, volume FROM daily_prices WHERE date >= @MinDate AND date <= @MaxDate ORDER BY code, date ASC";
        var dtoList = await connection.QueryAsync<dynamic>(sql, new { MinDate = minDate, MaxDate = maxDate });

        var dict = new Dictionary<string, List<OHLCV>>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in dtoList)
        {
            string code = d.StockCode;
            if (!dict.TryGetValue(code, out var list))
            {
                list = new List<OHLCV>();
                dict[code] = list;
            }
            list.Add(new OHLCV
            {
                StockCode = code,
                Date = DateTime.Parse(d.DateText),
                Open = (decimal)d.open,
                High = (decimal)d.high,
                Low = (decimal)d.low,
                Close = (decimal)d.close,
                Volume = (decimal)d.volume
            });
        }
        return dict;
    }

    public async Task BatchInsertSignalTrackingAsync(IEnumerable<SignalTrackingItem> items)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var sql = @"
            INSERT INTO signal_tracking (
                signal_date, code, signal_type, strategy_name, entry_price, 
                volume_20d_avg, is_noise, noise_reason,
                status, is_win, features_json, created_at
            ) VALUES (
                @SignalDate, @StockCode, @SignalType, @StrategyName, @EntryPrice, 
                @Volume20dAvg, @IsNoise, @NoiseReason,
                @Status, @IsWin, @FeaturesJson, @CreatedAtStr
            ) ON CONFLICT(signal_date, code, strategy_name) DO UPDATE SET
                entry_price = excluded.entry_price,
                volume_20d_avg = excluded.volume_20d_avg,
                is_noise = excluded.is_noise,
                noise_reason = excluded.noise_reason,
                features_json = excluded.features_json;";

        var paramsList = items.Select(i => new
        {
            i.SignalDate,
            i.StockCode,
            i.SignalType,
            i.StrategyName,
            i.EntryPrice,
            i.Volume20dAvg,
            i.IsNoise,
            i.NoiseReason,
            i.Status,
            i.IsWin,
            i.FeaturesJson,
            CreatedAtStr = i.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss")
        });

        await connection.ExecuteAsync(sql, paramsList, transaction);
        await transaction.CommitAsync();
    }

    public async Task<List<SignalTrackingItem>> GetPendingSignalTrackingAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = @"
            SELECT id, signal_date as SignalDate, code as StockCode, signal_type as SignalType,
                   strategy_name as StrategyName, entry_price as EntryPrice, next_open as NextOpen,
                   next_close as NextClose, return_1d as Return1D, return_3d as Return3D,
                   return_5d as Return5D, max_return_5d as MaxReturn5D, max_drawdown_5d as MaxDrawdown5D,
                   volume_20d_avg as Volume20dAvg, is_noise as IsNoise, noise_reason as NoiseReason,
                   status as Status, is_win as IsWin, features_json as FeaturesJson
            FROM signal_tracking 
            WHERE status = 'Pending' OR return_5d IS NULL
            ORDER BY signal_date ASC";
        var list = await connection.QueryAsync<SignalTrackingItem>(sql);
        return list.ToList();
    }

    public async Task BatchUpdateSignalTrackingAsync(IEnumerable<SignalTrackingItem> items)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var sql = @"
            UPDATE signal_tracking SET
                next_open = @NextOpen,
                next_close = @NextClose,
                return_1d = @Return1D,
                return_3d = @Return3D,
                return_5d = @Return5D,
                max_return_5d = @MaxReturn5D,
                max_drawdown_5d = @MaxDrawdown5D,
                volume_20d_avg = @Volume20dAvg,
                is_noise = @IsNoise,
                noise_reason = @NoiseReason,
                status = @Status,
                is_win = @IsWin,
                verified_at = @VerifiedAtStr
            WHERE id = @Id;";

        var paramsList = items.Select(i => new
        {
            i.Id,
            i.NextOpen,
            i.NextClose,
            i.Return1D,
            i.Return3D,
            i.Return5D,
            i.MaxReturn5D,
            i.MaxDrawdown5D,
            i.Volume20dAvg,
            i.IsNoise,
            i.NoiseReason,
            i.Status,
            i.IsWin,
            VerifiedAtStr = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
        });

        await connection.ExecuteAsync(sql, paramsList, transaction);
        await transaction.CommitAsync();
    }

    public async Task<List<SignalTrackingItem>> GetRecentSignalTrackingAsync(int limit = 100)
    {
        using var connection = new SqliteConnection(_connectionString);
        var sql = @"
            SELECT id, signal_date as SignalDate, code as StockCode, signal_type as SignalType,
                   strategy_name as StrategyName, entry_price as EntryPrice, next_open as NextOpen,
                   next_close as NextClose, return_1d as Return1D, return_3d as Return3D,
                   return_5d as Return5D, max_return_5d as MaxReturn5D, max_drawdown_5d as MaxDrawdown5D,
                   volume_20d_avg as Volume20dAvg, is_noise as IsNoise, noise_reason as NoiseReason,
                   status as Status, is_win as IsWin, features_json as FeaturesJson
            FROM signal_tracking
            ORDER BY signal_date DESC, id DESC
            LIMIT @Limit";
        var list = await connection.QueryAsync<SignalTrackingItem>(sql, new { Limit = limit });
        return list.ToList();
    }

    public async Task<VerificationSummary> GetVerificationSummaryAsync(int daysWindow = 60)
    {
        using var connection = new SqliteConnection(_connectionString);
        var minDate = DateTime.Now.Date.AddDays(-daysWindow).ToString("yyyy-MM-dd");

        var sql = @"
            SELECT id, signal_date as SignalDate, code as StockCode, signal_type as SignalType,
                   strategy_name as StrategyName, entry_price as EntryPrice, next_open as NextOpen,
                   next_close as NextClose, return_1d as Return1D, return_3d as Return3D,
                   return_5d as Return5D, max_return_5d as MaxReturn5D, max_drawdown_5d as MaxDrawdown5D,
                   volume_20d_avg as Volume20dAvg, is_noise as IsNoise, noise_reason as NoiseReason,
                   status as Status, is_win as IsWin, features_json as FeaturesJson
            FROM signal_tracking
            WHERE signal_date >= @MinDate";

        var allItems = (await connection.QueryAsync<SignalTrackingItem>(sql, new { MinDate = minDate })).ToList();
        var allStocks = (await GetAllStocksAsync()).ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);

        var rawVerified = allItems.Where(i => i.Return1D.HasValue).ToList();
        var cleanVerified = rawVerified.Where(i => i.IsNoise == 0).ToList();

        var summary = new VerificationSummary
        {
            TotalTrackedSignals = allItems.Count,
            TotalVerifiedSignals = cleanVerified.Count,
            FilteredNoiseSignals = allItems.Count(i => i.IsNoise == 1),
            LastCalculatedAt = DateTime.Now
        };

        if (rawVerified.Any())
        {
            summary.RawWinRate1D = Math.Round((decimal)rawVerified.Count(i => i.IsWin == 1) / rawVerified.Count, 4);
        }

        if (cleanVerified.Any())
        {
            summary.OverallWinRate1D = Math.Round((decimal)cleanVerified.Count(i => i.IsWin == 1) / cleanVerified.Count, 4);
            summary.OverallAvgReturn1D = Math.Round(cleanVerified.Average(i => i.Return1D ?? 0), 4);

            var with3D = cleanVerified.Where(i => i.Return3D.HasValue).ToList();
            if (with3D.Any())
            {
                summary.OverallWinRate3D = Math.Round((decimal)with3D.Count(i => (i.Return3D ?? 0) > 0) / with3D.Count, 4);
                summary.OverallAvgReturn3D = Math.Round(with3D.Average(i => i.Return3D ?? 0), 4);
            }
        }
        else
        {
            summary.OverallWinRate1D = summary.RawWinRate1D;
        }

        // 1. 依策略分組統計與計算動態自適應權重 (以純化樣本為主，保護優質策略不被殭屍股拖垮)
        var groupedByStrat = allItems.GroupBy(i => i.StrategyName);
        foreach (var grp in groupedByStrat)
        {
            var total = grp.Count();
            var stratRaw = grp.Where(i => i.Return1D.HasValue).ToList();
            var stratClean = stratRaw.Where(i => i.IsNoise == 0).ToList();
            var noiseCount = stratRaw.Count(i => i.IsNoise == 1);

            decimal rawWinRate = stratRaw.Count > 0 ? Math.Round((decimal)stratRaw.Count(i => i.IsWin == 1) / stratRaw.Count, 4) : 0m;
            
            var effectiveSet = stratClean.Count >= 3 ? stratClean : stratRaw;
            int verifiedCount = effectiveSet.Count;
            int wins = effectiveSet.Count(i => i.IsWin == 1);
            decimal cleanWinRate = verifiedCount > 0 ? Math.Round((decimal)wins / verifiedCount, 4) : 0m;
            decimal avgRet1D = verifiedCount > 0 ? Math.Round(effectiveSet.Average(i => i.Return1D ?? 0), 4) : 0m;

            var with3D = effectiveSet.Where(i => i.Return3D.HasValue).ToList();
            decimal avgRet3D = with3D.Any() ? Math.Round(with3D.Average(i => i.Return3D ?? 0), 4) : 0m;

            decimal totalGains = effectiveSet.Where(i => (i.Return1D ?? 0) > 0).Sum(i => i.Return1D ?? 0);
            decimal totalLosses = Math.Abs(effectiveSet.Where(i => (i.Return1D ?? 0) < 0).Sum(i => i.Return1D ?? 0));
            decimal profitFactor = totalLosses > 0 ? Math.Round(totalGains / totalLosses, 2) : (totalGains > 0 ? 3.0m : 1.0m);

            decimal weight = 1.0m;
            string status = "Active";

            if (verifiedCount >= 5)
            {
                if (cleanWinRate >= 0.60m && profitFactor >= 1.3m)
                {
                    weight = Math.Min(2.5m, 1.0m + (cleanWinRate - 0.5m) * 2.5m);
                    status = "ScaledUp";
                }
                else if (cleanWinRate < 0.40m || profitFactor < 0.8m)
                {
                    weight = Math.Max(0.2m, 1.0m - (0.5m - cleanWinRate) * 2.0m);
                    status = cleanWinRate < 0.30m ? "Hibernating" : "Demoted";
                }
            }

            summary.StrategyMetrics.Add(new StrategyPerformanceMetric
            {
                StrategyName = grp.Key,
                TotalSignals = total,
                VerifiedSignals = stratRaw.Count,
                CleanSignals = stratClean.Count,
                NoiseCount = noiseCount,
                WinCount = wins,
                WinRate = cleanWinRate,
                RawWinRate = rawWinRate,
                AvgReturn1D = avgRet1D,
                AvgReturn3D = avgRet3D,
                ProfitFactor = profitFactor,
                AdaptiveWeight = Math.Round(weight, 2),
                StatusRecommendation = status
            });
        }

        // 2. 訓練與計算「個股 × 策略」適配組合 (Stock-Strategy Affinity Matrix)
        var stockStratGroups = rawVerified.GroupBy(i => (i.StockCode, i.StrategyName));
        foreach (var grp in stockStratGroups)
        {
            var code = grp.Key.StockCode;
            var stratName = grp.Key.StrategyName;
            var samples = grp.ToList();
            int sampleCount = samples.Count;
            int wins = samples.Count(i => i.IsWin == 1);
            decimal winRate = Math.Round((decimal)wins / sampleCount, 4);
            decimal avgRet = Math.Round(samples.Average(i => i.Return1D ?? 0), 4);

            decimal gains = samples.Where(i => (i.Return1D ?? 0) > 0).Sum(i => i.Return1D ?? 0);
            decimal losses = Math.Abs(samples.Where(i => (i.Return1D ?? 0) < 0).Sum(i => i.Return1D ?? 0));
            decimal pf = losses > 0 ? Math.Round(gains / losses, 2) : (gains > 0 ? 3.0m : 1.0m);

            decimal affinityScore = Math.Round(Math.Clamp((winRate * 60m) + (pf >= 1m ? (pf - 1m) * 15m : -10m) + Math.Min(25m, sampleCount * 5m), 0m, 100m), 1);

            string fitLevel = "Evaluating";
            if (sampleCount >= 2)
            {
                if (winRate >= 0.65m && pf >= 1.2m) fitLevel = "Optimal";
                else if (winRate >= 0.50m) fitLevel = "Good";
                else if (winRate < 0.35m || pf < 0.6m) fitLevel = "Mismatched";
            }

            bool isRecommended = fitLevel == "Optimal" || (fitLevel == "Good" && winRate >= 0.55m);

            allStocks.TryGetValue(code, out var sInfo);

            summary.TopStockAffinities.Add(new StockStrategyAffinity
            {
                StockCode = code,
                StockName = sInfo?.Name ?? code,
                Industry = sInfo?.Industry ?? "其他",
                StrategyName = stratName,
                SampleCount = sampleCount,
                WinCount = wins,
                WinRate = winRate,
                AvgReturn1D = avgRet,
                ProfitFactor = pf,
                AffinityScore = affinityScore,
                FitLevel = fitLevel,
                IsRecommendedUniverse = isRecommended
            });
        }

        summary.TopStockAffinities = summary.TopStockAffinities
            .OrderByDescending(a => a.AffinityScore)
            .ThenByDescending(a => a.SampleCount)
            .Take(150)
            .ToList();

        // 3. 統計各策略專屬有效股票池數量 (DedicatedUniverseCount)
        foreach (var m in summary.StrategyMetrics)
        {
            m.DedicatedUniverseCount = summary.TopStockAffinities
                .Count(a => a.StrategyName.Equals(m.StrategyName, StringComparison.OrdinalIgnoreCase) && a.IsRecommendedUniverse);
        }

        // 4. 統計「產業族群 × 策略」適配組合 (Industry-Strategy Affinity Matrix)
        var industryGroups = rawVerified
            .Where(i => allStocks.ContainsKey(i.StockCode))
            .GroupBy(i => (Industry: allStocks[i.StockCode].Industry, i.StrategyName))
            .Where(g => !string.IsNullOrEmpty(g.Key.Industry));

        foreach (var grp in industryGroups)
        {
            var samples = grp.ToList();
            int sampleCount = samples.Count;
            int wins = samples.Count(i => i.IsWin == 1);
            decimal winRate = Math.Round((decimal)wins / sampleCount, 4);
            decimal avgRet = Math.Round(samples.Average(i => i.Return1D ?? 0), 4);

            decimal gains = samples.Where(i => (i.Return1D ?? 0) > 0).Sum(i => i.Return1D ?? 0);
            decimal losses = Math.Abs(samples.Where(i => (i.Return1D ?? 0) < 0).Sum(i => i.Return1D ?? 0));
            decimal pf = losses > 0 ? Math.Round(gains / losses, 2) : (gains > 0 ? 3.0m : 1.0m);

            string fitRec = "Neutral";
            if (sampleCount >= 3)
            {
                if (winRate >= 0.60m && pf >= 1.2m) fitRec = "HighlySuitable";
                else if (winRate >= 0.50m) fitRec = "Suitable";
                else if (winRate < 0.40m) fitRec = "Caution";
            }

            summary.IndustryAffinities.Add(new IndustryStrategyAffinity
            {
                Industry = grp.Key.Industry,
                StrategyName = grp.Key.StrategyName,
                SampleCount = sampleCount,
                WinCount = wins,
                WinRate = winRate,
                AvgReturn1D = avgRet,
                ProfitFactor = pf,
                FitRecommendation = fitRec
            });
        }

        summary.IndustryAffinities = summary.IndustryAffinities
            .OrderByDescending(ia => ia.SampleCount)
            .ThenByDescending(ia => ia.WinRate)
            .ToList();

        return summary;
    }
}
