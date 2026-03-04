## ADDED Requirements

### Requirement: 取得上市股票清單
系統 SHALL 從 TWSE OpenAPI 取得所有上市股票的基本資料（股票代碼、名稱、產業別），並儲存至本地 SQLite 資料庫。

#### Scenario: 首次初始化取得股票清單
- **WHEN** 使用者執行 `init` 命令
- **THEN** 系統從 TWSE OpenAPI 下載上市股票清單，儲存到 SQLite 的 `stocks` 表，並顯示取得的股票總數

#### Scenario: 股票清單已存在時重新取得
- **WHEN** 使用者執行 `init` 命令且 `stocks` 表已有資料
- **THEN** 系統 SHALL 清除舊資料並重新下載完整清單

### Requirement: 下載歷史 K 線資料
系統 SHALL 從 Yahoo Finance 下載指定股票的歷史日 K 線資料（開盤價、最高價、最低價、收盤價、成交量），並儲存至本地 SQLite 資料庫。

#### Scenario: 首次下載全部股票歷史資料
- **WHEN** 使用者執行 `init` 命令
- **THEN** 系統 SHALL 批次下載所有上市股票的全部可用歷史日 K 線，儲存到 SQLite 的 `daily_prices` 表，並顯示下載進度

#### Scenario: 單支股票下載失敗時繼續
- **WHEN** 下載某支股票歷史資料失敗（網路錯誤、Yahoo 回傳空資料等）
- **THEN** 系統 SHALL 記錄錯誤並繼續下載其他股票，最後顯示失敗清單

#### Scenario: 批次下載時加入 throttling
- **WHEN** 批次下載多支股票歷史資料
- **THEN** 每次 API 呼叫之間 SHALL 間隔至少 500ms，避免被 Yahoo Finance 封鎖

### Requirement: 增量更新歷史資料
系統 SHALL 支援增量更新，只下載每支股票在本地資料庫中最後一筆日期之後的新資料。

#### Scenario: 執行每日更新
- **WHEN** 使用者執行 `update` 命令
- **THEN** 系統 SHALL 檢查每支股票在本地的最新日期，從 Yahoo Finance 下載缺漏的日 K 線資料，並 append 到 `daily_prices` 表

#### Scenario: 資料已是最新
- **WHEN** 使用者執行 `update` 命令且本地資料已是最新（最新日期 = 最近交易日）
- **THEN** 系統 SHALL 顯示「資料已是最新」，不進行任何下載

### Requirement: 台股代碼格式
系統 SHALL 使用 `{股票代碼}.TW` 格式對應 Yahoo Finance 的台股上市個股代碼。

#### Scenario: 轉換台股代碼
- **WHEN** 需要從 Yahoo Finance 查詢股票代碼 `2330` 的資料
- **THEN** 系統 SHALL 使用 `2330.TW` 作為 Yahoo Finance 查詢代碼
