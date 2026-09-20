using System.Text.Json.Serialization;

namespace TWSE.Core.Models;

public class BacktestParams
{
    [JsonPropertyName("startDate")]
    public string? StartDate { get; set; }

    [JsonPropertyName("endDate")]
    public string? EndDate { get; set; }

    [JsonPropertyName("initialCapital")]
    public decimal InitialCapital { get; set; } = 100000;

    [JsonPropertyName("positionSize")]
    public decimal PositionSize { get; set; } = 100000;

    [JsonPropertyName("commissionRate")]
    public decimal CommissionRate { get; set; } = 0.001425m;

    [JsonPropertyName("taxRate")]
    public decimal TaxRate { get; set; } = 0.003m;
}

public class StrategyConfig
{
    [JsonPropertyName("backtest")]
    public BacktestParams Backtest { get; set; } = new();

    [JsonPropertyName("screen")]
    public List<string> Screen { get; set; } = new();

    [JsonPropertyName("entry")]
    public List<string> Entry { get; set; } = new();

    [JsonPropertyName("exit")]
    public List<string> Exit { get; set; } = new();
}
