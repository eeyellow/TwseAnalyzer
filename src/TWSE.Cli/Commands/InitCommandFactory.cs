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
        var command = new Command("init", "Initialize database and fetch all historical data.");

        command.SetHandler(async () =>
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
            await AnsiConsole.Progress()
                .StartAsync(async ctx =>
                {
                    var task = ctx.AddTask("[green]Downloading historical data...[/]", new ProgressTaskSettings { MaxValue = stocks.Count });

                    var totalStocks = stocks.Select(s => s.Code).ToList();
                    int successCount = 0;
                    int emptyCount = 0;
                    
                    // Simple batching to show progress, throttled by YahooFetcher internally
                    foreach (var code in totalStocks)
                    {
                        var data = await yahooFetcher.FetchHistoricalDataAsync(code, startDate: null);
                        if (data.Any())
                        {
                            await stockRepo.InsertDailyPricesAsync(data);
                            successCount++;
                        }
                        else
                        {
                            emptyCount++;
                        }
                        task.Increment(1);
                    }

                    AnsiConsole.MarkupLine($"[bold green]Initialization complete![/] Downloaded: [green]{successCount}[/], No Data/Skipped: [yellow]{emptyCount}[/]");
                });
        });

        return command;
    }
}
