using System.Collections.Generic;
using Skender.Stock.Indicators;
using TWSE.Core.Models;

namespace TWSE.Core.Indicators;

public interface IIndicatorService
{
    IEnumerable<SmaResult> CalculateSma(IEnumerable<OHLCV> history, int lookbackPeriods);
    IEnumerable<EmaResult> CalculateEma(IEnumerable<OHLCV> history, int lookbackPeriods);
    IEnumerable<StochResult> CalculateKd(IEnumerable<OHLCV> history, int lookbackPeriods = 9, int signalPeriods = 3, int smoothPeriods = 3);
    IEnumerable<RsiResult> CalculateRsi(IEnumerable<OHLCV> history, int lookbackPeriods = 14);
    IEnumerable<MacdResult> CalculateMacd(IEnumerable<OHLCV> history, int fastPeriods = 12, int slowPeriods = 26, int signalPeriods = 9);
    IEnumerable<BollingerBandsResult> CalculateBollingerBands(IEnumerable<OHLCV> history, int lookbackPeriods = 20, double standardDeviations = 2);
    IEnumerable<SmaResult> CalculateVolumeSma(IEnumerable<OHLCV> history, int lookbackPeriods);
    
    bool CrossAbove(IEnumerable<double?> line1, IEnumerable<double?> line2, int currentIndex);
    bool CrossBelow(IEnumerable<double?> line1, IEnumerable<double?> line2, int currentIndex);
}
