namespace TWSE.Core.Models;

public class SimulationRequest
{
    public DateTime StartDate { get; set; } = new DateTime(2020, 1, 1);
    public DateTime EndDate { get; set; } = DateTime.Now.Date;
    public decimal Min20dVolume { get; set; } = 300m; // 20日均量門檻（張）
    public int EvaluationWindowDays { get; set; } = 60;
    public List<string>? SelectedStrategies { get; set; }
}

public class SimulationStatus
{
    public string SimulationId { get; set; } = "";
    public string Status { get; set; } = "Idle"; // Idle, Running, Completed, Failed, Cancelled
    public string Message { get; set; } = "尚未執行歷史滾動回放模擬";
    public double ProgressPercentage { get; set; } = 0;
    public string CurrentDate { get; set; } = "";
    public int ProcessedTradingDays { get; set; } = 0;
    public int TotalTradingDays { get; set; } = 0;
    public int TotalSignalsGenerated { get; set; } = 0;
    public int SettledSignalsCount { get; set; } = 0;
    public DateTime? StartTime { get; set; }
    public DateTime? FinishTime { get; set; }
    public double ElapsedSeconds { get; set; } = 0;
    public string? Error { get; set; }
}

public class QuarterlyPerformance
{
    public string Quarter { get; set; } = ""; // e.g. "2020-Q1"
    public int Year { get; set; }
    public int QuarterNumber { get; set; }
    public int TotalSignals { get; set; }
    public int CleanSignals { get; set; }
    public int NoiseSignals { get; set; }
    public int WinSignals { get; set; }
    public double CleanWinRate { get; set; }
    public double RawWinRate { get; set; }
    public double AvgReturn1D { get; set; }
    public double AvgReturn3D { get; set; }
    public double AvgReturn5D { get; set; }
    public double MaxProfit { get; set; }
    public double MaxLoss { get; set; }
    public double ProfitFactor { get; set; }
    public string MarketTrend { get; set; } = "震盪整理"; // "大多頭趨勢", "空頭修正期", "震盪整理"
}

public class SimulationSummary
{
    public string SimulationId { get; set; } = "";
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int TotalTradingDays { get; set; }
    public int TotalSignalsGenerated { get; set; }
    public int TotalNoiseIsolated { get; set; }
    public int TotalCleanSignals { get; set; }
    public double OverallCleanWinRate { get; set; }
    public double OverallRawWinRate { get; set; }
    public double OverallAvgReturn1D { get; set; }
    public double OverallAvgReturn3D { get; set; }
    public double OverallAvgReturn5D { get; set; }
    public double OverallProfitFactor { get; set; }
    public double TotalExecutionSeconds { get; set; }

    public List<QuarterlyPerformance> QuarterlyTrends { get; set; } = new();
    public List<StrategyPerformanceMetric> StrategyPerformances { get; set; } = new();
    public List<StockStrategyAffinity> TopStockAffinities { get; set; } = new();
    public List<IndustryStrategyAffinity> IndustryAffinities { get; set; } = new();
}
