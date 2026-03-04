## ADDED Requirements

### Requirement: JSON 設定檔定義篩選條件
系統 SHALL 支援以 JSON 設定檔定義條件選股策略，包含篩選條件、排序規則和結果限制。

#### Scenario: 載入篩選策略設定檔
- **WHEN** 使用者指定一個 JSON 格式的篩選策略檔案
- **THEN** 系統 SHALL 反序列化為 `ScreenerConfig` 物件，包含 `screen`（條件陣列）、`sortBy`（排序規則）、`limit`（筆數限制）

#### Scenario: 設定檔格式錯誤
- **WHEN** 使用者提供的 JSON 檔案缺少必要欄位或格式不正確
- **THEN** 系統 SHALL 顯示明確的錯誤訊息，指出問題所在

### Requirement: 多條件 AND 組合篩選
系統 SHALL 將 `screen` 陣列中的所有條件以 AND 邏輯組合，只有全部條件都滿足的股票才會被選出。

#### Scenario: 全部條件都滿足
- **WHEN** 某股票滿足所有篩選條件
- **THEN** 該股票 SHALL 出現在篩選結果中

#### Scenario: 任一條件不滿足
- **WHEN** 某股票有任何一個篩選條件不滿足
- **THEN** 該股票 SHALL NOT 出現在篩選結果中

### Requirement: 支援技術指標比較運算子
系統 SHALL 支援以下運算子用於條件判斷：`greater_than`、`less_than`、`cross_above`、`cross_below`、`between`。

#### Scenario: 數值比較（greater_than / less_than）
- **WHEN** 條件指定 `RSI(14) less_than 30`
- **THEN** 系統 SHALL 篩選出 RSI(14) 值小於 30 的股票

#### Scenario: 交叉比較（cross_above）
- **WHEN** 條件指定 `SMA(5) cross_above SMA(20)`
- **THEN** 系統 SHALL 篩選出最新一根 K 線 SMA(5) 從下方穿越 SMA(20) 的股票

#### Scenario: 指標對指標比較（含 multiplier）
- **WHEN** 條件指定 `Volume greater_than SMA(Volume, 20)` 且 `multiplier: 1.5`
- **THEN** 系統 SHALL 篩選出成交量大於 20 日均量 × 1.5 的股票

### Requirement: 篩選結果排序
系統 SHALL 支援依據技術指標值對篩選結果進行排序。

#### Scenario: 依 RSI 升冪排序
- **WHEN** 排序規則指定 `RSI(14) asc`
- **THEN** 篩選結果 SHALL 按 RSI(14) 值由小到大排列

### Requirement: 限制篩選結果筆數
系統 SHALL 支援 `limit` 參數限制篩選結果的最大筆數。

#### Scenario: 設定 limit 為 20
- **WHEN** 篩選結果有 50 支股票且 limit 設為 20
- **THEN** 系統 SHALL 只回傳排序後的前 20 支股票

### Requirement: 全市場掃描
系統 SHALL 支援對所有上市股票執行篩選條件。

#### Scenario: 掃描全部上市股票
- **WHEN** 使用者執行 `scan` 命令且未指定特定股票
- **THEN** 系統 SHALL 對 `stocks` 表中所有上市股票逐一評估篩選條件

### Requirement: 條件評估器可擴展
系統 SHALL 透過 `IConditionEvaluator` 介面抽象條件評估邏輯，允許未來擴展為 Roslyn C# Scripting。

#### Scenario: 使用 JSON 條件評估器
- **WHEN** 系統解析 JSON 設定檔中的條件
- **THEN** 系統 SHALL 使用 `JsonConditionEvaluator` 實作 `IConditionEvaluator` 介面來評估條件
