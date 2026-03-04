using TWSE.Core.Data;
using TWSE.Core.Models;

namespace TWSE.Core.Screening;

public class StockScreener : IScreener
{
    private readonly IStockRepository _repository;
    private readonly IConditionEvaluator _evaluator;

    public StockScreener(IStockRepository repository, IConditionEvaluator evaluator)
    {
        _repository = repository;
        _evaluator = evaluator;
    }

    public async Task<List<StockInfo>> ScanAsync(ScreenerConfig config)
    {
        var allStocks = await _repository.GetAllStocksAsync();
        var matchedStocks = new List<StockInfo>();

        foreach (var stock in allStocks)
        {
            var history = await _repository.GetDailyPricesAsync(stock.Code);
            if (history.Count == 0) continue;

            // Evaluate on the most recent day
            int currentIndex = history.Count - 1;

            if (_evaluator.EvaluateAll(config.Screen, history, currentIndex))
            {
                matchedStocks.Add(stock);
            }
        }

        // Apply simplistic sorting logic (for MVP we just return matched limited, full sorting requires getting the indicator value again)
        // Here we just apply Limit.
        return matchedStocks.Take(config.Limit > 0 ? config.Limit : 50).ToList();
    }
}
