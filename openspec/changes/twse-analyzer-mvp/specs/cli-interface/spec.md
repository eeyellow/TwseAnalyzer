## ADDED Requirements

### Requirement: init 命令
系統 SHALL 提供 `init` 命令，執行首次初始化：下載上市股票清單並批次下載所有股票的歷史 K 線資料。

#### Scenario: 執行首次初始化
- **WHEN** 使用者執行 `dotnet run -- init`
- **THEN** 系統 SHALL 依序執行：建立 SQLite 資料庫 → 下載股票清單 → 批次下載歷史 K 線，並以 Spectre.Console 進度條顯示進度

#### Scenario: 指定歷史資料年數
- **WHEN** 使用者執行 `dotnet run -- init --years 5`
- **THEN** 系統 SHALL 只下載最近 5 年的歷史 K 線資料（而非預設的全部可用歷史）

### Requirement: update 命令
系統 SHALL 提供 `update` 命令，執行增量更新。

#### Scenario: 執行每日更新
- **WHEN** 使用者執行 `dotnet run -- update`
- **THEN** 系統 SHALL 增量更新所有股票的歷史 K 線資料至最新，並顯示更新結果摘要

### Requirement: scan 命令
系統 SHALL 提供 `scan` 命令，使用指定的篩選策略掃描全市場。

#### Scenario: 使用策略檔案掃描
- **WHEN** 使用者執行 `dotnet run -- scan --strategy strategies/oversold-bounce.json`
- **THEN** 系統 SHALL 載入篩選策略、對全部上市股票評估條件、以 Spectre.Console 表格顯示符合條件的股票清單

### Requirement: backtest 命令
系統 SHALL 提供 `backtest` 命令，對指定股票或全市場執行策略回測。

#### Scenario: 單股回測
- **WHEN** 使用者執行 `dotnet run -- backtest --strategy strategies/golden-cross.json --stock 2330`
- **THEN** 系統 SHALL 對 2330 執行回測並以 Spectre.Console 表格顯示績效報告與交易明細

#### Scenario: 全市場回測
- **WHEN** 使用者執行 `dotnet run -- backtest --strategy strategies/golden-cross.json --all --top 20`
- **THEN** 系統 SHALL 對所有上市股票執行回測，以 Spectre.Console 表格顯示報酬率前 20 名的績效摘要

### Requirement: analyze 命令
系統 SHALL 提供 `analyze` 命令，顯示單一股票的技術指標分析。

#### Scenario: 查看個股分析
- **WHEN** 使用者執行 `dotnet run -- analyze --stock 2330`
- **THEN** 系統 SHALL 顯示 2330 的最新技術指標值（SMA、EMA、KD、RSI、MACD、Bollinger Bands），使用 Spectre.Console 格式化輸出

### Requirement: Spectre.Console 格式化輸出
系統 SHALL 使用 Spectre.Console 提供美觀的表格和格式化輸出。

#### Scenario: 表格輸出篩選結果
- **WHEN** 系統需要顯示篩選結果或回測報告
- **THEN** 系統 SHALL 使用 Spectre.Console 的 `Table` 元件顯示對齊的表格，包含色彩標記（漲為綠色、跌為紅色）

#### Scenario: 進度條顯示批次操作
- **WHEN** 系統執行批次下載或批次回測
- **THEN** 系統 SHALL 使用 Spectre.Console 的 `Progress` 元件顯示進度條
