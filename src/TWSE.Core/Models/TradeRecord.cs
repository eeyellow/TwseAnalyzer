namespace TWSE.Core.Models;

public class TradeRecord
{
    public string StockCode { get; set; } = string.Empty;
    public DateTime BuyDate { get; set; }
    public decimal BuyPrice { get; set; }
    public DateTime? SellDate { get; set; }
    public decimal? SellPrice { get; set; }
    public int Quantity { get; set; }
    public decimal CommissionRate { get; set; } = 0.001425m;
    public decimal TaxRate { get; set; } = 0.003m;
    
    public decimal TotalCost => Math.Floor(Quantity * BuyPrice) + BuyCommission;
    public decimal? TotalRevenue => SellPrice.HasValue ? Math.Floor(Quantity * SellPrice.Value) - SellCommission - Tax : null;
    public decimal BuyCommission => Math.Floor(Math.Floor(Quantity * BuyPrice) * CommissionRate);
    public decimal? SellCommission => SellPrice.HasValue ? Math.Floor(Math.Floor(Quantity * SellPrice.Value) * CommissionRate) : null;
    public decimal? Tax => SellPrice.HasValue ? Math.Floor(Math.Floor(Quantity * SellPrice.Value) * TaxRate) : null;
    public decimal? Profit => TotalRevenue.HasValue ? (TotalRevenue.Value - TotalCost) : null;
    public decimal? ReturnRate => TotalRevenue.HasValue && TotalCost > 0 ? ((TotalRevenue.Value - TotalCost) / TotalCost) : null;
    public int? HoldDays => SellDate.HasValue ? (SellDate.Value - BuyDate).Days : null;
}
