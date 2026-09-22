using System.Text.Json.Serialization;

namespace TWSE.Core.Models;

public class StrategyCombo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("strategyFileNames")]
    public List<string> StrategyFileNames { get; set; } = new();

    [JsonPropertyName("logicMode")]
    public string LogicMode { get; set; } = "AND"; // "AND" | "OR" | "SCORE"

    [JsonPropertyName("minScorePercent")]
    public int MinScorePercent { get; set; } = 50;

    [JsonPropertyName("isBuiltIn")]
    public bool IsBuiltIn { get; set; } = false;

    [JsonPropertyName("createdAt")]
    public DateTime? CreatedAt { get; set; }
}

public class ComboScanRequest
{
    public List<string> StrategyFileNames { get; set; } = new();
    public string LogicMode { get; set; } = "AND"; // "AND" | "OR" | "SCORE"
    public string TargetScope { get; set; } = "portfolio"; // "portfolio" | "tracking" | "all"
    public List<string>? CustomCodes { get; set; }
    public int MinScorePercent { get; set; } = 50;
    public decimal MinVolume { get; set; } = 0;
}

public class ComboScanItemResult
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public string Industry { get; set; } = string.Empty;
    public decimal LastClose { get; set; }
    public decimal ChangePercent { get; set; }
    public decimal Volume { get; set; }
    public DateTime LastDate { get; set; }
    public bool BuySignal { get; set; }
    public bool SellSignal { get; set; }
    public string OverallAction { get; set; } = "Hold";
    public List<string> MatchedBuyStrategies { get; set; } = new();
    public List<string> MatchedSellStrategies { get; set; } = new();
    public double MatchScore { get; set; }
    public int MatchedCount { get; set; }
    public int TotalStrategies { get; set; }

    public int? Quantity { get; set; }
    public decimal? AvgCost { get; set; }
    public decimal? ProfitLoss { get; set; }
    public decimal? ProfitLossPercent { get; set; }
}
