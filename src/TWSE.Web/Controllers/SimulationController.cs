using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Models;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SimulationController : ControllerBase
{
    private readonly HistoricalReplayService _replayService;
    private readonly ILogger<SimulationController> _logger;

    public SimulationController(HistoricalReplayService replayService, ILogger<SimulationController> logger)
    {
        _replayService = replayService;
        _logger = logger;
    }

    [HttpPost("start")]
    public IActionResult StartSimulation([FromBody] SimulationRequest? request)
    {
        request ??= new SimulationRequest();

        // Default sanity checks
        if (request.StartDate < new DateTime(1995, 1, 1))
        {
            request.StartDate = new DateTime(2020, 1, 1);
        }
        if (request.EndDate > DateTime.Now.Date)
        {
            request.EndDate = DateTime.Now.Date;
        }
        if (request.EndDate <= request.StartDate)
        {
            return BadRequest(new { message = "結束日期必須晚於起始日期。" });
        }

        _logger.LogInformation("API requested simulation from {Start:yyyy-MM-dd} to {End:yyyy-MM-dd}",
            request.StartDate, request.EndDate);

        var status = _replayService.StartSimulation(request);
        return Ok(status);
    }

    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        var status = _replayService.GetStatus();
        return Ok(status);
    }

    [HttpGet("summary")]
    public IActionResult GetSummary()
    {
        var summary = _replayService.GetLatestSummary();
        if (summary == null)
        {
            return NotFound(new { message = "尚未有已完成的歷史回放報告。" });
        }
        return Ok(summary);
    }

    [HttpPost("cancel")]
    public IActionResult CancelSimulation()
    {
        _replayService.CancelSimulation();
        return Ok(new { message = "已請求取消歷史回放模擬。" });
    }
}
