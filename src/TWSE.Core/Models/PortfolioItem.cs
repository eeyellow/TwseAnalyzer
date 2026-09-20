using System;

namespace TWSE.Core.Models;

public class PortfolioItem
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public string? SelectedStrategy { get; set; }
}
