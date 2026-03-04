using System.CommandLine;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Backtesting;
using TWSE.Core.Data;
using TWSE.Core.Models;

namespace TWSE.Cli.Commands;

public class BacktestCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public BacktestCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("backtest", "Run a backtest using a strategy file.");
        var strategyOption = new Option<string>("--strategy", "Path to the strategy JSON file.") { IsRequired = true };
        var stockOption = new Option<string>("--stock", "Specific stock code to backtest on.");
        var allOption = new Option<bool>("--all", "Backtest on all listed stocks.");
        var topOption = new Option<int>("--top", () => 20, "Number of top results to show when backtesting all stocks.");

        command.AddOption(strategyOption);
        command.AddOption(stockOption);
        command.AddOption(allOption);
        command.AddOption(topOption);

        command.SetHandler(async (string strategyFile, string? stockOptionValue, bool allOptionValue, int topOptionValue) =>
        {
            if (!File.Exists(strategyFile))
            {
                AnsiConsole.MarkupLine($"[red]Strategy file '{strategyFile}' not found.[/]");
                return;
            }

            var json = await File.ReadAllTextAsync(strategyFile);
            var config = JsonSerializer.Deserialize<StrategyConfig>(json);
            if (config == null) return;

            var engine = _serviceProvider.GetRequiredService<IBacktestEngine>();
            var stockRepo = _serviceProvider.GetRequiredService<IStockRepository>();

            if (!allOptionValue && !string.IsNullOrEmpty(stockOptionValue))
            {
                AnsiConsole.MarkupLine($"[yellow]Running backtest for {stockOptionValue}...[/]");
                var data = await stockRepo.GetDailyPricesAsync(stockOptionValue);
                var result = await engine.RunAsync(stockOptionValue, config, data);

                var table = new Table();
                table.AddColumn("Metric");
                table.AddColumn("Value");
                table.AddRow("Initial Capital", result.InitialCapital.ToString("N0"));
                table.AddRow("Final Capital", result.FinalCapital.ToString("N0"));
                table.AddRow("Total Return", $"[{(result.TotalReturn >= 0 ? "green" : "red")}]{result.TotalReturn:P2}[/]");
                table.AddRow("Annualized Return", $"[{(result.AnnualizedReturn >= 0 ? "green" : "red")}]{result.AnnualizedReturn:P2}[/]");
                table.AddRow("Win Rate", $"{result.WinRate:P2}");
                table.AddRow("Total Trades", result.TotalTrades.ToString());
                table.AddRow("Max Drawdown", $"[red]{result.MaxDrawdown:P2}[/]");
                table.AddRow("Sharpe Ratio", result.SharpeRatio.ToString("F2"));
                
                AnsiConsole.Write(table);

                AnsiConsole.MarkupLine("\n[bold]Trade History:[/]");
                var tradeTable = new Table();
                tradeTable.AddColumns("Buy Date", "Buy Price", "Sell Date", "Sell Price", "Return", "Days");
                foreach (var trade in result.Trades)
                {
                    tradeTable.AddRow(
                        trade.BuyDate.ToString("yyyy-MM-dd"),
                        trade.BuyPrice.ToString("F2"),
                        trade.SellDate?.ToString("yyyy-MM-dd") ?? "-",
                        trade.SellPrice?.ToString("F2") ?? "-",
                        $"[{(trade.ReturnRate >= 0 ? "green" : "red")}]{trade.ReturnRate:P2}[/]",
                        trade.HoldDays?.ToString() ?? "-"
                    );
                }
                AnsiConsole.Write(tradeTable);
            }
            else if (allOptionValue)
            {
                AnsiConsole.MarkupLine($"[yellow]Loading all history for full market backtest...[/]");
                var allStocks = await stockRepo.GetAllStocksAsync();
                var historyDict = new Dictionary<string, IReadOnlyList<OHLCV>>();

                await AnsiConsole.Status()
                    .StartAsync("Loading data from DB...", async ctx =>
                    {
                        foreach (var st in allStocks)
                        {
                            var prices = await stockRepo.GetDailyPricesAsync(st.Code);
                            if (prices.Count > 0)
                            {
                                historyDict[st.Code] = prices;
                            }
                        }
                    });

                AnsiConsole.MarkupLine($"[yellow]Running backtest on {historyDict.Count} stocks...[/]");
                var results = await engine.ScanAllAsync(config, historyDict);

                var topResults = results.Take(topOptionValue).ToList();
                var table = new Table();
                table.AddColumns("Code", "Total Return", "Ann. Return", "Win Rate", "MDD", "Trades");

                foreach (var res in topResults)
                {
                    table.AddRow(
                        $"[cyan]{res.StockCode}[/]",
                        $"[{(res.TotalReturn >= 0 ? "green" : "red")}]{res.TotalReturn:P2}[/]",
                        $"[{(res.AnnualizedReturn >= 0 ? "green" : "red")}]{res.AnnualizedReturn:P2}[/]",
                        $"{res.WinRate:P2}",
                        $"[red]{res.MaxDrawdown:P2}[/]",
                        res.TotalTrades.ToString()
                    );
                }
                AnsiConsole.Write(table);
            }
        }, strategyOption, stockOption, allOption, topOption);

        return command;
    }
}
