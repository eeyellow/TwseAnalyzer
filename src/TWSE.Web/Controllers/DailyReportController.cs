using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Core.Models;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DailyReportController : ControllerBase
{
    private readonly IStockRepository _repo;

    public DailyReportController(IStockRepository repo)
    {
        _repo = repo;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? date = null)
    {
        DateTime targetDate;
        if (!string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var parsedDate))
        {
            targetDate = parsedDate.Date;
        }
        else
        {
            targetDate = MarketDateHelper.GetTargetMarketDate();
        }

        var signals = await _repo.GetDailySignalsAsync(targetDate);
        
        if (!signals.Any())
        {
            var latestDate = await _repo.GetLatestSignalDateAsync();
            if (latestDate.HasValue)
            {
                targetDate = latestDate.Value;
                signals = await _repo.GetDailySignalsAsync(targetDate);
            }
        }

        // 讀取庫存與股票基本資訊，以便進行結構化分組與豐富化
        var portfolio = await _repo.GetPortfolioAsync();
        var allStocks = await _repo.GetAllStocksAsync();
        var stockMap = allStocks.ToDictionary(s => s.Code, s => s.Name);
        var portfolioCodes = portfolio.Select(p => p.StockCode).ToHashSet();

        // 1. 持股操作分析
        var portfolioAnalysis = new List<object>();
        foreach (var p in portfolio)
        {
            var pSignal = signals.FirstOrDefault(s => s.StockCode == p.StockCode);
            var history = await _repo.GetDailyPricesAsync(p.StockCode);
            var lastClose = history.Count > 0 ? history[^1].Close : (pSignal?.LastClose ?? p.AvgCost);

            decimal profitLoss = 0;
            if (p.Quantity > 0 && p.AvgCost > 0)
            {
                var buyCost = p.AvgCost * p.Quantity;
                var buyFee = Math.Max(20, Math.Floor(buyCost * 0.001425m));
                var totalCost = buyCost + buyFee;

                var sellVal = lastClose * p.Quantity;
                var sellFee = Math.Max(20, Math.Floor(sellVal * 0.001425m));
                var sellTax = Math.Floor(sellVal * 0.003m);
                var netVal = sellVal - sellFee - sellTax;

                profitLoss = netVal - totalCost;
            }

            var action = pSignal?.SignalType ?? "Hold";
            var stratName = pSignal?.StrategyName ?? "持股操作診斷";
            string reason;
            if (action == "Sell")
            {
                reason = $"觸發【{stratName}】出場條件，建議獲利了結或停損。";
            }
            else if (action == "Buy")
            {
                reason = $"觸發【{stratName}】進場條件，多頭動能強勁，可考慮加碼。";
            }
            else
            {
                reason = "未達進出場門檻，趨勢穩定維持續抱觀望。";
            }

            portfolioAnalysis.Add(new
            {
                stockCode = p.StockCode,
                stockName = stockMap.GetValueOrDefault(p.StockCode, p.StockName),
                quantity = p.Quantity,
                avgCost = p.AvgCost,
                lastClose = lastClose,
                profitLoss = profitLoss,
                action = action,
                strategyName = stratName,
                reason = reason
            });
        }

        // 2. 未持有股票最推薦買進 (Top 20)
        var recommendedBuys = signals
            .Where(s => s.SignalType == "Buy" && !portfolioCodes.Contains(s.StockCode))
            .Take(20)
            .Select(s => new
            {
                stockCode = s.StockCode,
                stockName = stockMap.GetValueOrDefault(s.StockCode, "個股"),
                strategyName = s.StrategyName,
                lastClose = s.LastClose,
                suggestedPrice = s.SuggestedPrice ?? s.LastClose,
                signalType = "Buy"
            })
            .ToList();

        // 3. 未持有股票最推薦賣出 (Top 20)
        var recommendedSells = signals
            .Where(s => s.SignalType == "Sell" && !portfolioCodes.Contains(s.StockCode))
            .Take(20)
            .Select(s => new
            {
                stockCode = s.StockCode,
                stockName = stockMap.GetValueOrDefault(s.StockCode, "個股"),
                strategyName = s.StrategyName,
                lastClose = s.LastClose,
                suggestedPrice = s.SuggestedPrice ?? s.LastClose,
                signalType = "Sell"
            })
            .ToList();

        return Ok(new
        {
            Date = targetDate,
            PortfolioAnalysis = portfolioAnalysis,
            RecommendedBuys = recommendedBuys,
            RecommendedSells = recommendedSells,
            Signals = signals
        });
    }
}
