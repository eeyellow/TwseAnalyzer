using System.Diagnostics;

namespace TWSE.Web.Services;

public class DailyUpdateService : BackgroundService
{
    private readonly ILogger<DailyUpdateService> _logger;

    public DailyUpdateService(ILogger<DailyUpdateService> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.Now;
            // Run at 18:00 every weekday (after market close)
            var nextRun = now.Date.AddHours(18);
            if (now > nextRun || now.DayOfWeek == DayOfWeek.Saturday || now.DayOfWeek == DayOfWeek.Sunday)
                nextRun = GetNextWeekday(now.Date.AddDays(1)).AddHours(18);

            var delay = nextRun - now;
            _logger.LogInformation("Next daily update scheduled at {NextRun} (in {Delay})", nextRun, delay);

            await Task.Delay(delay, stoppingToken);

            if (!stoppingToken.IsCancellationRequested)
            {
                await RunUpdateAsync();
            }
        }
    }

    private async Task RunUpdateAsync()
    {
        _logger.LogInformation("Starting daily data update...");
        try
        {
            var cliProjectPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "TWSE.Cli");
            cliProjectPath = Path.GetFullPath(cliProjectPath);

            var psi = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"run --project \"{cliProjectPath}\" -- update",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync();
                var error = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                _logger.LogInformation("Update completed with exit code {ExitCode}. Output: {Output}", process.ExitCode, output);
                if (!string.IsNullOrEmpty(error))
                    _logger.LogWarning("Update stderr: {Error}", error);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run daily update");
        }
    }

    private static DateTime GetNextWeekday(DateTime date)
    {
        while (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
            date = date.AddDays(1);
        return date;
    }
}
