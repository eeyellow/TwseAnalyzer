## 1. 專案初始化與基礎建設

- [ ] 1.1 建立 .NET 10 solution 結構：TWSE.sln、src/TWSE.Core、src/TWSE.Cli、tests/TWSE.Tests
- [ ] 1.2 加入 NuGet 依賴：Microsoft.Data.Sqlite、Dapper、System.Text.Json（TWSE.Core）
- [ ] 1.3 加入 NuGet 依賴：Spectre.Console、System.CommandLine（TWSE.Cli）
- [ ] 1.4 加入 NuGet 依賴：Skender.Stock.Indicators（TWSE.Core）
- [ ] 1.5 加入 NuGet 依賴：YahooQuotesApi 或 YahooFinanceApi（TWSE.Core）
- [ ] 1.6 加入 NuGet 依賴：xunit、xunit.runner.visualstudio、Moq（TWSE.Tests）
- [ ] 1.7 建立 Models 資料夾並定義核心 POCO：StockInfo、OHLCV（實作 IQuote）、TradeRecord、BacktestResult、ScreenerConfig、StrategyConfig

## 2. 資料管理層（Data Layer）

- [ ] 2.1 實作 SQLite 資料庫初始化：建立 `stocks` 表（code, name, industry）和 `daily_prices` 表（code, date, open, high, low, close, volume），加入適當 index
- [ ] 2.2 實作 `TwseFetcher`：從 TWSE OpenAPI 下載上市股票清單，解析 JSON 回傳至 `List<StockInfo>`
- [ ] 2.3 實作 `YahooFetcher`：從 Yahoo Finance 下載指定股票的歷史日 K 線，轉換為 `List<OHLCV>`，包含 throttling（500ms 間隔）
- [ ] 2.4 實作 `IStockRepository` 介面與 `SqliteRepository`：CRUD 操作（insert stocks、insert/query daily_prices、取得最新日期、批次 insert）
- [ ] 2.5 實作增量更新邏輯：查詢本地最新日期，只下載缺漏資料並 append
- [ ] 2.6 撰寫 Data Layer 單元測試：TwseFetcher 解析、SqliteRepository CRUD、增量更新邏輯

## 3. 技術指標引擎（Indicators）

- [ ] 3.1 實作 `IIndicatorService` 介面，定義計算各指標的方法簽章
- [ ] 3.2 實作 `SkenderIndicatorService`：包裝 Skender.Stock.Indicators，支援 SMA、EMA、KD、RSI、MACD、Bollinger Bands、成交量 SMA
- [ ] 3.3 實作交叉訊號偵測邏輯（cross_above / cross_below）
- [ ] 3.4 撰寫 Indicators 單元測試：驗證各指標計算結果、交叉訊號偵測正確性

## 4. 條件選股引擎（Screening）

- [ ] 4.1 定義 `ScreenerConfig` JSON 結構並實作反序列化（screen conditions、sortBy、limit）
- [ ] 4.2 實作 `IConditionEvaluator` 介面與 `JsonConditionEvaluator`：支援 greater_than、less_than、cross_above、cross_below、between 運算子
- [ ] 4.3 實作 `IScreener` 介面與 `StockScreener`：載入設定檔 → 遍歷所有股票 → 評估條件 → 排序 → 限制筆數 → 回傳結果
- [ ] 4.4 撰寫 Screening 單元測試：JSON 設定檔解析、各運算子評估、全市場掃描邏輯

## 5. 策略回測引擎（Backtesting）

- [ ] 5.1 定義 `StrategyConfig` JSON 結構並實作反序列化（backtest params、entry conditions、exit conditions）
- [ ] 5.2 實作 `IBacktestEngine` 介面與 `BacktestEngine`：逐日推進、評估進出場條件、模擬交易（隔日開盤價成交）
- [ ] 5.3 實作手續費與證交稅計算邏輯（買 0.1425%、賣 0.1425% + 0.3%）
- [ ] 5.4 實作固定金額部位管理（以 1000 股為單位向下取整、資金不足檢查）
- [ ] 5.5 實作回測期間結束強制平倉邏輯
- [ ] 5.6 實作績效指標計算：總報酬率、年化報酬率、勝率、最大回撤（MDD）、Sharpe Ratio
- [ ] 5.7 實作全市場回測掃描：對所有股票執行回測 → 按報酬率排序 → 取 top N
- [ ] 5.8 撰寫 Backtesting 單元測試：模擬交易流程、手續費計算、績效指標、edge cases

## 6. CLI 介面（Commands）

- [ ] 6.1 設定 System.CommandLine 根命令與子命令結構（init / update / scan / backtest / analyze）
- [ ] 6.2 實作 `InitCommand`：呼叫 TwseFetcher + YahooFetcher + SqliteRepository，Spectre.Console 進度條顯示下載進度，支援 `--years` 參數
- [ ] 6.3 實作 `UpdateCommand`：呼叫增量更新邏輯，顯示更新結果摘要
- [ ] 6.4 實作 `ScanCommand`：載入策略 JSON → 執行選股 → Spectre.Console 表格輸出結果，支援 `--strategy` 參數
- [ ] 6.5 實作 `BacktestCommand`：載入策略 JSON → 執行回測 → Spectre.Console 表格輸出績效報告與交易明細，支援 `--stock`、`--all`、`--top`、`--strategy` 參數
- [ ] 6.6 實作 `AnalyzeCommand`：取得單股資料 → 計算所有指標 → Spectre.Console 格式化輸出，支援 `--stock` 參數
- [ ] 6.7 實作 Spectre.Console 輸出格式化：漲為綠色、跌為紅色、表格對齊

## 7. 範例策略與整合測試

- [ ] 7.1 建立範例策略檔案：strategies/golden-cross.json（黃金交叉策略）
- [ ] 7.2 建立範例策略檔案：strategies/oversold-bounce.json（超賣反彈選股）
- [ ] 7.3 端到端整合測試：init → update → scan → backtest 完整流程驗證
