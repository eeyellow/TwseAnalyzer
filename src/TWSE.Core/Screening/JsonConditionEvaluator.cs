using System.Text.RegularExpressions;
using TWSE.Core.Indicators;
using TWSE.Core.Models;

namespace TWSE.Core.Screening;

public class JsonConditionEvaluator : IConditionEvaluator
{
    private readonly IIndicatorService _indicatorService;

    public JsonConditionEvaluator(IIndicatorService indicatorService)
    {
        _indicatorService = indicatorService;
    }

    public bool EvaluateAll(IEnumerable<string> conditions, IReadOnlyList<OHLCV> history, int currentIndex)
    {
        if (conditions == null || !conditions.Any()) return true;
        foreach (var condition in conditions)
        {
            if (!Evaluate(condition, history, currentIndex))
                return false;
        }
        return true;
    }

    public bool Evaluate(string condition, IReadOnlyList<OHLCV> history, int currentIndex)
    {
        if (currentIndex < 0 || currentIndex >= history.Count) return false;

        // Simplistic parser for MVP: "LeftOperand Operator RightOperand"
        // E.g., "RSI(14) less_than 30"
        // E.g., "SMA(5) cross_above SMA(20)"
        var parts = condition.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3) return false;

        var leftStr = parts[0];
        var op = parts[1];
        var rightStr = parts[2];

        // Process Right Op potentially having multiplier "* 1.5"
        double multiplier = 1.0;
        if (rightStr.Contains("*"))
        {
            var rParts = rightStr.Split('*', StringSplitOptions.RemoveEmptyEntries);
            rightStr = rParts[0].Trim();
            if (rParts.Length > 1 && double.TryParse(rParts[1], out var mult))
            {
                multiplier = mult;
            }
        }

        if (op == "cross_above" || op == "cross_below")
        {
            var leftSeries = GetGlobalSeries(leftStr, history);
            var rightSeries = GetGlobalSeries(rightStr, history);
            
            // Apply multiplier to rightSeries
            if (Math.Abs(multiplier - 1.0) > 0.001)
            {
                rightSeries = rightSeries.Select(v => v.HasValue ? v * multiplier : null).ToList();
            }

            if (op == "cross_above")
                return _indicatorService.CrossAbove(leftSeries, rightSeries, currentIndex);
            if (op == "cross_below")
                return _indicatorService.CrossBelow(leftSeries, rightSeries, currentIndex);
        }
        else
        {
            var leftVal = GetValue(leftStr, history, currentIndex);
            var rightVal = GetValue(rightStr, history, currentIndex) * multiplier;

            if (!leftVal.HasValue || !rightVal.HasValue) return false;

            return op switch
            {
                "greater_than" => leftVal.Value > rightVal.Value,
                "less_than" => leftVal.Value < rightVal.Value,
                "greater_than_or_equal" => leftVal.Value >= rightVal.Value,
                "less_than_or_equal" => leftVal.Value <= rightVal.Value,
                "equal" => Math.Abs(leftVal.Value - rightVal.Value) < 0.0001,
                _ => false
            };
        }

