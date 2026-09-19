using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController : ControllerBase
{
    private readonly DailyAnalysisService _analysisService;
    private readonly ILogger<JobsController> _logger;

    public JobsController(DailyAnalysisService analysisService, ILogger<JobsController> logger)
    {
        _analysisService = analysisService;
        _logger = logger;
    }

    [HttpPost("update-data")]
    public async Task<IActionResult> UpdateData()
    {
        _logger.LogInformation("Manual trigger: Starting daily data update...");
        try
        {
            var cliProjectPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "TWSE.Cli");
            cliProjectPath = Path.GetFullPath(cliProjectPath);

            var rootProjectPath = Path.Combine(cliProjectPath, "..", "..");
            rootProjectPath = Path.GetFullPath(rootProjectPath);

            var psi = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"run --project \"{cliProjectPath}\" -- update",
                WorkingDirectory = rootProjectPath,
                RedirectStandardOutput = false,
                RedirectStandardError = false,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                await process.WaitForExitAsync();
                _logger.LogInformation("Manual trigger: Update completed with exit code {ExitCode}.", process.ExitCode);
            }

            return Ok(new { message = "資料更新完成" });
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
