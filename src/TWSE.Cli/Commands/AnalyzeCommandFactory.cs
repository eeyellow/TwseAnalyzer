using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Spectre.Console;
using TWSE.Core.Data;
using TWSE.Core.Indicators;

namespace TWSE.Cli.Commands;

public class AnalyzeCommandFactory
{
    private readonly ServiceProvider _serviceProvider;

    public AnalyzeCommandFactory(ServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Command CreateCommand()
    {
        var command = new Command("analyze", "Analyze a specific stock and show recent indicators.");
        var stockOption = new Option<string>("--stock", "Stock code.") { IsRequired = true };
        command.AddOption(stockOption);

        command.SetHandler(async (string stockCode) =>
        {
            var stockRepo = _serviceProvider.GetRequiredService<IStockRepository>();
            var indicatorService = _serviceProvider.GetRequiredService<IIndicatorService>();

            var prices = await stockRepo.GetDailyPricesAsync(stockCode);
            if (prices.Count == 0)
            {
                AnsiConsole.MarkupLine($"[red]No historical data for {stockCode}. Please run update first.[/]");
                return;
            }

            var smaList = indicatorService.CalculateSma(prices, 20).ToList();
            var emaList = indicatorService.CalculateEma(prices, 12).ToList();
            var kdList = indicatorService.CalculateKd(prices).ToList();
            var rsiList = indicatorService.CalculateRsi(prices, 14).ToList();
            var macdList = indicatorService.CalculateMacd(prices).ToList();

            var lastPrices = prices.TakeLast(5).ToList();
            var table = new Table();
            table.AddColumns("Date", "Close", "SMA(20)", "EMA(12)", "RSI(14)", "KD", "MACD Histogram");

            foreach (var p in lastPrices)
            {
                var index = prices.IndexOf(p);
                var sma = smaList[index].Sma?.ToString("F2") ?? "-";
                var ema = emaList[index].Ema?.ToString("F2") ?? "-";
                var rsi = rsiList[index].Rsi?.ToString("F2") ?? "-";
                
                var k = kdList[index].K?.ToString("F2") ?? "-";
                var d = kdList[index].D?.ToString("F2") ?? "-";
                var kd = $"{k} / {d}";
                
                var hist = macdList[index].Histogram;
                var histStr = hist?.ToString("F2") ?? "-";
                if (hist > 0) histStr = $"[green]{histStr}[/]";
                else if (hist < 0) histStr = $"[red]+{histStr}[/]"; // add red color

                table.AddRow(
                    p.Date.ToString("yyyy-MM-dd"),
                    p.Close.ToString("F2"),
                    sma,
                    ema,
                    rsi,
                    kd,
                    histStr
                );
            }

            AnsiConsole.Write(table);

        }, stockOption);

        return command;
    }
}
