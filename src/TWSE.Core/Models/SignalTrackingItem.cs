using System;

namespace TWSE.Core.Models;

public class SignalTrackingItem
{
    public long Id { get; set; }
    public string SignalDate { get; set; } = string.Empty; // yyyy-MM-dd
    public string StockCode { get; set; } = string.Empty;
    public string SignalType { get; set; } = string.Empty; // "Buy" or "Sell"
    public string StrategyName { get; set; } = string.Empty;
    public decimal EntryPrice { get; set; }
    public decimal? NextOpen { get; set; }
    public decimal? NextClose { get; set; }
    public decimal? Return1D { get; set; }      // T+1 報酬率
    public decimal? Return3D { get; set; }      // T+3 報酬率
    public decimal? Return5D { get; set; }      // T+5 報酬率
    public decimal? MaxReturn5D { get; set; }   // 5日內最高潛在漲幅 (MFE)
    public decimal? MaxDrawdown5D { get; set; } // 5日內最大不利回撤 (MAE)
    public string Status { get; set; } = "Pending"; // "Pending", "Verified"
    public int IsWin { get; set; } = 0;         // 1: 獲利, 0: 平/虧
    public decimal Volume20dAvg { get; set; }  // 訊號當日的 20 日均量 (張數)
    public int IsNoise { get; set; } = 0;       // 1: 判定為噪聲/低流動性股, 0: 有效樣本
    public string? NoiseReason { get; set; }   // 噪聲原因 (例如: "低流動性(<300張)", "極端跳空")
    public string? FeaturesJson { get; set; }   // 技術指標特徵快照 (供機器學習重訓)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? VerifiedAt { get; set; }
}
