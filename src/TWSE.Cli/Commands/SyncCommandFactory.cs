using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Data;

namespace TWSE.Cli.Commands;

public class SyncCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public SyncCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("sync", "Sync all listed stocks and ETFs from TWSE/TPEx ISIN directory.");

        command.SetHandler(async () =>
        {
            var twseFetcher = _serviceProvider.GetRequiredService<ITwseFetcher>();
            var stockRepo = _serviceProvider.GetRequiredService<IStockRepository>();

            await AnsiConsole.Status()
                .StartAsync("Fetching listed stocks and ETFs from TWSE & TPEx...", async ctx =>
                {
                    var list = await twseFetcher.FetchListedStocksAsync();
                    await stockRepo.InsertStocksAsync(list);
                    AnsiConsole.MarkupLine($"[bold green]Successfully synced {list.Count} stocks & ETFs into database![/]");
                });
        });

        return command;
    }
}
