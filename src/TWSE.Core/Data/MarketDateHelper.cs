using System;

namespace TWSE.Core.Data;

public static class MarketDateHelper
{
    /// <summary>
    /// 取得當前最適盤後/盤前分析的基準交易日。
    /// 台股於平日 13:30 收盤，14:30 盤後定價與收盤數據即已完全產生。
    /// - 若在平日 14:30 之後 (如晚上 20:00)：當日已收盤，基準日即為「今天 (Today)」，用以擬定明日操作策略。
    /// - 若在平日 14:30 之前 (盤中或早晨)：當日尚未收盤，基準日為「前一營業日」。
    /// - 若遇週末 (週六/週日)：自動回推至最近營業日 (週五)。
    /// </summary>
    public static DateTime GetTargetMarketDate(DateTime? referenceTime = null)
    {
        var now = referenceTime ?? DateTime.Now;
        var target = now.Date;

        // 若平日下午 14:30 之前，當天收盤行情尚未出爐，回推一天至前一交易日
        if (now.TimeOfDay < new TimeSpan(14, 30, 0))
        {
            target = target.AddDays(-1);
        }

        // 排除週末，回推至週五
        while (target.DayOfWeek == DayOfWeek.Saturday || target.DayOfWeek == DayOfWeek.Sunday)
        {
            target = target.AddDays(-1);
        }

        return target;
    }
}
