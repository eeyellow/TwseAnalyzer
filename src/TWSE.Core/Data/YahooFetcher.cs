using TWSE.Core.Models;
using YahooQuotesApi;
using NodaTime;

namespace TWSE.Core.Data;

public class YahooFetcher : IYahooFetcher
{
    private DateTime _lastRequestTime = DateTime.MinValue;
    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly TimeSpan _minInterval = TimeSpan.FromMilliseconds(500);
    private readonly YahooQuotes _yahooQuotes;

    public YahooFetcher()
    {
        _yahooQuotes = new YahooQuotesBuilder()
            .WithHistoryStartDate(NodaTime.Instant.FromUtc(1990, 1, 1, 0, 0))
            .WithHistoryCacheDuration(NodaTime.Duration.FromSeconds(30))
            .Build();
    }

    public async Task<List<OHLCV>> FetchHistoricalDataAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null)
    {
        await _semaphore.WaitAsync();
        try
        {
            int maxRetries = 3;
            for (int attempt = 1; attempt <= maxRetries; attempt++)
            {
                var timeSinceLastRequest = DateTime.UtcNow - _lastRequestTime;
                if (timeSinceLastRequest < _minInterval)
                {
                    await Task.Delay(_minInterval - timeSinceLastRequest);
                }

                try
                {
                    var symbol = $"{stockCode}.TW";
                    var historyResult = await _yahooQuotes.GetHistoryAsync(symbol);
                    var ticks = historyResult.HasValue ? historyResult.Value.Ticks : default;

                    if (ticks.IsDefaultOrEmpty)
                    {
                        // Fallback to TPEx (OTC) market suffix .TWO
                        symbol = $"{stockCode}.TWO";
                        historyResult = await _yahooQuotes.GetHistoryAsync(symbol);
                        ticks = historyResult.HasValue ? historyResult.Value.Ticks : default;
                    }

                    _lastRequestTime = DateTime.UtcNow;

                    if (ticks.IsDefaultOrEmpty)
                    {
                        return new List<OHLCV>();
                    }

                    // Convert to Taiwan market date (UTC+8) and compare Date portions directly to avoid boundary truncation
                    return ticks.Where(c =>
                    {
                        var tickDate = c.Date.ToDateTimeUtc().AddHours(8).Date;
                        if (startDate.HasValue && tickDate < startDate.Value.Date) return false;
                        if (endDate.HasValue && tickDate > endDate.Value.Date) return false;
                        return true;
                    }).Select(c => new OHLCV
                    {
                        StockCode = stockCode,
                        Date = c.Date.ToDateTimeUtc().AddHours(8).Date,
                        Open = (decimal)c.Open,
                        High = (decimal)c.High,
                        Low = (decimal)c.Low,
                        Close = (decimal)c.Close,
                        Volume = c.Volume
                    }).ToList();
                }
                catch (Exception ex)
                {
                    _lastRequestTime = DateTime.UtcNow;
                    if (attempt < maxRetries)
                    {
                        // Exponential backoff before retry (e.g. 1s, 2s)
                        await Task.Delay(attempt * 1000);
                        continue;
                    }

                    Console.Error.WriteLine($"Error fetching {stockCode} after {maxRetries} attempts: {ex.Message}");
                    return new List<OHLCV>();
                }
            }

            return new List<OHLCV>();
        }
        finally
        {
            _semaphore.Release();
        }
    }
}
