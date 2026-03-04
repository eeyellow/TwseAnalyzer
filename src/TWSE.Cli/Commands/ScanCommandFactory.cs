using System.CommandLine;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Models;
using TWSE.Core.Screening;

namespace TWSE.Cli.Commands;

public class ScanCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public ScanCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("scan", "Scan the market using a specific strategy.");
        var strategyOption = new Option<string>("--strategy", "Path to the JSON strategy file.") { IsRequired = true };
        command.AddOption(strategyOption);

        command.SetHandler(async (string strategyFile) =>
        {
            if (!File.Exists(strategyFile))
            {
                AnsiConsole.MarkupLine($"[red]Strategy file '{strategyFile}' not found.[/]");
                return;
            }

            var json = await File.ReadAllTextAsync(strategyFile);
            var config = JsonSerializer.Deserialize<ScreenerConfig>(json);

            if (config == null)
            {
                AnsiConsole.MarkupLine($"[red]Failed to parse strategy file '{strategyFile}'.[/]");
                return;
            }

            var screener = _serviceProvider.GetRequiredService<IScreener>();

            AnsiConsole.MarkupLine($"[yellow]Scanning market...[/]");
            var matchedStocks = await screener.ScanAsync(config);

            var table = new Table();
            table.AddColumn("Code");
            table.AddColumn("Name");
            table.AddColumn("Industry");

            foreach (var stock in matchedStocks)
            {
                table.AddRow($"[cyan]{stock.Code}[/]", stock.Name, stock.Industry);
            }

            AnsiConsole.Write(table);
            AnsiConsole.MarkupLine($"[green]Found {matchedStocks.Count} stocks matched the criteria.[/]");

        }, strategyOption);

        return command;
    }
}
