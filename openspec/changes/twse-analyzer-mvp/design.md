## Context

這是一個全新的 .NET 10 CLI 專案，目標是為台股投資人提供盤後技術分析工具。專案從零開始，無既有程式碼或架構約束。

核心使用場景：盤後下載最新資料 → 條件選股找出潛力標的 → 策略回測驗證績效 → 制定交易策略。

## Goals / Non-Goals

**Goals:**
- 建構可獨立測試的核心邏輯層（TWSE.Core），與 UI 完全解耦
- 提供 JSON 設定檔驅動的策略定義，降低使用門檻
- 支援全台上市個股的批次條件選股與回測
- 預留 Roslyn C# Scripting 升級路徑（透過 `IConditionEvaluator` 介面）

**Non-Goals:**
- 即時報價或盤中推播（本專案專注盤後分析）
- Terminal.Gui TUI Dashboard（MVP 階段使用 CLI + Spectre.Console）
- 上櫃股票（MVP 僅處理上市 .TW）
- 下單功能或券商 API 整合
- 複雜的資金管理（MVP 使用固定金額部位）

## Decisions

### 1. 專案分層架構

```
TWSE.sln
├── src/
│   ├── TWSE.Core/          # 核心邏輯，零 UI 依賴
│   │   ├── Models/         # StockInfo, OHLCV, TradeRecord, BacktestResult...
│   │   ├── Data/           # IStockRepository, SqliteRepository, YahooFetcher, TwseFetcher
│   │   ├── Indicators/     # IIndicatorService (wrap Skender.Stock.Indicators)
│   │   ├── Screening/      # IScreener, JsonScreener, IConditionEvaluator
│   │   ├── Backtesting/    # IBacktestEngine, BacktestEngine
│   │   └── Configuration/  # StrategyConfig, ScreenerConfig, AppSettings
│   │
│   └── TWSE.Cli/           # CLI 入口，依賴 TWSE.Core
│       ├── Commands/       # InitCommand, UpdateCommand, ScanCommand, BacktestCommand, AnalyzeCommand
│       └── Program.cs
│
└── tests/
    └── TWSE.Tests/         # xUnit 單元測試
```

**理由**: Core/CLI 分離確保核心邏輯可獨立測試，未來換 UI（Terminal.Gui、Web、Avalonia）只需新增 presentation 層。

**替代方案**: 單一專案 — 更簡單但不利於測試和未來擴展，不採用。

### 2. 資料儲存選用 SQLite

- 單檔資料庫，零部署成本
- 適合結構化的 OHLCV 時序資料
- 支援 index 加速查詢（按 stock code + date）
- 使用 `Microsoft.Data.Sqlite` + Dapper（輕量 ORM）

**替代方案**: CSV 檔 — 查詢效率差，不適合全市場掃描；LiteDB — NoSQL 不適合結構化時序資料。

### 3. 技術指標引擎使用 Skender.Stock.Indicators

- 150+ 指標，涵蓋所有 MVP 需求
- 輸入 `IEnumerable<IQuote>`，輸出指標結果序列
- 維護活躍，文件齊全
- 用 `IIndicatorService` 介面包裝，方便測試時 mock

**替代方案**: 自行實作 — 重造輪子，不必要；TALib.NETCore — C wrapper，跨平台問題多。

### 4. 策略設定檔格式使用 JSON

- 使用者熟悉 JSON
- `System.Text.Json` 原生支援，反序列化為強型別 POCO
- 支援 JSON Schema validation（未來可加）


### 5. 條件評估器的抽象設計

```
IConditionEvaluator
├── JsonConditionEvaluator    ← Phase 1: 解析 JSON 條件設定
└── ScriptConditionEvaluator  ← Phase 2: Roslyn C# Scripting (未來)
```

`IConditionEvaluator.Evaluate(IReadOnlyList<OHLCV> history, int currentIndex) → bool`

這個介面是升級到 Roslyn Scripting 的關鍵擴展點。

### 6. 回測引擎避免 Look-ahead Bias

- 訊號在 Day N 收盤後產生
- 實際交易使用 Day N+1 的開盤價
- 手續費 0.1425%（買賣都收）+ 證交稅 0.3%（賣出時收）

### 7. CLI 框架使用 Spectre.Console + System.CommandLine

- `System.CommandLine` 處理命令解析（init / update / scan / backtest / analyze）
- `Spectre.Console` 處理美觀輸出（表格、進度條、色彩）

### 8. Yahoo Finance 資料抓取策略

- 使用 `YahooQuotesApi` 或 `YahooFinanceApi` NuGet 套件
- 台股代碼格式: `{code}.TW`（上市）
- 批次抓取需加入 throttling（每次間隔 500ms-1s）避免被封鎖
- 首次初始化: 下載全部上市個股所有可用歷史 K 線（Yahoo Finance 通常可提供 10+ 年）
- 日常更新: 只抓最新缺漏的日期資料

## Risks / Trade-offs

| 風險 | 緩解策略 |
|------|---------|
| Yahoo Finance API 被封鎖或改版 | 資料抓取層做抽象（`IDataFetcher`），可替換為其他資料源；本地快取減少 API 呼叫 |
| 首次下載 ~1,700 支股票耗時長 | 顯示進度條；支援中斷續傳（記錄已完成的股票）|
| TWSE OpenAPI 回傳格式變更 | 用專門的 `TwseFetcher` 隔離，變更只影響單一class |
| Skender.Stock.Indicators 套件不支援某些特殊指標 | `IIndicatorService` 抽象允許混合使用自定義計算 |
| .NET 10 preview 穩定性 | 如果遇到嚴重問題可降級到 .NET 9 |
| SQLite 單檔在大量寫入時效能 | 使用 WAL mode、批次 INSERT、適當 index |
