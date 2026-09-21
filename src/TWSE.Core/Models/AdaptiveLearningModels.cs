using System;
using System.Collections.Generic;

namespace TWSE.Core.Models;

public class StockStrategyAffinity
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public string Industry { get; set; } = string.Empty;
    public string StrategyName { get; set; } = string.Empty;
    public int SampleCount { get; set; }
    public int WinCount { get; set; }
    public decimal WinRate { get; set; }
    public decimal AvgReturn1D { get; set; }
    public decimal ProfitFactor { get; set; }
    public decimal AffinityScore { get; set; } // 適配度評分 (0 ~ 100)
    public string FitLevel { get; set; } = "Evaluating"; // "Optimal", "Good", "Mismatched", "Evaluating"
    public bool IsRecommendedUniverse { get; set; } // 是否列為該策略的專屬有效股票池
}

public class IndustryStrategyAffinity
{
    public string Industry { get; set; } = string.Empty;
    public string StrategyName { get; set; } = string.Empty;
    public int SampleCount { get; set; }
    public int WinCount { get; set; }
    public decimal WinRate { get; set; }
    public decimal AvgReturn1D { get; set; }
    public decimal ProfitFactor { get; set; }
    public string FitRecommendation { get; set; } = "Neutral"; // "HighlySuitable", "Suitable", "Caution", "Neutral"
}

public class StrategyPerformanceMetric
{
    public string StrategyName { get; set; } = string.Empty;
    public int TotalSignals { get; set; }
    public int VerifiedSignals { get; set; }
    public int CleanSignals { get; set; }       // 排除噪聲後的純化樣本數
    public int NoiseCount { get; set; }          // 排除的噪聲/低量樣本數
    public int WinCount { get; set; }
    public decimal WinRate { get; set; }         // 純化勝率
    public decimal RawWinRate { get; set; }      // 原始含噪勝率
    public decimal AvgReturn1D { get; set; }
    public decimal AvgReturn3D { get; set; }
    public decimal ProfitFactor { get; set; }
    public decimal AdaptiveWeight { get; set; } = 1.0m; // 動態自適應權重 (0.1 ~ 3.0)
    public string StatusRecommendation { get; set; } = "Active"; // Active, ScaledUp, Demoted, Hibernating
    public int DedicatedUniverseCount { get; set; } // 該策略專屬高適配股票數量
}

public class VerificationSummary
{
    public int TotalTrackedSignals { get; set; }
    public int TotalVerifiedSignals { get; set; }
    public int FilteredNoiseSignals { get; set; } // 排除的低流動性與極端噪聲訊號總數
    public decimal OverallWinRate1D { get; set; } // 純化後整體 T+1 勝率
    public decimal RawWinRate1D { get; set; }     // 全市場原始含噪 T+1 勝率
    public decimal OverallAvgReturn1D { get; set; }
    public decimal OverallWinRate3D { get; set; }
    public decimal OverallAvgReturn3D { get; set; }
    public List<StrategyPerformanceMetric> StrategyMetrics { get; set; } = new();
    public List<StockStrategyAffinity> TopStockAffinities { get; set; } = new();
    public List<IndustryStrategyAffinity> IndustryAffinities { get; set; } = new();
    public DateTime LastCalculatedAt { get; set; } = DateTime.Now;
}
