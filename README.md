# TWSE Analyzer

TWSE Analyzer 是一個專為台股盤後技術分析打造的 .NET 10 命令列工具（CLI）。
目前的版本支援上市與上櫃股票資料的抓取、策略選股、回測以及單點個股的技術指標分析。

## 目錄
- [環境需求](#環境需求)
- [安裝與建置](#安裝與建置)
- [指令指南](#指令指南)
  - [初始化資料庫與歷史行情 (init)](#1-初始化資料庫與歷史行情-init)
  - [更新增量行情 (update)](#2-更新增量行情-update)
  - [條件選股 (scan)](#3-條件選股-scan)
  - [單股技術指標分析 (analyze)](#4-單股技術指標分析-analyze)
  - [策略回測 (backtest)](#5-策略回測-backtest)
- [策略設定檔格式](#策略設定檔格式)

---

## 環境需求

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)

*(註：本專案採用最新的 C# 功能，請確保電腦已安裝 .NET 10 的 SDK Preview 版本)*

---

## 安裝與建置

1. 進入本專案根目錄後，執行建置指令：
   ```bash
   dotnet build
   ```
2. （選用）將 CLI 工具暫存或安裝至本地端即可獨立呼叫，或直接以 `dotnet run` 方式執行：
   ```bash
   dotnet run --project src/TWSE.Cli -- [指令] [參數]
   ```

---

## 指令指南

所有功能均從 `TWSE.Cli` 這個專案作為入口。以下示範皆假設你在專案根目錄（`TWSE/`）下呼叫指令。

### 1. 初始化資料庫與歷史行情 (init)

首次啟動必備，它會建立 SQLite 資料庫，從證交所 ISIN 網頁抓取所有上市櫃「股票」及「ETF」的清單，接著往回從 Yahoo Finance 抓取所有的歷史 K 線資料。

```bash
# 預設會往回抓取所有的歷史資料
dotnet run --project src/TWSE.Cli -- init
```

### 2. 更新增量行情 (update)

每日盤後執行一次，用來把最新的歷史日線補齊。此指令會掃描本地資料庫中各股票的最新一筆日期，並自動往後補齊至今日。

```bash
dotnet run --project src/TWSE.Cli -- update
```

### `scan` (條件選股)
根據你自訂的策略設定檔（JSON），掃描市場上符合條件的股票：

```bash
# 使用單一策略
dotnet run --project src/TWSE.Cli -- scan --strategy strategies/golden-cross.json

# 同時套用多個策略 (自動取 AND 交集)
dotnet run --project src/TWSE.Cli -- scan --strategy strategies/golden-cross.json strategies/oversold-bounce.json
```

### 4. 單股技術指標分析 (analyze)

針對單一個股，列出最近幾個交易日的報價與相關技術指標結果（如 SMA、RSI、MACD 等）。

```bash
# --stock 指定代碼
dotnet run --project src/TWSE.Cli -- analyze --stock "2330"
```

### 5. 策略回測 (backtest)

將 JSON 策略套用在指定個股或全市場上，輸出回測成效：

```bash
# 對單一個股回測單一策略
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --stock "2330"

# 對單一個股同時套用多個策略 (自動交集買賣點)
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json strategies/best-four-point.json --stock "2330"

# 全市場掃描回測（預設列出前 20 名）：
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --all

# 全市場回測後只顯示績效最佳的前 N 筆
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --top 10
```

---

## 內建策略指南與範例

專案內的 `strategies/` 資料夾中包含數個 JSON 範例檔案，除了作為範例外，也實際對應了常見的技術分析邏輯。<br>
因為目前的條件評估器為 **AND（交集）** 邏輯，下列策略會將核心的買賣點轉化為嚴格的進出場濾網：

### 1. best-four-point.json (四大買賣點)
參考自傳統的「四大買賣點」邏輯，專注於極短線的均線與收盤 K 棒型態：
- **四大買點 (Entry)**：
  - `SMA(3) cross_above SMA(6)`：三日均線由下往上突破六日均線。
  - `Close greater_than Open`：當日收紅K（收盤價大於開盤價）。
- **四大賣點 (Exit)**：
  - `SMA(3) cross_below SMA(6)`：三日均線由上往下跌破六日均線。
  - `Close less_than Open`：當日收黑K（收盤價小於開盤價）。

### 2. golden-cross.json (黃金交叉)
經典的雙均線波段策略，適合抓取中長線趨勢：
- **進場 (Entry)**：`SMA(20) cross_above SMA(60)`（月線向上突破季線）。
- **出場 (Exit)**：`SMA(20) cross_below SMA(60)`（月線向下跌破季線）。

### 3. oversold-bounce.json (超賣反彈)
利用 RSI 尋找跌深反彈的標的：
- **進場 (Entry)**：`RSI(14) less_than 30`（RSI進入超賣區，可再搭配均線過濾）。

### 4. kd-reversal.json (KD 乖離與黃金交叉)
捕捉短線過度殺跌後的黃金交叉反彈，與過熱時的死亡交叉：
- **進場 (Entry)**：`K(9) less_than 20`、`D(9) less_than 20` 且 `K(9) cross_above D(9)` (低檔黃金交叉)。
- **出場 (Exit)**：`K(9) greater_than 80` 且 `K(9) cross_below D(9)` (高檔死亡交叉)。

### 5. weekly-trend-mock.json (模擬週線多頭爆發力)
將日線參數放大（45日 KD、25/50日均線）來模擬週線尋找長線爆發力：
- **進場 (Entry)**：`K(45) greater_than D(45)` 且 `D(45) greater_than 30` 且 `SMA(25) cross_above SMA(50)` 且 `Close greater_than SMA(25)`。
- **出場 (Exit)**：`K(45) cross_below D(45)` 或跌破月線 `Close less_than SMA(25)`。

### 6. ma-turnaround.json (均價轉折買賣)
利用 3日均線轉折（由下往上）並由 18日均線看大方向，附加前三日的成交量與K棒收紅濾網，捕捉主力作高意願：
- **進場 (Entry)**：
  - `SMA(3) greater_than SMA(3)[1]` (3日均線上彎)
  - `SMA(18) greater_than SMA(18)[1]` (18日均線看方向)
  - `Volume greater_than Volume[1]`、`Volume[2]`、`Volume[3]` (量大於前三天)
  - `Close greater_than Open` (K線收紅)
- **出場 (Exit)**：`SMA(3) less_than SMA(3)[1]` (3日均線只要一下彎即出)

> **💡 進階語法：歷史回顧 `[N]`**
> 在所有的指標或報價（如 `Close`、`Volume`、`SMA(3)` 等）後方，都可以加上 `[N]` 來代表「N 個週期（日）之前的數值」。
> 例如 `SMA(3)[1]` 就是昨天的 3日均線，這使得我們能夠非常輕易地用 `greater_than` 與 `less_than` 來判斷均線的**上彎**與**下彎**極度變化！

你可以完全無須改動 C# 程式碼，僅透過編寫新的 JSON 策略檔就能測試各式想法！


# TWSE Analyzer - 網頁版操作指南

本指南將引導您如何使用 TWSE Analyzer 的網頁版進行個股追蹤與策略選股。

## 1. 啟動網頁版

### 開發模式（前後端分離）：

```bash
# Terminal 1: 後端 API
dotnet run --project src/TWSE.Web
# Terminal 2: 前端 dev server (有 hot reload)
cd src/TWSE.Web/ClientApp && npm run dev
```

### 生產模式（前端 build 後由後端 serve）：

在專案根目錄下執行以下指令：

```bash
cd src/TWSE.Web/ClientApp && npm run build
dotnet run --project src/TWSE.Web
# 打開 http://localhost:5000 即可使用
```

## 2. 介面功能說明

網頁介面主要分為兩個區域：**個股追蹤 (Stock Tracking)** 與 **策略選股 (Strategy Scanner)**。

### 2.1 個股追蹤 (Stock Tracking)

此區域用於管理您感興趣的股票清單。

- **新增股票**：
  1. 在搜尋框輸入股票代碼或名稱。
  2. 點擊「+」按鈕新增。
  3. 股票會被加入追蹤清單。

- **切換狀態**：
  - **未追蹤 (Untracked)**：尚未加入清單的股票。
  - **追蹤中 (Tracked)**：已加入清單，但未納入投資組合。
  - **持股中 (In Stock)**：已納入投資組合。

- **管理股票**：
  - 點擊股票旁的「+」按鈕可將「追蹤中」的股票加入投資組合。
  - 點擊股票旁的「-」按鈕可將股票移出追蹤清單（若為持股中則會先移出投資組合）。

### 2.2 策略選股 (Strategy Scanner)

此區域用於執行策略選股並查看結果。

- **選擇策略**：
  1. 點擊「選擇策略」下拉選單。
  2. 選擇您想執行的策略（例如：`best-four-point.json`）。

- **執行選股**：
  1. 點擊「執行選股」按鈕。
  2. 系統將會根據所選策略，從**所有股票**中篩選出符合條件的股票。

- **查看結果**：
  - 結果會顯示符合條件的股票清單。
  - 每支股票會顯示關鍵技術指標（如收盤價、成交量、MA20、RSI(14)）。
  - 您可以點擊「+」或「-」按鈕，直接將結果中的股票加入追蹤清單或投資組合。

## 3. 快速上手範例

以下示範如何使用「四大買賣點」策略選出潛在買股：

1. 啟動網頁版：
   ```bash
   dotnet run --project src/TWSE.Web
   ```

2. 在「策略選股」區域，選擇策略為 `best-four-point.json`。

3. 點擊「執行選股」。

4. 查看結果，找到符合條件的股票。

5. 點擊符合條件股票旁的「+」按鈕，將其加入追蹤清單。

6. 切換到「個股追蹤」區域，確認股票已成功加入。

## 4. 備註

- 網頁版目前僅提供前端功能，所有資料處理皆在瀏覽器端完成。
- 策略選股的結果會根據您瀏覽器本地儲存的資料進行篩選。
- 若要使用完整的後端功能（如歷史資料查詢、回測等），請使用 CLI 版本。
