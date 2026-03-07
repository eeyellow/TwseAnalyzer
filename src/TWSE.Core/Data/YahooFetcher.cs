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
            .Build();
    }

    public async Task<List<OHLCV>> FetchHistoricalDataAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null)
    {
        await _semaphore.WaitAsync();
        try
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
                if (!historyResult.HasValue)
                {
                    _lastRequestTime = DateTime.UtcNow;
                    return new List<OHLCV>();
                }
                
                var ticks = historyResult.Value.Ticks;
                if (ticks == null || ticks.Length == 0)
                {
                    _lastRequestTime = DateTime.UtcNow;
                    return new List<OHLCV>();
                }

                _lastRequestTime = DateTime.UtcNow;

                return ticks.Where(c => 
                    (!startDate.HasValue || c.Date.ToDateTimeUtc() >= startDate.Value.ToUniversalTime()) && 
                    (!endDate.HasValue || c.Date.ToDateTimeUtc() <= endDate.Value.ToUniversalTime())
                ).Select(c => new OHLCV
                {
                    StockCode = stockCode,
                    Date = c.Date.ToDateTimeUtc().ToLocalTime().Date,
                    Open = (decimal)c.Open,
                    High = (decimal)c.High,
                    Low = (decimal)c.Low,
                    Close = (decimal)c.Close,
                    Volume = c.Volume
                }).ToList();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching {stockCode}: {ex.Message}");
                _lastRequestTime = DateTime.UtcNow;
                return new List<OHLCV>();
            }
        }
        finally
        {
            _semaphore.Release();
        }
    }
}
