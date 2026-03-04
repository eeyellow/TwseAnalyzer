## Why

台股投資人缺乏一個輕量、可離線使用的盤後技術分析工具。現有方案要嘛是付費看盤軟體（XQ、三竹），要嘛是 Web 平台（Goodinfo、CMoney），都缺乏：

- **策略回測能力** — 無法用自訂條件驗證策略歷史績效
- **條件選股自動化** — 手動一支一支看，效率極低
- **可程式化擴展** — 無法用設定檔或腳本定義策略

本專案打造一個 CLI 工具，讓使用者能快速下載台股歷史資料、執行技術分析、條件選股、策略回測，全部在終端機完成。

## What Changes

這是一個全新專案，從零開始建構：

- **新增資料管理系統** — 從 TWSE OpenAPI 取得上市股票清單，從 Yahoo Finance 下載歷史 K 線，儲存至 SQLite，支援全量初始化與增量更新
- **新增技術指標引擎** — 整合 Skender.Stock.Indicators，計算 SMA、EMA、KD、RSI、MACD、Bollinger Bands 等核心指標
- **新增條件選股引擎** — 以 JSON 設定檔定義篩選條件，支援多條件 AND 組合與排序
- **新增策略回測引擎** — 以 JSON 設定檔定義進出場條件，模擬交易含手續費與證交稅，產出績效報告
- **新增 CLI 介面** — 使用 Spectre.Console 輸出美觀的表格與報告

## Capabilities

### New Capabilities
- `data-management`: 股票清單取得（TWSE OpenAPI）、歷史 K 線下載（Yahoo Finance）、SQLite 儲存與增量更新
- `technical-indicators`: 技術指標計算引擎，包裝 Skender.Stock.Indicators，支援 SMA/EMA/KD/RSI/MACD/Bollinger Bands
- `stock-screening`: JSON 設定檔驅動的條件選股引擎，支援多條件篩選、排序、限制筆數
- `strategy-backtesting`: JSON 設定檔驅動的策略回測引擎，含模擬交易、手續費/證交稅計算、績效指標報告
- `cli-interface`: CLI 命令介面（init / update / scan / backtest / analyze），使用 Spectre.Console 表格輸出

### Modified Capabilities
（無，這是全新專案）

## Impact

- **新增 NuGet 依賴**: Spectre.Console、YahooQuotesApi 或 YahooFinanceApi、Skender.Stock.Indicators、Microsoft.Data.Sqlite、System.Text.Json
- **目標框架**: .NET 10
- **專案結構**: TWSE.Core（核心邏輯）、TWSE.Cli（CLI 入口）、TWSE.Tests（單元測試）
- **外部 API 依賴**: TWSE OpenAPI（免費、無需 API Key）、Yahoo Finance（免費、有 rate limiting）
- **本地儲存**: SQLite 資料庫存放於根目錄的 `data/twse.db` 檔案
