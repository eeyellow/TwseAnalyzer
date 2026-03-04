## ADDED Requirements

### Requirement: JSON 設定檔定義回測策略
系統 SHALL 支援以 JSON 設定檔定義回測策略，包含回測參數（時間範圍、初始資金、部位大小、手續費率、稅率）、進場條件與出場條件。

#### Scenario: 載入回測策略設定檔
- **WHEN** 使用者指定一個 JSON 格式的回測策略檔案
- **THEN** 系統 SHALL 反序列化為 `StrategyConfig` 物件，包含 `backtest`（回測參數）、`entry`（進場條件陣列）、`exit`（出場條件陣列）

#### Scenario: 未指定時間範圍時使用預設值
- **WHEN** 策略設定檔未指定 `startDate` 和 `endDate`
- **THEN** 系統 SHALL 使用預設的 3 年回測期間（從今天往前推 3 年）

### Requirement: 回測引擎模擬交易
系統 SHALL 依據進場條件和出場條件，對歷史 K 線資料逐日模擬交易。

#### Scenario: 進場條件觸發買入
- **WHEN** 技術指標在 Day N 收盤後滿足所有進場條件，且目前無持倉
- **THEN** 系統 SHALL 在 Day N+1 的開盤價模擬買入，買入金額為設定的 `positionSize`

#### Scenario: 出場條件觸發賣出
- **WHEN** 技術指標在 Day N 收盤後滿足任一出場條件，且目前有持倉
- **THEN** 系統 SHALL 在 Day N+1 的開盤價模擬賣出

#### Scenario: 回測期間結束時強制平倉
- **WHEN** 回測期間結束時仍有持倉
- **THEN** 系統 SHALL 在最後一個交易日收盤價強制平倉

### Requirement: 手續費與證交稅計算
系統 SHALL 在模擬交易中計算手續費和證交稅。

#### Scenario: 買入扣除手續費
- **WHEN** 模擬買入交易
- **THEN** 系統 SHALL 按 `commissionRate`（預設 0.1425%）計算手續費並從資金中扣除

#### Scenario: 賣出扣除手續費與證交稅
- **WHEN** 模擬賣出交易
- **THEN** 系統 SHALL 按 `commissionRate`（預設 0.1425%）計算手續費，加上 `taxRate`（預設 0.3%）計算證交稅，並從賣出所得中扣除

### Requirement: 固定金額部位管理
系統 SHALL 支援固定金額的部位管理模式。

#### Scenario: 固定金額買入
- **WHEN** 進場條件觸發
- **THEN** 系統 SHALL 使用 `positionSize` 金額計算可買入的股數（以 1000 股為單位向下取整），超出的金額不使用

#### Scenario: 資金不足時不買入
- **WHEN** 進場條件觸發但剩餘資金不足 `positionSize`
- **THEN** 系統 SHALL 跳過此次買入，不執行交易

### Requirement: 回測績效報告
系統 SHALL 在回測完成後產出完整的績效報告。

#### Scenario: 產出績效摘要
- **WHEN** 回測完成
- **THEN** 系統 SHALL 計算並顯示：初始資金、最終資金、總報酬率、年化報酬率、交易次數、勝率、最大回撤（MDD）、Sharpe Ratio

#### Scenario: 產出交易明細
- **WHEN** 回測完成
- **THEN** 系統 SHALL 列出所有交易記錄，包含買入日期、買入價格、賣出日期、賣出價格、報酬率、持有天數

### Requirement: 單股回測
系統 SHALL 支援對單一股票執行策略回測。

#### Scenario: 指定單一股票回測
- **WHEN** 使用者執行 `backtest --stock 2330 --strategy golden-cross.json`
- **THEN** 系統 SHALL 對 2330（台積電）執行指定策略的回測並顯示結果

### Requirement: 全市場回測掃描
系統 SHALL 支援對所有上市股票執行策略回測，找出績效最佳的標的。

#### Scenario: 全市場回測並排名
- **WHEN** 使用者執行 `backtest --all --strategy golden-cross.json --top 20`
- **THEN** 系統 SHALL 對所有上市股票執行回測，按總報酬率排序，顯示前 20 名的績效摘要
