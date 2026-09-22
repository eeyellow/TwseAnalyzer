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
    private readonly ITwseFetcher _twseFetcher;
    private readonly ILogger<JobsController> _logger;

    public JobsController(
        DailyAnalysisService analysisService,
        IDataUpdateService updateService,
        IStockRepository stockRepo,
        ITwseFetcher twseFetcher,
        ILogger<JobsController> logger)
    {
        _analysisService = analysisService;
        _updateService = updateService;
        _stockRepo = stockRepo;
        _twseFetcher = twseFetcher;
        _logger = logger;
    }

    [HttpPost("sync-stocks")]
    public async Task<IActionResult> SyncStocks()
    {
        try
        {
            _logger.LogInformation("Manual trigger: Syncing listed stocks and ETFs from TWSE/TPEx ISIN...");
            var latestStocks = await _twseFetcher.FetchListedStocksAsync();
            if (latestStocks.Any())
            {
                await _stockRepo.InsertStocksAsync(latestStocks);
            }
            return Ok(new { message = $"個股與ETF代碼清單同步完成，共 {latestStocks.Count} 檔標的。", count = latestStocks.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync stocks list");
            return StatusCode(500, new { message = "同步標的代碼失敗", error = ex.Message });
        }
    }

    [HttpPost("update-data")]
    public async Task<IActionResult> UpdateData()
    {
        _logger.LogInformation("Manual trigger: Starting daily data update in-process...");
        try
        {
            // 1. 先同步最新掛牌股票與 ETF 清單 (包括新發行主動式 ETF 等)
            try
            {
                var latestStocks = await _twseFetcher.FetchListedStocksAsync();
                if (latestStocks.Any())
                {
                    await _stockRepo.InsertStocksAsync(latestStocks);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync latest stocks list, continuing with database stocks.");
            }

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
    public async Task<IActionResult> RunAnalysis([FromQuery] string? date = null)
    {
        try
        {
            DateTime targetDate;
            if (!string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var parsed))
            {
                targetDate = parsed.Date;
            }
            else
            {
                // 若無指定日期，優先取具有指標性收盤價的最新交易日（如 2330），避免因當日全市場尚未更新導致空訊號
                var latestPriceDate = await _stockRepo.GetLatestPriceDateAsync("2330");
                var marketDate = MarketDateHelper.GetTargetMarketDate();
                targetDate = (latestPriceDate.HasValue && latestPriceDate.Value.Date < marketDate)
                    ? latestPriceDate.Value.Date
                    : marketDate;
            }

            _logger.LogInformation("Manual trigger: Starting daily analysis for {Date:yyyy-MM-dd}", targetDate);
            await _analysisService.RunAnalysisAsync(targetDate);
            return Ok(new { message = $"指定日期 {targetDate:yyyy-MM-dd} 系統分析完成", targetDate = targetDate.ToString("yyyy-MM-dd") });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run analysis manually");
            return StatusCode(500, new { message = "分析失敗", error = ex.Message });
        }
    }
}
