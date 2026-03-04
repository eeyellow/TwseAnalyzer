using TWSE.Core.Models;

namespace TWSE.Core.Screening;

public interface IConditionEvaluator
{
    bool Evaluate(string condition, IReadOnlyList<OHLCV> history, int currentIndex);
    bool EvaluateAll(IEnumerable<string> conditions, IReadOnlyList<OHLCV> history, int currentIndex);
}
