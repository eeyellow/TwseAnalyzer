using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Core.Indicators;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TrackingController : ControllerBase
{
    private readonly IStockRepository _repo;
    private readonly TrackingService _trackingService;
    private readonly PortfolioService _portfolioService;
    private readonly IIndicatorService _indicatorService;

    public TrackingController(
        IStockRepository repo,
        TrackingService trackingService,
        PortfolioService portfolioService,
        IIndicatorService indicatorService)
    {
        _repo = repo;
        _trackingService = trackingService;
        _portfolioService = portfolioService;
        _indicatorService = indicatorService;
    }

    [HttpGet("list")]
    public async Task<IActionResult> GetList([FromQuery] string? search = null, [FromQuery] int? status = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var allStocks = await _repo.GetAllStocksAsync();
        
        // Filter by search
        if (!string.IsNullOrWhiteSpace(search))
        {
            allStocks = allStocks.Where(s => 
                s.Code.Contains(search, StringComparison.OrdinalIgnoreCase) || 
                s.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        var portfolioDict = _portfolioService.GetAll().ToDictionary(p => p.StockCode);
        var trackedSet = new HashSet<string>(_trackingService.GetAll());

        // Map status
        var items = allStocks.Select(s => new TrackingItem
        {
            StockCode = s.Code,
            StockName = s.Name,
            Status = portfolioDict.ContainsKey(s.Code) ? 2 : (trackedSet.Contains(s.Code) ? 1 : 0) // 2: InStock, 1: Tracked, 0: Untracked
        }).ToList();

        // Filter by status if provided
        if (status.HasValue)
        {
            items = items.Where(i => i.Status == status.Value).ToList();
        }

        // Sort: InStock -> Tracked -> Untracked -> Code
        items = items.OrderByDescending(i => i.Status).ThenBy(i => i.StockCode).ToList();

        var totalCount = items.Count;
        var pagedItems = items.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        // Load metrics for paged items
        var columns = new[] { "Date", "Close", "SMA(20)", "EMA(12)", "RSI(14)", "KD", "MACD Histogram" };

        foreach (var item in pagedItems)
        {
            var history = await _repo.GetDailyPricesAsync(item.StockCode);
            if (history.Count == 0) continue;

            var smaList = _indicatorService.CalculateSma(history, 20).ToList();
            var emaList = _indicatorService.CalculateEma(history, 12).ToList();
            var kdList = _indicatorService.CalculateKd(history).ToList();
            var rsiList = _indicatorService.CalculateRsi(history, 14).ToList();
            var macdList = _indicatorService.CalculateMacd(history).ToList();

            var lastDay = history[^1];
            var lastIndex = history.Count - 1;

            var k = kdList[lastIndex].K;
            var d = kdList[lastIndex].D;
            var kdString = k.HasValue && d.HasValue ? $"{k.Value:F2} / {d.Value:F2}" : "-";

            item.Metrics = new Dictionary<string, string>
            {
                { "Date", lastDay.Date.ToString("yyyy-MM-dd") },
                { "Close", lastDay.Close.ToString("F2") },
                { "SMA(20)", smaList[lastIndex].Sma?.ToString("F2") ?? "-" },
                { "EMA(12)", emaList[lastIndex].Ema?.ToString("F2") ?? "-" },
                { "RSI(14)", rsiList[lastIndex].Rsi?.ToString("F2") ?? "-" },
                { "KD", kdString },
                { "MACD Histogram", macdList[lastIndex].Histogram?.ToString("F2") ?? "-" }
            };
        }

        return Ok(new
        {
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize,
            Columns = columns,
            Items = pagedItems
        });
    }

    [HttpPost("{stockCode}")]
    public IActionResult Track(string stockCode)
    {
        _trackingService.Add(stockCode);
        return Ok();
    }

    [HttpDelete("{stockCode}")]
    public IActionResult Untrack(string stockCode)
    {
        _trackingService.Remove(stockCode);
        return Ok();
    }
}

public class TrackingItem
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Status { get; set; }
    public Dictionary<string, string> Metrics { get; set; } = new();
}
