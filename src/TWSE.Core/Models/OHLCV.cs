using Skender.Stock.Indicators;

namespace TWSE.Core.Models;

public class OHLCV : IQuote
{
    public string StockCode { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public decimal Volume { get; set; }
}
