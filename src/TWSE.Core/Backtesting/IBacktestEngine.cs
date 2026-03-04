using TWSE.Core.Models;

namespace TWSE.Core.Backtesting;

public interface IBacktestEngine
{
    Task<BacktestResult> RunAsync(string stockCode, StrategyConfig config, IReadOnlyList<OHLCV> history);
    Task<List<BacktestResult>> ScanAllAsync(StrategyConfig config, Dictionary<string, IReadOnlyList<OHLCV>> allHistories);
}
