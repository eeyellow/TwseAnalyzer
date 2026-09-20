using System.Diagnostics;

namespace TWSE.Web.Services;

public class DailyUpdateService : BackgroundService
{
    private readonly ILogger<DailyUpdateService> _logger;
    private readonly IServiceProvider _serviceProvider;

    public DailyUpdateService(ILogger<DailyUpdateService> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // 1. 在啟動後端服務時，於背景執行檢查，不阻塞 Kestrel 即時處理請求
        _ = Task.Run(async () =>
        {
            await Task.Delay(2000, stoppingToken); // 稍微延遲 2 秒讓主程式與資料庫就緒
            await CheckAndUpdateAsync(stoppingToken);
        }, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.Now;
            // 每天晚上 18:00 定時觸發檢查
            var nextRun = now.Date.AddHours(18);
            if (now >= nextRun)
                nextRun = nextRun.AddDays(1);

            while (nextRun.DayOfWeek == DayOfWeek.Saturday || nextRun.DayOfWeek == DayOfWeek.Sunday)
                nextRun = nextRun.AddDays(1);

            var delay = nextRun - now;
            _logger.LogInformation("Next daily update scheduled at {NextRun} (in {Delay})", nextRun, delay);

            await Task.Delay(delay, stoppingToken);

            if (!stoppingToken.IsCancellationRequested)
            {
                await CheckAndUpdateAsync(stoppingToken);
            }
        }
    }

    private async Task CheckAndUpdateAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var stockRepo = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.IStockRepository>();
            
            // 2. 每次觸發時，先到資料庫檢查目前最新的資料時間 (用台積電 2330)
            var latestDate = await stockRepo.GetLatestPriceDateAsync("2330");
            var targetDate = GetTargetMarketDate();

            if (latestDate == null || latestDate.Value.Date < targetDate)
            {
                _logger.LogInformation("Latest data for 2330 is {LatestDate:yyyy-MM-dd}. Target date is {TargetDate:yyyy-MM-dd}. Running update...", latestDate, targetDate);
                await RunUpdateAsync();
                
                // 3. 更新完畢後，執行盤前分析 (選股與庫存分析)
                var analysisService = scope.ServiceProvider.GetRequiredService<DailyAnalysisService>();
                await analysisService.RunAnalysisAsync(targetDate);
            }
            else
            {
                _logger.LogInformation("Data is up to date (Latest: {LatestDate:yyyy-MM-dd}). No update needed.", latestDate);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed during check and update tracking");
        }
    }

    private DateTime GetTargetMarketDate()
    {
        var now = DateTime.Now;
        var target = now.Date;

        // 如果目前還沒到傍晚 6 點，那麼「最新應該要有的資料」是昨天的營業日
        if (now.Hour < 18)
        {
             target = target.AddDays(-1);
        }

        // 迴避掉六日，找到最近的一個營業日
        while (target.DayOfWeek == DayOfWeek.Saturday || target.DayOfWeek == DayOfWeek.Sunday)
        {
            target = target.AddDays(-1);
        }
        return target;
    }

    private async Task RunUpdateAsync()
    {
        _logger.LogInformation("Starting scheduled daily data update in-process...");
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var updateService = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.IDataUpdateService>();
            var stockRepo = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.IStockRepository>();

            var stocks = await stockRepo.GetAllStocksAsync();
            int success = 0;
            int fail = 0;
            foreach (var stock in stocks)
            {
                try
                {
                    await updateService.UpdateHistoricalDataAsync(stock.Code);
                    success++;
                }
                catch (Exception ex)
                {
                    fail++;
                    _logger.LogWarning("Failed to update stock {Code}: {Message}", stock.Code, ex.Message);
                }
            }
            _logger.LogInformation("Scheduled daily data update completed. Success: {Success}, Failed: {Fail}", success, fail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run daily update");
        }
    }
}
