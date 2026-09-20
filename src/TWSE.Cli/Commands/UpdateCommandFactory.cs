using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Data;

namespace TWSE.Cli.Commands;

public class UpdateCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public UpdateCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("update", "Update historical data incrementally.");

        command.SetHandler(async () =>
        {
            var updateService = _serviceProvider.GetRequiredService<IDataUpdateService>();
            var stockRepo = _serviceProvider.GetRequiredService<IStockRepository>();
            var twseFetcher = _serviceProvider.GetRequiredService<ITwseFetcher>();

            await AnsiConsole.Status()
                .StartAsync("Syncing listed stocks and ETFs from TWSE/TPEx...", async ctx =>
                {
                    try
                    {
                        var latest = await twseFetcher.FetchListedStocksAsync();
                        if (latest.Any())
                        {
                            await stockRepo.InsertStocksAsync(latest);
                            AnsiConsole.MarkupLine($"[green]Synced {latest.Count} stocks & ETFs from TWSE.[/]");
                        }
                    }
                    catch (Exception ex)
                    {
                        AnsiConsole.MarkupLine($"[yellow]Warning: Could not sync latest stocks list: {ex.Message}[/]");
                    }
                });

            var stocks = await stockRepo.GetAllStocksAsync();
            var stockCodes = stocks.Select(s => s.Code).ToList();

            await AnsiConsole.Progress()
                .StartAsync(async ctx =>
                {
                    var task = ctx.AddTask("[green]Updating historical data...[/]", new ProgressTaskSettings { MaxValue = stockCodes.Count });
                    int successCount = 0;
                    int failCount = 0;

                    foreach (var code in stockCodes)
                    {
                        try
                        {
                            await updateService.UpdateHistoricalDataAsync(code);
                            successCount++;
                        }
                        catch (Exception ex)
                        {
                            failCount++;
                            AnsiConsole.MarkupLine($"[grey]Warning: Failed to update {code}: {ex.Message}[/]");
                        }
                        task.Increment(1);
                    }

                    AnsiConsole.MarkupLine($"[bold green]Update complete![/] Success: [green]{successCount}[/], Failed/Skipped: [yellow]{failCount}[/]");
                });
        });

        return command;
    }
}
