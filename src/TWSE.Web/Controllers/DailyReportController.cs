using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Core.Models;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DailyReportController : ControllerBase
{
    private readonly IStockRepository _repo;

    public DailyReportController(IStockRepository repo)
    {
        _repo = repo;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        // 先嘗試抓今天的分析結果
        var targetDate = DateTime.Now.Date;
        var signals = await _repo.GetDailySignalsAsync(targetDate);
        
        // 如果今天還沒資料，往回找最近的 5 天
        if (!signals.Any())
        {
            for (int i = 1; i <= 5; i++)
            {
                signals = await _repo.GetDailySignalsAsync(targetDate.AddDays(-i));
                if (signals.Any())
                {
                    targetDate = targetDate.AddDays(-i);
                    break;
                }
            }
        }

        return Ok(new
        {
            Date = targetDate,
            Signals = signals
        });
    }
}
