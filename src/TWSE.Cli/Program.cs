using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using TWSE.Core.Data;
using TWSE.Core.Indicators;
using TWSE.Core.Screening;
using TWSE.Core.Backtesting;
using TWSE.Cli.Commands;

namespace TWSE.Cli;

class Program
{
    static async Task<int> Main(string[] args)
    {
        var services = new ServiceCollection();

        // Register Core Services
        services.AddHttpClient();
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "data");
        if (!Directory.Exists(dataPath)) Directory.CreateDirectory(dataPath);
        var dbPath = Path.Combine(dataPath, "twse.db");
        services.AddSingleton<IStockRepository>(new SqliteRepository($"Data Source={dbPath}"));
        services.AddTransient<ITwseFetcher, TwseFetcher>();
        services.AddSingleton<IYahooFetcher, YahooFetcher>(); // Singleton because of Semaphore
        services.AddTransient<IDataUpdateService, DataUpdateService>();
        services.AddTransient<IIndicatorService, SkenderIndicatorService>();
        services.AddTransient<IConditionEvaluator, JsonConditionEvaluator>();
        services.AddTransient<IScreener, StockScreener>();
        services.AddTransient<IBacktestEngine, BacktestEngine>();

        var serviceProvider = services.BuildServiceProvider();

        var rootCommand = new RootCommand("TWSE Analyzer CLI");

        rootCommand.AddCommand(new InitCommandFactory(serviceProvider).CreateCommand());
        rootCommand.AddCommand(new UpdateCommandFactory(serviceProvider).CreateCommand());
        rootCommand.AddCommand(new ScanCommandFactory(serviceProvider).CreateCommand());
        rootCommand.AddCommand(new BacktestCommandFactory(serviceProvider).CreateCommand());
        rootCommand.AddCommand(new AnalyzeCommandFactory(serviceProvider).CreateCommand());

        return await rootCommand.InvokeAsync(args);
    }
}
