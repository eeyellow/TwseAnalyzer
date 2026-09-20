using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController : ControllerBase
{
    private readonly DailyAnalysisService _analysisService;
    private readonly IDataUpdateService _updateService;
    private readonly IStockRepository _stockRepo;
    private readonly ILogger<JobsController> _logger;

    public JobsController(
        DailyAnalysisService analysisService,
        IDataUpdateService updateService,
        IStockRepository stockRepo,
        ILogger<JobsController> logger)
    {
        _analysisService = analysisService;
        _updateService = updateService;
        _stockRepo = stockRepo;
        _logger = logger;
    }

    [HttpPost("update-data")]
    public async Task<IActionResult> UpdateData()
    {
        _logger.LogInformation("Manual trigger: Starting daily data update in-process...");
        try
        {
            var stocks = await _stockRepo.GetAllStocksAsync();
            var stockCodes = stocks.Select(s => s.Code).ToList();
            _logger.LogInformation("Updating historical data for {Count} stocks...", stockCodes.Count);

            int success = 0;
            int fail = 0;
            foreach (var code in stockCodes)
            {
                try
                {
                    await _updateService.UpdateHistoricalDataAsync(code);
                    success++;
                }
                catch (Exception ex)
                {
                    fail++;
                    _logger.LogWarning("Failed to update {Code}: {Message}", code, ex.Message);
                }
            }

            _logger.LogInformation("Daily update completed. Success: {Success}, Failed: {Fail}", success, fail);
            return Ok(new { message = $"資料更新完成 (成功: {success}, 失敗/略過: {fail})" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run daily update manually");
            return StatusCode(500, new { message = "更新失敗", error = ex.Message });
        }
    }

    [HttpPost("run-analysis")]
    public async Task<IActionResult> RunAnalysis()
    {
        try
        {
            var targetDate = GetTargetMarketDate();
            _logger.LogInformation("Manual trigger: Starting daily analysis for {Date}", targetDate);
            await _analysisService.RunAnalysisAsync(targetDate);
            return Ok(new { message = "系統分析完成" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run analysis manually");
            return StatusCode(500, new { message = "分析失敗", error = ex.Message });
        }
    }

    private DateTime GetTargetMarketDate()
    {
        var now = DateTime.Now;
        var target = now.Date;

        if (now.Hour < 18)
        {
            target = target.AddDays(-1);
        }

        while (target.DayOfWeek == DayOfWeek.Saturday || target.DayOfWeek == DayOfWeek.Sunday)
        {
            target = target.AddDays(-1);
        }
        return target;
    }
}
