using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Backtesting;
using TWSE.Core.Data;
using TWSE.Core.Models;
using TWSE.Core.Screening;
using Skender.Stock.Indicators;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalysisController : ControllerBase
{
    private readonly IStockRepository _repo;
    private readonly IConditionEvaluator _evaluator;

    private static readonly Dictionary<string, (string Name, string Description)> DefaultStrategyMetadata = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ma-golden-cross"] = ("均線金叉 (MA Golden Cross)", "5日線向上突破20日生命線，多頭排列動能確認"),
        ["volume-breakout"] = ("量能突破 (Volume Breakout)", "成交量暴增突破5日均量且收紅棒，買盤積極介入"),
        ["kd-oversold-turnaround"] = ("KD超賣低檔金叉 (KD Turnaround)", "K值自20以下低檔區黃金交叉D值，短線超跌強勁反彈"),
        ["kd-reversal"] = ("KD指標反轉 (KD Reversal)", "KD低檔交叉買進，高檔交叉警戒賣出"),
        ["golden-cross"] = ("均線黃金交叉 (Golden Cross)", "短期均線穿越中長期均線形成黃金交叉"),
        ["ma-turnaround"] = ("均線翻揚轉折 (MA Turnaround)", "短均線由下彎轉為向上走揚，均線扣抵轉強"),
        ["best-four-point"] = ("四大買賣點 (Best Four Points)", "葛蘭碧八大法則衍生之經典買賣折返點"),
        ["oversold-bounce"] = ("乖離超跌反彈 (Oversold Bounce)", "股價急跌乖離率過大，技術面逢低強烈反彈"),
        ["weekly-trend-mock"] = ("週線趨勢動能 (Weekly Trend)", "中長線多頭趨勢保護短線進場點")
    };

    public AnalysisController(IStockRepository repo, IConditionEvaluator evaluator)
    {
        _repo = repo;
        _evaluator = evaluator;
    }

    private static string GetStrategiesDirectory()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current != null)
        {
            var candidate = Path.Combine(current.FullName, "strategies");
            if (Directory.Exists(candidate))
                return candidate;
            current = current.Parent;
        }

        var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
        while (baseDir != null)
        {
            var candidate = Path.Combine(baseDir.FullName, "strategies");
            if (Directory.Exists(candidate))
                return candidate;
            baseDir = baseDir.Parent;
        }

        return Path.Combine(Directory.GetCurrentDirectory(), "strategies");
    }

    private static string GetCombosDirectory()
    {
        var strategiesDir = GetStrategiesDirectory();
        var combosDir = Path.Combine(strategiesDir, "combos");
        if (!Directory.Exists(combosDir))
        {
            Directory.CreateDirectory(combosDir);
        }
        return combosDir;
    }

    private static List<StrategyCombo> GetDefaultCombos()
    {
        return new List<StrategyCombo>
        {
            new StrategyCombo
            {
                Id = "combo-momentum",
                Name = "動能突破強勢組合 (MA金叉 + 爆量)",
                Description = "結合均線黃金交叉與成交量突破，尋找放量起漲的強勢多頭動能股",
                StrategyFileNames = new List<string> { "ma-golden-cross.json", "volume-breakout.json" },
                LogicMode = "AND",
                MinScorePercent = 100,
                IsBuiltIn = true
            },
            new StrategyCombo
            {
                Id = "combo-reversal",
                Name = "超跌築底反彈組合 (KD超賣 + 均線轉折)",
                Description = "尋找短線嚴重超賣、KD指標低檔黃金交叉並伴隨均線止跌翻揚的轉折標的",
                StrategyFileNames = new List<string> { "kd-oversold-turnaround.json", "ma-turnaround.json" },
                LogicMode = "OR",
                MinScorePercent = 50,
                IsBuiltIn = true
            },
            new StrategyCombo
            {
                Id = "combo-multi-factor",
                Name = "全方位多頭共振組合 (均線 + 量能 + KD反轉)",
                Description = "三大指標綜合評估，滿足過半條件（評分制）即視為多頭共振訊號",
                StrategyFileNames = new List<string> { "ma-golden-cross.json", "volume-breakout.json", "kd-oversold-turnaround.json" },
                LogicMode = "SCORE",
                MinScorePercent = 66,
                IsBuiltIn = true
            },
            new StrategyCombo
            {
                Id = "combo-four-points",
                Name = "經典四大買賣點組合",
                Description = "以葛蘭碧與精準短線折返為核心，搭配量能突破確認趨勢強度",
                StrategyFileNames = new List<string> { "best-four-point.json", "volume-breakout.json" },
                LogicMode = "AND",
                MinScorePercent = 100,
                IsBuiltIn = true
            }
        };
    }

    [HttpGet("strategies")]
    public async Task<IActionResult> GetStrategies()
    {
        var strategiesDir = GetStrategiesDirectory();

        if (!Directory.Exists(strategiesDir))
            return Ok(Array.Empty<object>());

        var files = Directory.GetFiles(strategiesDir, "*.json");
        var list = new List<object>();

        foreach (var file in files)
        {
            var fileName = Path.GetFileName(file);
            var baseName = Path.GetFileNameWithoutExtension(file);

            string name = baseName;
            string description = "自訂量化條件策略模型";
            int entryCount = 0;
            int exitCount = 0;

            if (DefaultStrategyMetadata.TryGetValue(baseName, out var meta))
            {
                name = meta.Name;
                description = meta.Description;
            }

            try
            {
                var json = await System.IO.File.ReadAllTextAsync(file);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("name", out var nProp) && !string.IsNullOrWhiteSpace(nProp.GetString()))
                {
                    name = nProp.GetString()!;
                }
                if (root.TryGetProperty("description", out var dProp) && !string.IsNullOrWhiteSpace(dProp.GetString()))
                {
                    description = dProp.GetString()!;
                }
                if (root.TryGetProperty("entry", out var eProp) && eProp.ValueKind == JsonValueKind.Array)
                {
                    entryCount = eProp.GetArrayLength();
                }
                else if (root.TryGetProperty("screen", out var sProp) && sProp.ValueKind == JsonValueKind.Array)
                {
                    entryCount = sProp.GetArrayLength();
                }
                if (root.TryGetProperty("exit", out var xProp) && xProp.ValueKind == JsonValueKind.Array)
                {
                    exitCount = xProp.GetArrayLength();
                }
            }
            catch
            {
                // Fallback to defaults if json parse error
            }

            list.Add(new
            {
                Name = name,
                FileName = fileName,
                BaseName = baseName,
                Description = description,
                EntryCount = entryCount,
                ExitCount = exitCount
            });
        }

        return Ok(list);
    }

    [HttpGet("combos")]
    public async Task<IActionResult> GetCombos()
    {
        var combos = GetDefaultCombos();
        var combosDir = GetCombosDirectory();

        if (Directory.Exists(combosDir))
        {
            var files = Directory.GetFiles(combosDir, "*.json");
            foreach (var f in files)
            {
                try
                {
                    var json = await System.IO.File.ReadAllTextAsync(f);
                    var userCombo = JsonSerializer.Deserialize<StrategyCombo>(json);
                    if (userCombo != null && !string.IsNullOrEmpty(userCombo.Id))
                    {
                        userCombo.IsBuiltIn = false;
                        // Avoid duplicates if built-in overwritten
                        combos.RemoveAll(c => c.Id.Equals(userCombo.Id, StringComparison.OrdinalIgnoreCase));
                        combos.Add(userCombo);
                    }
                }
                catch
                {
                    // Ignore corrupted combo files
                }
            }
        }

        return Ok(combos);
    }

    [HttpPost("combos")]
    public async Task<IActionResult> SaveCombo([FromBody] StrategyCombo combo)
    {
        if (string.IsNullOrWhiteSpace(combo.Name))
            return BadRequest("策略組合名稱不可為空。");

        if (combo.StrategyFileNames == null || !combo.StrategyFileNames.Any())
            return BadRequest("策略組合必須包含至少一個子策略。");

        if (string.IsNullOrWhiteSpace(combo.Id))
        {
            combo.Id = "custom-" + Guid.NewGuid().ToString("N")[..8];
        }

        combo.IsBuiltIn = false;
        combo.CreatedAt = DateTime.UtcNow;

        var combosDir = GetCombosDirectory();
        var safeId = string.Concat(combo.Id.Split(Path.GetInvalidFileNameChars()));
        var filePath = Path.Combine(combosDir, $"{safeId}.json");

        var json = JsonSerializer.Serialize(combo, new JsonSerializerOptions { WriteIndented = true });
        await System.IO.File.WriteAllTextAsync(filePath, json);

        return Ok(combo);
    }

    [HttpDelete("combos/{id}")]
    public IActionResult DeleteCombo(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest("無效的組合 ID。");

        var combosDir = GetCombosDirectory();
        var safeId = string.Concat(id.Split(Path.GetInvalidFileNameChars()));
        var filePath = Path.Combine(combosDir, $"{safeId}.json");

        if (System.IO.File.Exists(filePath))
        {
            System.IO.File.Delete(filePath);
            return Ok(new { success = true });
        }

        return NotFound("找不到該自訂策略組合。");
    }

    [HttpPost("scan-combo")]
    public async Task<IActionResult> ScanCombo([FromBody] ComboScanRequest request)
    {
        if (request.StrategyFileNames == null || !request.StrategyFileNames.Any())
        {
            return BadRequest("請至少選擇一個策略進行掃描。");
        }

        var strategiesDir = GetStrategiesDirectory();
        var loadedConfigs = new List<(string FileName, string DisplayName, StrategyConfig Config)>();

        foreach (var fileName in request.StrategyFileNames.Distinct())
        {
            var safeFile = Path.GetFileName(fileName);
            var filePath = Path.Combine(strategiesDir, safeFile);
            if (!System.IO.File.Exists(filePath)) continue;

            var json = await System.IO.File.ReadAllTextAsync(filePath);
            var config = JsonSerializer.Deserialize<StrategyConfig>(json);
            if (config != null)
            {
                var baseName = Path.GetFileNameWithoutExtension(safeFile);
                string displayName = baseName;
                if (DefaultStrategyMetadata.TryGetValue(baseName, out var meta))
                {
                    displayName = meta.Name;
                }
                loadedConfigs.Add((safeFile, displayName, config));
            }
        }

        if (!loadedConfigs.Any())
        {
            return BadRequest("找不到指定的策略設定檔。");
        }

        // 1. 取得標的名單
        var allStocks = await _repo.GetAllStocksAsync();
        var stockMap = allStocks.ToDictionary(s => s.Code, s => s, StringComparer.OrdinalIgnoreCase);

        var portfolioItems = await _repo.GetPortfolioAsync();
        var portfolioMap = portfolioItems.ToDictionary(p => p.StockCode, p => p, StringComparer.OrdinalIgnoreCase);

        List<string> targetCodes;
        if (request.TargetScope.Equals("portfolio", StringComparison.OrdinalIgnoreCase))
        {
            targetCodes = portfolioItems.Select(p => p.StockCode).Distinct().ToList();
            if (!targetCodes.Any())
            {
                return Ok(new
                {
                    totalTargetCount = 0,
                    matchedCount = 0,
                    targetScope = "portfolio",
                    logicMode = request.LogicMode,
                    results = Array.Empty<ComboScanItemResult>(),
                    message = "目前持股庫存中尚無股票。"
                });
            }
        }
        else if (request.TargetScope.Equals("tracking", StringComparison.OrdinalIgnoreCase))
        {
            targetCodes = (request.CustomCodes ?? new List<string>())
                .Distinct()
                .Where(c => stockMap.ContainsKey(c))
                .ToList();

            if (!targetCodes.Any())
            {
                return Ok(new
                {
                    totalTargetCount = 0,
                    matchedCount = 0,
                    targetScope = "tracking",
                    logicMode = request.LogicMode,
                    results = Array.Empty<ComboScanItemResult>(),
                    message = "自選監控清單目前為空。"
                });
            }
        }
        else // "all"
        {
            targetCodes = allStocks.Select(s => s.Code).Distinct().ToList();
        }

        // 2. 載入市場最近 120 天日線快照 (單次 SQL 查詢，記憶體分組)
        var allHistories = await _repo.GetMarketRecentPricesBatchAsync(120);

        var results = new ConcurrentBag<ComboScanItemResult>();
        int totalStrategies = loadedConfigs.Count;

        Parallel.ForEach(targetCodes, code =>
        {
            if (!allHistories.TryGetValue(code, out var history) || history == null || history.Count < 20)
                return;

            var lastIndex = history.Count - 1;
            var lastClose = history[lastIndex].Close;
            var volume = history[lastIndex].Volume;

            // 總成交量過濾 (全市場時若有設定)
            if (request.MinVolume > 0 && volume < request.MinVolume)
                return;

            decimal changePercent = 0;
            if (lastIndex >= 1 && history[lastIndex - 1].Close > 0)
            {
                changePercent = Math.Round((lastClose - history[lastIndex - 1].Close) / history[lastIndex - 1].Close * 100m, 2);
            }

            var matchedBuys = new List<string>();
            var matchedSells = new List<string>();

            foreach (var (_, displayName, config) in loadedConfigs)
            {
                var entryConditions = (config.Entry != null && config.Entry.Any())
                    ? config.Entry
                    : (config.Screen ?? new List<string>());

                if (entryConditions.Any() && _evaluator.EvaluateAll(entryConditions, history, lastIndex))
                {
                    matchedBuys.Add(displayName);
                }

                var exitConditions = config.Exit ?? new List<string>();
                if (exitConditions.Any() && _evaluator.EvaluateAll(exitConditions, history, lastIndex))
                {
                    matchedSells.Add(displayName);
                }
            }

            double matchScore = (double)matchedBuys.Count / totalStrategies * 100.0;

            bool isBuy = request.LogicMode.ToUpperInvariant() switch
            {
                "AND" => matchedBuys.Count == totalStrategies,
                "OR" => matchedBuys.Count > 0,
                "SCORE" => matchScore >= request.MinScorePercent,
                _ => matchedBuys.Count == totalStrategies
            };

            // 出場訊號：防禦性考量，任一策略給出賣出訊號即示警
            bool isSell = matchedSells.Count > 0;

            string overallAction = "Hold";
            if (isSell) overallAction = "Sell";
            else if (isBuy) overallAction = "Buy";

            // 納入判定：若為個人持股則全面列出健檢；若為自選或全市場則需有 Buy 或 Sell
            bool isPortfolio = request.TargetScope.Equals("portfolio", StringComparison.OrdinalIgnoreCase);
            bool shouldInclude = isPortfolio || isBuy || isSell;

            if (shouldInclude)
            {
                stockMap.TryGetValue(code, out var stockInfo);
                portfolioMap.TryGetValue(code, out var portItem);

                decimal? profitLoss = null;
                decimal? profitLossPercent = null;
                if (portItem != null && portItem.Quantity > 0 && portItem.AvgCost > 0)
                {
                    var buyCost = portItem.AvgCost * portItem.Quantity;
                    var buyFee = Math.Max(20, Math.Floor(buyCost * 0.001425m));
                    var totalCost = buyCost + buyFee;

                    var sellValue = lastClose * portItem.Quantity;
                    var sellFee = Math.Max(20, Math.Floor(sellValue * 0.001425m));
                    var sellTax = Math.Floor(sellValue * 0.003m);
                    var netSellValue = sellValue - sellFee - sellTax;

                    profitLoss = netSellValue - totalCost;
                    profitLossPercent = Math.Round((netSellValue - totalCost) / totalCost * 100m, 2);
                }

                results.Add(new ComboScanItemResult
                {
                    StockCode = code,
                    StockName = stockInfo?.Name ?? code,
                    Industry = stockInfo?.Industry ?? "",
                    LastClose = lastClose,
                    ChangePercent = changePercent,
                    Volume = volume,
                    LastDate = history[lastIndex].Date,
                    BuySignal = isBuy,
                    SellSignal = isSell,
                    OverallAction = overallAction,
                    MatchedBuyStrategies = matchedBuys,
                    MatchedSellStrategies = matchedSells,
                    MatchScore = Math.Round(matchScore, 1),
                    MatchedCount = matchedBuys.Count,
                    TotalStrategies = totalStrategies,
                    Quantity = portItem?.Quantity,
                    AvgCost = portItem?.AvgCost,
                    ProfitLoss = profitLoss,
                    ProfitLossPercent = profitLossPercent
                });
            }
        });

        IEnumerable<ComboScanItemResult> sorted;
        if (request.TargetScope.Equals("portfolio", StringComparison.OrdinalIgnoreCase))
        {
            sorted = results
                .OrderByDescending(r => r.SellSignal ? 2 : (r.BuySignal ? 1 : 0))
                .ThenByDescending(r => r.ProfitLossPercent ?? 0);
        }
        else
        {
            sorted = results
                .OrderByDescending(r => r.BuySignal ? 1 : 0)
                .ThenByDescending(r => r.MatchScore)
                .ThenByDescending(r => r.Volume);
        }

        return Ok(new
        {
            totalTargetCount = targetCodes.Count,
            matchedCount = results.Count,
            targetScope = request.TargetScope,
            logicMode = request.LogicMode,
            results = sorted.ToList()
        });
    }

    [HttpPost("scan-portfolio")]
    public async Task<IActionResult> ScanPortfolio([FromBody] ScanRequest request)
    {
        var strategiesDir = GetStrategiesDirectory();
        var safeFileName = Path.GetFileName(request.StrategyFileName);
        var strategyPath = Path.Combine(strategiesDir, safeFileName);

        if (!System.IO.File.Exists(strategyPath))
            return BadRequest($"Strategy file '{request.StrategyFileName}' not found.");

        var json = await System.IO.File.ReadAllTextAsync(strategyPath);
        var config = JsonSerializer.Deserialize<StrategyConfig>(json);
        if (config == null)
            return BadRequest("Failed to parse strategy file.");

        var portfolio = request.MyStocks ?? new List<PortfolioItemDto>();
        var results = new List<StockSignalResult>();

        var entryConditions = (config.Entry != null && config.Entry.Any())
            ? config.Entry
            : (config.Screen ?? new List<string>());
        var exitConditions = config.Exit ?? new List<string>();

        foreach (var item in portfolio)
        {
            var history = await _repo.GetDailyPricesAsync(item.StockCode);
            if (history.Count < 20) continue;

            var lastIndex = history.Count - 1;
            var buySignal = entryConditions.Any() && _evaluator.EvaluateAll(entryConditions, history, lastIndex);
            var sellSignal = exitConditions.Any() && _evaluator.EvaluateAll(exitConditions, history, lastIndex);

            decimal profitLoss = 0;
            if (item.Quantity > 0)
            {
                var currentPrice = history[lastIndex].Close;
                var buyCost = item.AvgCost * item.Quantity;
                var buyFee = Math.Max(20, Math.Floor(buyCost * 0.001425m));
                var totalCost = buyCost + buyFee;

                var sellValue = currentPrice * item.Quantity;
                var sellFee = Math.Max(20, Math.Floor(sellValue * 0.001425m));
                var sellTax = Math.Floor(sellValue * 0.003m);
                var netSellValue = sellValue - sellFee - sellTax;

                profitLoss = netSellValue - totalCost;
            }

            results.Add(new StockSignalResult
            {
                StockCode = item.StockCode,
                StockName = item.StockName,
                Quantity = item.Quantity,
                AvgCost = item.AvgCost,
                LastClose = history[lastIndex].Close,
                LastDate = history[lastIndex].Date,
                BuySignal = buySignal,
                SellSignal = sellSignal,
                ProfitLoss = profitLoss
            });
        }

        return Ok(results);
    }

    [HttpPost("snapshot")]
    public async Task<IActionResult> GetSnapshot([FromBody] SnapshotRequest request)
    {
        var results = new List<SnapshotItemDto>();
        if (request.Codes == null || !request.Codes.Any()) return Ok(results);

        foreach (var code in request.Codes)
        {
            var history = await _repo.GetDailyPricesAsync(code);
            if (!history.Any()) continue;

            var quotes = history.Select(h => new Skender.Stock.Indicators.Quote
            {
                Date = h.Date,
                Open = h.Open,
                High = h.High,
                Low = h.Low,
                Close = h.Close,
                Volume = h.Volume
            }).OrderBy(q => q.Date).ToList();

            var last = quotes.Last();
            var sma20 = quotes.GetSma(20).LastOrDefault()?.Sma;
            var rsi14 = quotes.GetRsi(14).LastOrDefault()?.Rsi;

            results.Add(new SnapshotItemDto
            {
                StockCode = code,
                Date = last.Date,
                Close = last.Close,
                Volume = last.Volume,
                Sma20 = sma20,
                Rsi14 = rsi14
            });
        }

        return Ok(results);
    }
}

public class ScanRequest
{
    public string StrategyFileName { get; set; } = string.Empty;
    public List<PortfolioItemDto> MyStocks { get; set; } = new();
}

public class SnapshotRequest
{
    public List<string> Codes { get; set; } = new();
}

public class SnapshotItemDto
{
    public string StockCode { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public decimal Close { get; set; }
    public decimal Volume { get; set; }
    public double? Sma20 { get; set; }
    public double? Rsi14 { get; set; }
}

public class PortfolioItemDto
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public string? SelectedStrategy { get; set; }
}

public class StockSignalResult
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public decimal LastClose { get; set; }
    public DateTime LastDate { get; set; }
    public bool BuySignal { get; set; }
    public bool SellSignal { get; set; }
    public decimal ProfitLoss { get; set; }
}