        return false;
    }
    
    // For entire series evaluation (cross over)
    private List<double?> GetGlobalSeries(string operand, IReadOnlyList<OHLCV> history)
    {
        int offset = ExtractOffset(ref operand);
        var series = GetGlobalSeriesInternal(operand, history);
        
        if (offset > 0)
        {
            var shifted = new List<double?>(series.Count);
            for (int i = 0; i < series.Count; i++)
            {
                shifted.Add(i >= offset ? series[i - offset] : null);
            }
            return shifted;
        }
        return series;
    }

    private List<double?> GetGlobalSeriesInternal(string operand, IReadOnlyList<OHLCV> history)
    {
        if (double.TryParse(operand, out var fixedVal))
        {
            return Enumerable.Repeat((double?)fixedVal, history.Count).ToList();
        }
        
        if (operand.StartsWith("SMA(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var sma = _indicatorService.CalculateSma(history, period).ToList();
            return history.Select((h, i) => i < sma.Count ? sma[i].Sma : null).ToList();
        }

        if (operand.StartsWith("EMA(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var ema = _indicatorService.CalculateEma(history, period).ToList();
            return history.Select((h, i) => i < ema.Count ? ema[i].Ema : null).ToList();
        }
        
        if (operand.StartsWith("VolumeSma(", StringComparison.OrdinalIgnoreCase))
        {
             var period = ExtractPeriod(operand);
             var sma = _indicatorService.CalculateVolumeSma(history, period).ToList();
             return history.Select((h, i) => i < sma.Count ? sma[i].Sma : null).ToList();
        }

        if (operand.StartsWith("RSI(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var rsiList = _indicatorService.CalculateRsi(history, period).ToList();
            return history.Select((h, i) => i < rsiList.Count ? rsiList[i].Rsi : null).ToList();
        }

        if (operand.StartsWith("K(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var kdList = _indicatorService.CalculateKd(history, period).ToList();
            return history.Select((h, i) => i < kdList.Count ? kdList[i].Oscillator : null).ToList();
        }

        if (operand.StartsWith("D(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var kdList = _indicatorService.CalculateKd(history, period).ToList();
            return history.Select((h, i) => i < kdList.Count ? kdList[i].Signal : null).ToList();
        }

        if (operand.Equals("Close", StringComparison.OrdinalIgnoreCase)) return history.Select(h => (double?)h.Close).ToList();
        if (operand.Equals("Open", StringComparison.OrdinalIgnoreCase)) return history.Select(h => (double?)h.Open).ToList();
        if (operand.Equals("High", StringComparison.OrdinalIgnoreCase)) return history.Select(h => (double?)h.High).ToList();
        if (operand.Equals("Low", StringComparison.OrdinalIgnoreCase)) return history.Select(h => (double?)h.Low).ToList();
        if (operand.Equals("Volume", StringComparison.OrdinalIgnoreCase)) return history.Select(h => (double?)h.Volume).ToList();

        return history.Select(h => (double?)h.Close).ToList(); // Fallback to Close price
    }

    private double? GetValue(string operand, IReadOnlyList<OHLCV> history, int index)
    {
        int offset = ExtractOffset(ref operand);
        int targetIndex = index - offset;
        if (targetIndex < 0) return null;
        
        return GetValueInternal(operand, history, targetIndex);
    }

    private double? GetValueInternal(string operand, IReadOnlyList<OHLCV> history, int index)
    {
        if (double.TryParse(operand, out var fixedVal)) return fixedVal;

        if (operand.Equals("Volume", StringComparison.OrdinalIgnoreCase)) return (double)history[index].Volume;
        if (operand.Equals("Close", StringComparison.OrdinalIgnoreCase)) return (double)history[index].Close;
        if (operand.Equals("Open", StringComparison.OrdinalIgnoreCase)) return (double)history[index].Open;
        if (operand.Equals("High", StringComparison.OrdinalIgnoreCase)) return (double)history[index].High;
        if (operand.Equals("Low", StringComparison.OrdinalIgnoreCase)) return (double)history[index].Low;

        if (operand.StartsWith("RSI(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var rsiList = _indicatorService.CalculateRsi(history, period).ToList();
            if (index < rsiList.Count) return rsiList[index].Rsi;
        }
        
        if (operand.StartsWith("SMA(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var smaList = _indicatorService.CalculateSma(history, period).ToList();
            if (index < smaList.Count) return smaList[index].Sma;
        }

        if (operand.StartsWith("EMA(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var emaList = _indicatorService.CalculateEma(history, period).ToList();
            if (index < emaList.Count) return emaList[index].Ema;
        }

        if (operand.StartsWith("VolumeSma(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var smaList = _indicatorService.CalculateVolumeSma(history, period).ToList();
            if (index < smaList.Count) return smaList[index].Sma;
        }

        if (operand.StartsWith("K(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var kdList = _indicatorService.CalculateKd(history, period).ToList();
            if (index < kdList.Count) return kdList[index].Oscillator;
        }

        if (operand.StartsWith("D(", StringComparison.OrdinalIgnoreCase))
        {
            var period = ExtractPeriod(operand);
            var kdList = _indicatorService.CalculateKd(history, period).ToList();
            if (index < kdList.Count) return kdList[index].Signal;
        }

        return null;
    }

    private int ExtractOffset(ref string operand)
    {
        var match = Regex.Match(operand, @"\[(\d+)\]$");
        if (match.Success)
        {
            operand = operand.Substring(0, match.Index);
            if (int.TryParse(match.Groups[1].Value, out var val)) return val;
        }
        return 0;
    }

    private int ExtractPeriod(string operand)
    {
        var match = Regex.Match(operand, @"\d+");
        if (match.Success && int.TryParse(match.Value, out var val)) return val;
        return 14; // default
    }
}
