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

            var stocks = await stockRepo.GetAllStocksAsync();
            var stockCodes = stocks.Select(s => s.Code).ToList();

            await AnsiConsole.Progress()
                .StartAsync(async ctx =>
                {
                    var task = ctx.AddTask("[green]Updating historical data...[/]", new ProgressTaskSettings { MaxValue = stockCodes.Count });

                    foreach (var code in stockCodes)
                    {
                        try
                        {
                            await updateService.UpdateHistoricalDataAsync(code);
                        }
                        catch
                        {
                            // ignore individual fail
                        }
                        task.Increment(1);
                    }
                });

            AnsiConsole.MarkupLine("[bold green]Update complete![/]");
        });

        return command;
    }
}
