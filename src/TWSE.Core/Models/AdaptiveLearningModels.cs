using System;
using System.Collections.Generic;

namespace TWSE.Core.Models;

public class StrategyPerformanceMetric
{
    public string StrategyName { get; set; } = string.Empty;
    public int TotalSignals { get; set; }
    public int VerifiedSignals { get; set; }
    public int WinCount { get; set; }
    public decimal WinRate { get; set; }
    public decimal AvgReturn1D { get; set; }
    public decimal AvgReturn3D { get; set; }
    public decimal ProfitFactor { get; set; }
    public decimal AdaptiveWeight { get; set; } = 1.0m; // 動態自適應權重 (0.1 ~ 3.0)
    public string StatusRecommendation { get; set; } = "Active"; // Active, ScaledUp, Demoted, Hibernating
}

public class VerificationSummary
{
    public int TotalTrackedSignals { get; set; }
    public int TotalVerifiedSignals { get; set; }
    public decimal OverallWinRate1D { get; set; }
    public decimal OverallAvgReturn1D { get; set; }
    public decimal OverallWinRate3D { get; set; }
    public decimal OverallAvgReturn3D { get; set; }
    public List<StrategyPerformanceMetric> StrategyMetrics { get; set; } = new();
    public DateTime LastCalculatedAt { get; set; } = DateTime.Now;
}
