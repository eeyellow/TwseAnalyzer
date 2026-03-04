using System.Collections.Generic;
using System.Linq;
using Skender.Stock.Indicators;
using TWSE.Core.Models;

namespace TWSE.Core.Indicators;

public class SkenderIndicatorService : IIndicatorService
{
    public IEnumerable<SmaResult> CalculateSma(IEnumerable<OHLCV> history, int lookbackPeriods)
    {
        return history.GetSma(lookbackPeriods);
    }

    public IEnumerable<EmaResult> CalculateEma(IEnumerable<OHLCV> history, int lookbackPeriods)
    {
        return history.GetEma(lookbackPeriods);
    }

    public IEnumerable<StochResult> CalculateKd(IEnumerable<OHLCV> history, int lookbackPeriods = 9, int signalPeriods = 3, int smoothPeriods = 3)
    {
        return history.GetStoch(lookbackPeriods, signalPeriods, smoothPeriods);
    }

    public IEnumerable<RsiResult> CalculateRsi(IEnumerable<OHLCV> history, int lookbackPeriods = 14)
    {
        return history.GetRsi(lookbackPeriods);
    }

    public IEnumerable<MacdResult> CalculateMacd(IEnumerable<OHLCV> history, int fastPeriods = 12, int slowPeriods = 26, int signalPeriods = 9)
    {
        return history.GetMacd(fastPeriods, slowPeriods, signalPeriods);
    }

    public IEnumerable<BollingerBandsResult> CalculateBollingerBands(IEnumerable<OHLCV> history, int lookbackPeriods = 20, double standardDeviations = 2)
    {
        return history.GetBollingerBands(lookbackPeriods, standardDeviations);
    }

    public IEnumerable<SmaResult> CalculateVolumeSma(IEnumerable<OHLCV> history, int lookbackPeriods)
    {
        var mockHistory = history.Select(h => new Quote
        {
            Date = h.Date,
            Open = h.Volume,
            High = h.Volume,
            Low = h.Volume,
            Close = h.Volume,
            Volume = h.Volume
        });
        
        return mockHistory.GetSma(lookbackPeriods);
    }

    public bool CrossAbove(IEnumerable<double?> line1, IEnumerable<double?> line2, int currentIndex)
    {
        var l1 = line1.ToList();
        var l2 = line2.ToList();

        if (currentIndex < 1 || currentIndex >= l1.Count || currentIndex >= l2.Count)
            return false;

        var prev1 = l1[currentIndex - 1];
        var curr1 = l1[currentIndex];
        var prev2 = l2[currentIndex - 1];
        var curr2 = l2[currentIndex];

        if (!prev1.HasValue || !curr1.HasValue || !prev2.HasValue || !curr2.HasValue)
            return false;

        return prev1.Value <= prev2.Value && curr1.Value > curr2.Value;
    }

    public bool CrossBelow(IEnumerable<double?> line1, IEnumerable<double?> line2, int currentIndex)
    {
        var l1 = line1.ToList();
        var l2 = line2.ToList();

        if (currentIndex < 1 || currentIndex >= l1.Count || currentIndex >= l2.Count)
            return false;

        var prev1 = l1[currentIndex - 1];
        var curr1 = l1[currentIndex];
        var prev2 = l2[currentIndex - 1];
        var curr2 = l2[currentIndex];

        if (!prev1.HasValue || !curr1.HasValue || !prev2.HasValue || !curr2.HasValue)
            return false;

        return prev1.Value >= prev2.Value && curr1.Value < curr2.Value;
    }
}
