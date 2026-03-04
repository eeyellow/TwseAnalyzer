## ADDED Requirements

### Requirement: 計算移動平均線
系統 SHALL 支援計算 SMA（簡單移動平均線）和 EMA（指數移動平均線），支援自定義週期參數。

#### Scenario: 計算 SMA
- **WHEN** 使用者指定計算 SMA 且週期為 20
- **THEN** 系統 SHALL 根據收盤價序列計算 20 日簡單移動平均線，回傳每日的 SMA 值

#### Scenario: 計算 EMA
- **WHEN** 使用者指定計算 EMA 且週期為 12
- **THEN** 系統 SHALL 根據收盤價序列計算 12 日指數移動平均線，回傳每日的 EMA 值

#### Scenario: 資料不足時回傳 null
- **WHEN** 歷史資料筆數少於指定週期
- **THEN** 前面不足週期的資料點 SHALL 回傳 null（無法計算）

### Requirement: 計算 KD 隨機指標
系統 SHALL 支援計算 KD 隨機指標（Stochastic Oscillator），預設參數 K=9, D=3, Smooth=3。

#### Scenario: 計算 KD 值
- **WHEN** 使用者指定計算 KD 指標
- **THEN** 系統 SHALL 回傳每日的 K 值和 D 值

#### Scenario: KD 黃金交叉偵測
- **WHEN** K 值從下方向上穿越 D 值
- **THEN** 系統 SHALL 能識別此為 KD 黃金交叉訊號

### Requirement: 計算 RSI 相對強弱指標
系統 SHALL 支援計算 RSI（Relative Strength Index），預設週期為 14。

#### Scenario: 計算 RSI 值
- **WHEN** 使用者指定計算 RSI 且週期為 14
- **THEN** 系統 SHALL 回傳每日的 RSI 值（0-100 範圍）

#### Scenario: 偵測超買超賣
- **WHEN** RSI > 70 或 RSI < 30
- **THEN** 系統 SHALL 能識別超買（>70）與超賣（<30）狀態

### Requirement: 計算 MACD 指標
系統 SHALL 支援計算 MACD（Moving Average Convergence Divergence），預設參數 Fast=12, Slow=26, Signal=9。

#### Scenario: 計算 MACD 值
- **WHEN** 使用者指定計算 MACD
- **THEN** 系統 SHALL 回傳每日的 DIF 線、MACD 信號線、以及柱狀圖（Histogram）值

### Requirement: 計算布林通道
系統 SHALL 支援計算 Bollinger Bands，預設參數 Period=20, StdDev=2。

#### Scenario: 計算布林通道三線
- **WHEN** 使用者指定計算 Bollinger Bands
- **THEN** 系統 SHALL 回傳每日的上軌、中軌（SMA）、下軌值

### Requirement: 計算成交量移動平均
系統 SHALL 支援計算成交量的移動平均線，用於判斷量能變化。

#### Scenario: 計算成交量 SMA
- **WHEN** 使用者指定計算成交量 SMA 且週期為 20
- **THEN** 系統 SHALL 根據成交量序列計算 20 日均量值
