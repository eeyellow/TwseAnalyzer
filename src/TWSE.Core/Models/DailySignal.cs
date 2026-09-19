using System;

namespace TWSE.Core.Models;

public class DailySignal
{
    public DateTime Date { get; set; }
    public string StockCode { get; set; } = string.Empty;
    public string SignalType { get; set; } = string.Empty; // "Buy" or "Sell", etc.
    public string StrategyName { get; set; } = string.Empty;
    public decimal? SuggestedPrice { get; set; }
    public decimal LastClose { get; set; }
}
