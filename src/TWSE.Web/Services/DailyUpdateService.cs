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
            // 每天晚上 20:00 (8 PM) 定時觸發檢查與盤前策略分析
            var nextRun = now.Date.AddHours(20);
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
            var analysisService = scope.ServiceProvider.GetRequiredService<DailyAnalysisService>();
            
            // 2. 使用精準台股營業日計算：平日 14:30 盤後收盤後即以「今天」為基準日
            var targetDate = TWSE.Core.Data.MarketDateHelper.GetTargetMarketDate();
            var latestDate = await stockRepo.GetLatestPriceDateAsync("2330");

            // 2.1 若股價數據落後於 targetDate，執行全市場日線增量更新
            if (latestDate == null || latestDate.Value.Date < targetDate)
            {
                _logger.LogInformation("Database latest date ({LatestDate:yyyy-MM-dd}) behind target market date ({TargetDate:yyyy-MM-dd}). Starting daily data update...", latestDate, targetDate);
                await RunUpdateAsync();
            }
            else
            {
                _logger.LogInformation("Stock prices are up to date ({LatestDate:yyyy-MM-dd}).", latestDate);
            }

            // 2.2 檢查 targetDate 當日的分析推薦訊號是否已經產生
            var existingSignals = await stockRepo.GetDailySignalsAsync(targetDate);
            if (!existingSignals.Any())
            {
                _logger.LogInformation("Generating daily market analysis and recommendations for {TargetDate:yyyy-MM-dd}...", targetDate);
                await analysisService.RunAnalysisAsync(targetDate);
            }
            else
            {
                _logger.LogInformation("Daily analysis for {TargetDate:yyyy-MM-dd} already generated ({Count} signals).", targetDate, existingSignals.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed during check and update tracking");
        }
    }

    private async Task RunUpdateAsync()
    {
        _logger.LogInformation("Starting scheduled daily data update in-process...");
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var updateService = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.IDataUpdateService>();
            var stockRepo = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.IStockRepository>();
            var twseFetcher = scope.ServiceProvider.GetRequiredService<TWSE.Core.Data.ITwseFetcher>();

            try
            {
                _logger.LogInformation("Syncing latest listed stocks and ETFs from TWSE/TPEx ISIN...");
                var latestStocks = await twseFetcher.FetchListedStocksAsync();
                if (latestStocks.Any())
                {
                    await stockRepo.InsertStocksAsync(latestStocks);
                    _logger.LogInformation("Successfully synced {Count} stocks and ETFs to database.", latestStocks.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync listed stocks list from TWSE, will use existing stocks in database.");
            }

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
