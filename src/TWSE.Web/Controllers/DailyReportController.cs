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
        var targetDate = DateTime.Now.Date;
        var signals = await _repo.GetDailySignalsAsync(targetDate);
        
        if (!signals.Any())
        {
            var latestDate = await _repo.GetLatestSignalDateAsync();
            if (latestDate.HasValue)
            {
                targetDate = latestDate.Value;
                signals = await _repo.GetDailySignalsAsync(targetDate);
            }
        }

        return Ok(new
        {
            Date = targetDate,
            Signals = signals
        });
    }
}
