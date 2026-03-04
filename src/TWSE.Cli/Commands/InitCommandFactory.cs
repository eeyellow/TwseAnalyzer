using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Data;

namespace TWSE.Cli.Commands;

public class InitCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public InitCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("init", "Initialize database and fetch historical data.");
        var yearsOption = new Option<int>("--years", () => 5, "Number of years of historical data to fetch.");
        command.AddOption(yearsOption);

        command.SetHandler(async (int years) =>
        {
            var stockRepo = _serviceProvider.GetRequiredService<IStockRepository>();
            var twseFetcher = _serviceProvider.GetRequiredService<ITwseFetcher>();
            var yahooFetcher = _serviceProvider.GetRequiredService<IYahooFetcher>();

            AnsiConsole.MarkupLine("[bold]Initializing TWSE Analyzer MVP...[/]");

            // 1. Initialize DB
            await AnsiConsole.Status()
                .StartAsync("Setting up database...", async ctx =>
                {
                    await stockRepo.InitializeDatabaseAsync();
                });

            // 2. Fetch Listed Stocks
            var stocks = await AnsiConsole.Status()
                .StartAsync("Fetching listed stocks from TWSE...", async ctx =>
                {
                    var result = await twseFetcher.FetchListedStocksAsync();
                    await stockRepo.InsertStocksAsync(result);
                    return result;
                });

            AnsiConsole.MarkupLine($"[green]Successfully fetched {stocks.Count} stocks.[/]");

            // 3. Download History
            var startDate = DateTime.Today.AddYears(-years);
            await AnsiConsole.Progress()
                .StartAsync(async ctx =>
                {
                    var task = ctx.AddTask("[green]Downloading historical data...[/]", new ProgressTaskSettings { MaxValue = stocks.Count });

                    var totalStocks = stocks.Select(s => s.Code).ToList();
                    var chunkCount = 10;
                    
                    // Simple batching to show progress, throttled by YahooFetcher internally
                    foreach (var code in totalStocks)
                    {
                        var data = await yahooFetcher.FetchHistoricalDataAsync(code, startDate: startDate);
                        if (data.Any())
                        {
                            await stockRepo.InsertDailyPricesAsync(data);
                        }
                        task.Increment(1);
                    }
                });

            AnsiConsole.MarkupLine("[bold green]Initialization complete![/]");
        }, yearsOption);

        return command;
    }
}
