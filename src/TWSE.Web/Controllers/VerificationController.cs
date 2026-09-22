using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VerificationController : ControllerBase
{
    private readonly IStockRepository _repo;
    private readonly DailyAnalysisService _analysisService;

    public VerificationController(IStockRepository repo, DailyAnalysisService analysisService)
    {
        _repo = repo;
        _analysisService = analysisService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] int days = 60)
    {
        var summary = await _repo.GetVerificationSummaryAsync(days);
        return Ok(summary);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] int limit = 100)
    {
        var list = await _repo.GetRecentSignalTrackingAsync(limit);
        var stocks = await _repo.GetAllStocksAsync();
        var stockMap = stocks.ToDictionary(s => s.Code, s => s.Name);

        var result = list.Select(item => new
        {
            item.Id,
            item.SignalDate,
            item.StockCode,
            StockName = stockMap.GetValueOrDefault(item.StockCode, "個股"),
            item.SignalType,
            item.StrategyName,
            item.EntryPrice,
            item.NextOpen,
            item.NextClose,
            item.Return1D,
            item.Return3D,
            item.Return5D,
            item.MaxReturn5D,
            item.MaxDrawdown5D,
            item.Status,
            item.IsWin
        });

        return Ok(result);
    }

    [HttpPost("run")]
    public async Task<IActionResult> RunVerification([FromQuery] string? date = null)
    {
        DateTime targetDate;
        if (!string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var parsedDate))
        {
            targetDate = parsedDate.Date;
        }
        else
        {
            targetDate = MarketDateHelper.GetTargetMarketDate();
        }

        await _analysisService.RunAnalysisAsync(targetDate);
        var summary = await _repo.GetVerificationSummaryAsync(60);

        return Ok(new
        {
            message = $"已完成 {targetDate:yyyy-MM-dd} 迴歸驗證與策略自適應權重計算！",
            targetDate = targetDate.ToString("yyyy-MM-dd"),
            summary = summary
        });
    }
}
