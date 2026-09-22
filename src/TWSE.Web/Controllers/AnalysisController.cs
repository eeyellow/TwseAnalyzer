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
    private readonly IBacktestEngine _backtestEngine;

    public AnalysisController(IStockRepository repo, IConditionEvaluator evaluator, IBacktestEngine backtestEngine)
    {
        _repo = repo;
        _evaluator = evaluator;
        _backtestEngine = backtestEngine;
    }

    public static string GetStrategiesDirectory()
    {
        var envPath = Environment.GetEnvironmentVariable("TWSE_STRATEGIES_PATH");
        if (!string.IsNullOrEmpty(envPath) && Directory.Exists(envPath))
            return Path.GetFullPath(envPath);

        string? fallbackDir = null;

        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current != null)
        {
            var candidate = Path.Combine(current.FullName, "strategies");
            if (Directory.Exists(candidate))
            {
                if (Directory.GetFiles(candidate, "*.json").Length > 0)
                    return candidate;
                fallbackDir ??= candidate;
            }
            current = current.Parent;
        }

        var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
        while (baseDir != null)
        {
            var candidate = Path.Combine(baseDir.FullName, "strategies");
            if (Directory.Exists(candidate))
            {
                if (Directory.GetFiles(candidate, "*.json").Length > 0)
                    return candidate;
                fallbackDir ??= candidate;
            }
            baseDir = baseDir.Parent;
        }

        if (Directory.Exists("/app/strategies"))
        {
            return "/app/strategies";
        }

        return fallbackDir ?? Path.Combine(Directory.GetCurrentDirectory(), "strategies");
    }

    private static string? GetCombosDirectory()
    {
        try
        {
            var strategiesDir = GetStrategiesDirectory();
            var combosDir = Path.Combine(strategiesDir, "combos");
            if (!Directory.Exists(combosDir))
            {
                Directory.CreateDirectory(combosDir);
            }
            return combosDir;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TWSE.Web] Note: Could not access combos directory: {ex.Message}");
            return null;
        }
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
                // Fallback to filename
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
        var combos = new List<StrategyCombo>();
        var combosDir = GetCombosDirectory();

        if (!string.IsNullOrEmpty(combosDir) && Directory.Exists(combosDir))
        {
            try
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
                            combos.RemoveAll(c => c.Id.Equals(userCombo.Id, StringComparison.OrdinalIgnoreCase));
                            combos.Add(userCombo);
                        }
                    }
                    catch
                    {
                        // Ignore individual corrupt combo file
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TWSE.Web] Note: Could not read custom combos directory: {ex.Message}");
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
        if (!string.IsNullOrEmpty(combosDir))
        {
            try
            {
                var safeId = string.Concat(combo.Id.Split(Path.GetInvalidFileNameChars()));
                var filePath = Path.Combine(combosDir, $"{safeId}.json");
                var json = JsonSerializer.Serialize(combo, new JsonSerializerOptions { WriteIndented = true });
                await System.IO.File.WriteAllTextAsync(filePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TWSE.Web] Warning: Could not save combo to disk ({ex.Message}). Still returning created combo.");
            }
        }

        return Ok(combo);
    }

    [HttpDelete("combos/{id}")]
    public IActionResult DeleteCombo(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest("無效的組合 ID。");

        var combosDir = GetCombosDirectory();
        if (string.IsNullOrEmpty(combosDir)) return Ok(new { success = true });

        try
        {
            var safeId = string.Concat(id.Split(Path.GetInvalidFileNameChars()));
            var filePath = Path.Combine(combosDir, $"{safeId}.json");

            if (System.IO.File.Exists(filePath))
            {
                System.IO.File.Delete(filePath);
            }
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return BadRequest($"刪除失敗: {ex.Message}");
        }
    }

    [HttpPost("scan-combo")]
    public async Task<IActionResult> ScanCombo([FromBody] ComboScanRequest request)
    {
        if (request.StrategyFileNames == null || !request.StrategyFileNames.Any())
        {
            return BadRequest("請至少選擇一個策略進行掃描。");
        }

        var strategiesDir = GetStrategiesDirectory();
        if (!Directory.Exists(strategiesDir))
        {
            return BadRequest($"找不到策略目錄 '{strategiesDir}'，請確認 strategies 目錄已建立並放入策略檔案。");
        }

        var loadedConfigs = new List<(string FileName, string DisplayName, StrategyConfig Config)>();

        foreach (var fileName in request.StrategyFileNames.Distinct())
        {
            var safeFile = Path.GetFileName(fileName);
            var filePath = Path.Combine(strategiesDir, safeFile);

            if (!System.IO.File.Exists(filePath))
            {
                continue;
            }

            try
            {
                var json = await System.IO.File.ReadAllTextAsync(filePath);
                var config = JsonSerializer.Deserialize<StrategyConfig>(json);
                if (config != null)
                {
                    var baseName = Path.GetFileNameWithoutExtension(safeFile);
                    string displayName = baseName;
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("name", out var nProp) && !string.IsNullOrWhiteSpace(nProp.GetString()))
                    {
                        displayName = nProp.GetString()!;
                    }

                    loadedConfigs.Add((safeFile, displayName, config));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TWSE.Web] Error reading strategy '{safeFile}': {ex.Message}");
            }
        }

        if (!loadedConfigs.Any())
        {
            return BadRequest("未能在 strategies 目錄中找到或解析指定的策略設定檔，請確認檔案已上傳至伺服器。");
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
            if (!targetCodes.Any())
            {
                return Ok(new
                {
                    totalTargetCount = 0,
                    matchedCount = 0,
                    targetScope = "all",
                    logicMode = request.LogicMode,
                    results = Array.Empty<ComboScanItemResult>(),
                    message = "資料庫中尚無個股清單，請先至排程或儀表板執行台股資料更新。"
                });
            }
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

            bool isSell = matchedSells.Count > 0;

            string overallAction = "Hold";
            if (isSell) overallAction = "Sell";
            else if (isBuy) overallAction = "Buy";

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
        {
            return BadRequest($"在策略目錄 '{strategiesDir}' 中找不到策略檔案 '{request.StrategyFileName}'，請確認檔案已放置於該目錄。");
        }

        var json = await System.IO.File.ReadAllTextAsync(strategyPath);
        var config = JsonSerializer.Deserialize<StrategyConfig>(json);
        if (config == null)
            return BadRequest("無法解析策略設定檔內容。");

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

    [HttpPost("backtest-stock")]
    public async Task<IActionResult> BacktestStock([FromBody] StockBacktestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.StockCode))
            return BadRequest("請提供有效的股票代號。");

        var stockCode = request.StockCode.Trim();
        var history = await _repo.GetDailyPricesAsync(stockCode);
        if (history == null || history.Count < 20)
            return BadRequest($"標的 '{stockCode}' 歷史日線數據不足，無法進行回測。");

        var strategiesDir = GetStrategiesDirectory();
        if (!Directory.Exists(strategiesDir))
            return BadRequest("找不到策略目錄。");

        var filesToLoad = (request.StrategyFileNames != null && request.StrategyFileNames.Any())
            ? request.StrategyFileNames
            : Directory.GetFiles(strategiesDir, "*.json").Select(Path.GetFileName).ToList()!;

        var loadedConfigs = new List<StrategyConfig>();
        var loadedNames = new List<string>();

        foreach (var rawName in filesToLoad)
        {
            if (string.IsNullOrWhiteSpace(rawName)) continue;
            var safeFile = Path.GetFileName(rawName);
            var filePath = Path.Combine(strategiesDir, safeFile);
            if (!System.IO.File.Exists(filePath)) continue;

            try
            {
                var json = await System.IO.File.ReadAllTextAsync(filePath);
                var cfg = JsonSerializer.Deserialize<StrategyConfig>(json);
                if (cfg != null)
                {
                    var baseName = Path.GetFileNameWithoutExtension(safeFile);
                    string displayName = baseName;
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("name", out var nProp) && !string.IsNullOrWhiteSpace(nProp.GetString()))
                    {
                        displayName = nProp.GetString()!;
                    }
                    loadedNames.Add(displayName);
                    loadedConfigs.Add(cfg);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TWSE.Web] Error loading strategy '{safeFile}': {ex.Message}");
            }
        }

        if (!loadedConfigs.Any())
        {
            return BadRequest("未找到指定的策略配置檔案。");
        }

        var capital = request.InitialCapital > 0 ? request.InitialCapital : 1000000m;
        var backtestParams = new BacktestParams
        {
            StartDate = string.IsNullOrWhiteSpace(request.StartDate) ? null : request.StartDate.Trim(),
            EndDate = string.IsNullOrWhiteSpace(request.EndDate) ? null : request.EndDate.Trim(),
            InitialCapital = capital,
            PositionSize = capital,
            CommissionRate = 0.001425m,
            TaxRate = 0.003m
        };

        var logicMode = string.IsNullOrWhiteSpace(request.LogicMode) ? "AND" : request.LogicMode;
        var minScore = request.MinScorePercent > 0 ? request.MinScorePercent : 66.0;

        var result = await _backtestEngine.RunComboAsync(stockCode, loadedConfigs, logicMode, minScore, backtestParams, history);

        var allStocks = await _repo.GetAllStocksAsync();
        var stockInfo = allStocks.FirstOrDefault(s => s.Code.Equals(stockCode, StringComparison.OrdinalIgnoreCase));

        return Ok(new
        {
            stockCode = stockCode,
            stockName = stockInfo?.Name ?? stockCode,
            industry = stockInfo?.Industry ?? "",
            initialCapital = result.InitialCapital,
            finalCapital = result.FinalCapital,
            totalReturn = result.TotalReturn,
            annualizedReturn = result.AnnualizedReturn,
            winRate = result.WinRate,
            totalTrades = result.TotalTrades,
            maxDrawdown = result.MaxDrawdown,
            sharpeRatio = result.SharpeRatio,
            trades = result.Trades.Select(t => new
            {
                buyDate = t.BuyDate.ToString("yyyy-MM-dd"),
                buyPrice = t.BuyPrice,
                sellDate = t.SellDate?.ToString("yyyy-MM-dd") ?? "",
                sellPrice = t.SellPrice ?? 0m,
                quantity = t.Quantity,
                @return = t.ReturnRate ?? 0m,
                returnRate = t.ReturnRate ?? 0m,
                profitLoss = t.Profit ?? 0m,
                days = t.HoldDays ?? 0
            }).ToList(),
            strategiesUsed = loadedNames,
            logicMode = logicMode,
            startDate = backtestParams.StartDate,
            endDate = backtestParams.EndDate
        });
    }
}

public class StockBacktestRequest
{
    public string StockCode { get; set; } = string.Empty;
    public List<string> StrategyFileNames { get; set; } = new();
    public string? LogicMode { get; set; } = "AND";
    public double MinScorePercent { get; set; } = 66.0;
    public string? StartDate { get; set; }
    public string? EndDate { get; set; }
    public decimal InitialCapital { get; set; } = 1000000;
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
