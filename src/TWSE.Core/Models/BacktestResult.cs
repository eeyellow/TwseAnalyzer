namespace TWSE.Core.Models;

public class BacktestResult
{
    public string StockCode { get; set; } = string.Empty;
    public decimal InitialCapital { get; set; }
    public decimal FinalCapital { get; set; }
    public decimal TotalReturn => InitialCapital > 0 ? (FinalCapital - InitialCapital) / InitialCapital : 0;
    public decimal AnnualizedReturn { get; set; } 
    public int TotalTrades => Trades.Count;
    public int WinningTrades => Trades.Count(t => t.Profit > 0);
    public decimal WinRate => TotalTrades > 0 ? (decimal)WinningTrades / TotalTrades : 0;
    public decimal MaxDrawdown { get; set; }
    public decimal SharpeRatio { get; set; }
    public List<TradeRecord> Trades { get; set; } = new();
}
