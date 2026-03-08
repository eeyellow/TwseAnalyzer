using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Backtesting;
using TWSE.Core.Data;
using TWSE.Core.Models;
using TWSE.Core.Screening;
using Skender.Stock.Indicators;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalysisController : ControllerBase
{
    private readonly IStockRepository _repo;
    private readonly IConditionEvaluator _evaluator;
    public AnalysisController(IStockRepository repo, IConditionEvaluator evaluator)
    {
        _repo = repo;
        _evaluator = evaluator;
    }

    [HttpGet("strategies")]
    public IActionResult GetStrategies()
    {
        var strategiesDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "strategies");
        strategiesDir = Path.GetFullPath(strategiesDir);

        if (!Directory.Exists(strategiesDir))
            return Ok(Array.Empty<object>());

        var files = Directory.GetFiles(strategiesDir, "*.json");
        var strategies = files.Select(f => new
        {
            Name = Path.GetFileNameWithoutExtension(f),
            FileName = Path.GetFileName(f)
        });

        return Ok(strategies);
    }

    [HttpPost("scan-portfolio")]
    public async Task<IActionResult> ScanPortfolio([FromBody] ScanRequest request)
    {
        var strategiesDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "strategies");
        strategiesDir = Path.GetFullPath(strategiesDir);
        var strategyPath = Path.Combine(strategiesDir, request.StrategyFileName);

        if (!System.IO.File.Exists(strategyPath))
            return BadRequest($"Strategy file '{request.StrategyFileName}' not found.");

        var json = await System.IO.File.ReadAllTextAsync(strategyPath);
        var config = JsonSerializer.Deserialize<StrategyConfig>(json);
        if (config == null)
            return BadRequest("Failed to parse strategy file.");

        var portfolio = request.MyStocks ?? new List<PortfolioItemDto>();
        var results = new List<StockSignalResult>();

        foreach (var item in portfolio)
        {
            var history = await _repo.GetDailyPricesAsync(item.StockCode);
            if (history.Count < 20) continue;

            var lastIndex = history.Count - 1;
            var buySignal = _evaluator.EvaluateAll(config.Entry, history, lastIndex);
            var sellSignal = _evaluator.EvaluateAll(config.Exit, history, lastIndex);

            decimal profitLoss = 0;
            if (item.Quantity > 0)
            {
                var currentPrice = history[lastIndex].Close;
                var buyCost = item.AvgCost * item.Quantity;
                var buyFee = Math.Max(20, Math.Floor(buyCost * 0.001425m));
                var totalCost = buyCost + buyFee;

                var sellValue = currentPrice * item.Quantity;
                var sellFee = Math.Max(20, Math.Floor(sellValue * 0.001425m));
                var sellTax = Math.Floor(sellValue * 0.003m);
                var netSellValue = sellValue - sellFee - sellTax;

                profitLoss = netSellValue - totalCost;
            }

            results.Add(new StockSignalResult
            {
                StockCode = item.StockCode,
                StockName = item.StockName,
                Quantity = item.Quantity,
                AvgCost = item.AvgCost,
                LastClose = history[lastIndex].Close,
                LastDate = history[lastIndex].Date,
                BuySignal = buySignal,
                SellSignal = sellSignal,
                ProfitLoss = profitLoss
            });
        }

        return Ok(results);
    }

    [HttpPost("snapshot")]
    public async Task<IActionResult> GetSnapshot([FromBody] SnapshotRequest request)
    {
        var results = new List<SnapshotItemDto>();
        if (request.Codes == null || !request.Codes.Any()) return Ok(results);

        // Required explicitly to compute RSI, etc. We use Skender.Stock.Indicators.
        foreach (var code in request.Codes)
        {
            var history = await _repo.GetDailyPricesAsync(code);
            if (!history.Any()) continue;

            var quotes = history.Select(h => new Skender.Stock.Indicators.Quote
            {
                Date = h.Date,
                Open = h.Open,
                High = h.High,
                Low = h.Low,
                Close = h.Close,
                Volume = h.Volume
            }).OrderBy(q => q.Date).ToList();

            var last = quotes.Last();
            var sma20 = quotes.GetSma(20).LastOrDefault()?.Sma;
            var rsi14 = quotes.GetRsi(14).LastOrDefault()?.Rsi;

            results.Add(new SnapshotItemDto
            {
                StockCode = code,
                Date = last.Date,
                Close = last.Close,
                Volume = last.Volume,
                Sma20 = sma20,
                Rsi14 = rsi14
            });
        }

        return Ok(results);
    }
}

public class ScanRequest
{
    public string StrategyFileName { get; set; } = string.Empty;
    public List<PortfolioItemDto> MyStocks { get; set; } = new();
}

public class SnapshotRequest
{
    public List<string> Codes { get; set; } = new();
}

public class SnapshotItemDto
{
    public string StockCode { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public decimal Close { get; set; }
    public decimal Volume { get; set; }
    public double? Sma20 { get; set; }
    public double? Rsi14 { get; set; }
}

public class PortfolioItemDto
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
}

public class StockSignalResult
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public decimal LastClose { get; set; }
    public DateTime LastDate { get; set; }
    public bool BuySignal { get; set; }
    public bool SellSignal { get; set; }
    public decimal ProfitLoss { get; set; }
}
