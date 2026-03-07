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
        var strategyOption = new Option<string[]>("--strategy", "Path to the JSON strategy file(s).") { IsRequired = true };
        strategyOption.AllowMultipleArgumentsPerToken = true;
        command.AddOption(strategyOption);

        command.SetHandler(async (string[] strategyFiles) =>
        {
            var aggregatedConfig = new ScreenerConfig();
            bool isFirstValidConfig = true;

            foreach (var strategyFile in strategyFiles)
            {
                if (!File.Exists(strategyFile))
                {
                    AnsiConsole.MarkupLine($"[red]Strategy file '{strategyFile}' not found. Skipping...[/]");
                    continue;
                }

                var json = await File.ReadAllTextAsync(strategyFile);
                var config = JsonSerializer.Deserialize<ScreenerConfig>(json);

                if (config == null)
                {
                    AnsiConsole.MarkupLine($"[yellow]Failed to parse strategy file '{strategyFile}'. Skipping...[/]");
                    continue;
                }

                // Aggregate conditions (AND logic built-in to JasonConditionEvaluator)
                aggregatedConfig.Screen.AddRange(config.Screen);

                // Use the first strategy file to dictate the sorting and limits
                if (isFirstValidConfig)
                {
                    aggregatedConfig.SortBy = config.SortBy;
                    aggregatedConfig.Limit = config.Limit;
                    isFirstValidConfig = false;
                }
            }

            if (isFirstValidConfig)
            {
                AnsiConsole.MarkupLine($"[red]No valid strategy files found.[/]");
                return;
            }

            var screener = _serviceProvider.GetRequiredService<IScreener>();

            AnsiConsole.MarkupLine($"[yellow]Scanning market...[/]");
            var matchedStocks = await screener.ScanAsync(aggregatedConfig);

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
