using System;
using System.IO;
using Microsoft.Data.Sqlite;
using Dapper;

class Program
{
    static void Main()
    {
        var dbPath = Path.Combine("data", "twse.db");
        using var connection = new SqliteConnection($"Data Source={dbPath}");
        var count = connection.QuerySingle<int>("SELECT COUNT(*) FROM daily_prices WHERE stock_code = '2330'");
        Console.WriteLine($"2330 rows: {count}");
    }
}
