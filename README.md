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
- [內建策略指南與範例](#內建策略指南與範例)
- [網頁版操作指南與系統架構](#twse-analyzer---網頁版操作指南與系統架構)
  - [1. 啟動網頁版](#1-啟動網頁版)
  - [2. 介面模組功能說明](#2-介面模組功能說明)
  - [3. 每日排程盤前分析機制](#3-每日排程盤前分析機制)
  - [4. 全市場訊號追蹤與走勢迴歸驗證 (T+1 ~ T+5)](#4-全市場訊號追蹤與走勢迴歸驗證-t1--t5)
  - [5. 閉環自適應學習演算法 (Adaptive Learning)](#5-閉環自適應學習演算法-adaptive-learning)
  - [6. 後端 RESTful API 規格](#6-後端-restful-api-規格)
  - [7. 機器學習 (ML) 特徵擴充介面](#7-機器學習-ml-特徵擴充介面)

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


# TWSE Analyzer - 網頁版操作指南與系統架構

TWSE Analyzer 網頁版採用現代化前後端分離架構（**ASP.NET Core 10 Web API + SQLite + React 18 + Vite + Tailwind CSS + Lucide Icons**），具備高性能全市場即時運算、背景自動排程、真實行情迴歸驗證與閉環自適應權重調節機制。

## 1. 啟動網頁版

### 開發模式（前後端分離，支援 Hot Reload）：

```bash
# Terminal 1: 啟動後端 Web API（預設監聽 http://localhost:5000）
dotnet run --project src/TWSE.Web

# Terminal 2: 啟動前端 Vite Dev Server
cd src/TWSE.Web/ClientApp && npm run dev
```

### 生產模式（單一服務整合）：

```bash
# 1. 編譯前端靜態資源至 wwwroot
cd src/TWSE.Web/ClientApp && npm run build

# 2. 啟動後端服務，直接託管靜態頁面與 RESTful API
cd ../../..
dotnet run --project src/TWSE.Web
# 開啟瀏覽器訪問 http://localhost:5000 即可使用
```

---

## 2. 介面模組功能說明

系統提供四大核心導覽分頁：

### 2.1 個股追蹤與持股監控 (Stock Tracking & Portfolio)
- **個股搜尋與狀態切換**：可快速搜尋全上市櫃代碼，劃分為「未追蹤」、「追蹤中（關注）」、「持股中（投資組合）」。
- **持股診斷**：針對投資組合中的個股，輸入持股均價與張數，系統自動計算未實現損益、持股現況與技術面警示。

### 2.2 策略即時選股 (Strategy Scanner)
- **多策略條件選股**：支援單一或複合策略（JSON 格式），可設定交集條件（AND）或單策略篩選全市場。
- **技術面指標快照**：即時輸出最新收盤價、漲跌幅、成交量、均線排列狀態、RSI、MACD 等數值。

### 2.3 每日排程盤前分析 (Scheduled Daily Analysis)
- **持股操作診斷**：每天盤前針對庫存部位進行出場/停損/加碼判定。
- **未持有精選 Top 20 推薦買進**：依策略契合度、市場成交流動性與實戰自適應權重挑選。
- **未持有警戒 Top 20 推薦賣出/避開**：偵測高檔死亡交叉、破線轉弱或超買回檔標的。

### 2.4 迴歸驗證與自適應學習儀表板 (Regression Verification & Adaptive Learning)
- **實戰績效看板**：直觀呈現歷史訊號累計驗證筆數、T+1 隔日勝率、T+3 短波段勝率、平均持倉報酬。
- **策略動態權重表**：各策略實戰勝率、盈虧比（Profit Factor）、自適應權重乘數（`0.2x ~ 2.5x`）與狀態標籤（`自動加權` / `標準權重` / `降權保護` / `策略休眠`）。
- **逐筆走勢回溯明細**：記錄當初推薦日、代號、策略、推薦價、隔日實際收盤、T+1 報酬、T+3 報酬、勝負判定標籤（獲利命中 / 預測失準），並提供「看線圖」互動跳轉按鈕。

---

## 3. 每日排程盤前分析機制

系統整合背景排程器（`DailyUpdateService`），於**每日晚間 8:00 (20:00)** 自動觸發全流程分析：
1. **增量行情同步**：檢查最新交易日日線並自動補齊。
2. **全市場歷史訊號迴歸比對**：核對先前所有未結算訊號的次日/T+3/T+5 真實開盤與收盤價。
3. **策略權重更新**：根據近期 60 天實戰勝率重新計算各策略的權重乘數。
4. **全市場平行運算掃描**：使用單次 SQL 批次載入快照並透過 `Parallel.ForEach` 多核心運算，完成持股診斷與全市場買賣 Top 20 推薦。

---

## 4. 全市場訊號追蹤與走勢迴歸驗證 (T+1 ~ T+5)

為徹底打破「只給推薦卻不驗證對錯」的黑盒子，系統建立了完整的訊號追蹤與結算機制：
- **訊號入庫**：每日分析產生的全市場訊號會持久化儲存於 `signal_tracking` 資料表，初始狀態為 `Pending`。
- **次日開盤與收盤結算 (T+1)**：
  - 多頭訊號報酬率：`Return1D = (Close_T+1 - EntryPrice) / EntryPrice`
  - 空頭/避險訊號報酬率：`Return1D = (EntryPrice - Close_T+1) / EntryPrice`（標的下跌即視為避險/放空成功）
  - 勝負判定：`Return1D > 0` 標記為獲利命中（`is_win = 1`），反之為預測失準（`is_win = 0`）。
- **短波段與最大潛在盈虧 (T+3 / T+5)**：
  - 持續追蹤 T+3 與 T+5 收盤報酬。
  - 同步計算 5 日內最大浮盈（MFE, Maximum Favorable Excursion）與最大回撤（MAE, Maximum Adverse Excursion），結算完成後狀態更新為 `Verified`。

---

## 5. 閉環自適應學習與多策略組合適配機制 (Adaptive Learning & Strategy Ensemble)

系統摒棄「一套萬用策略打天下」的迷思，採用**噪聲隔離純化**與**個股/族群專屬適配組合**雙軌架構：

### 5.1 低流動性與極端噪聲隔離保護 (Noise Isolation & Data Purification)
- **問題癥結**：台股許多冷門股（每日成交量 < 100 張）或全額交割股極易出現技術指標「假突破」，若盲目將其納入回測與實戰統計，會產生嚴重聚合偏誤（Aggregation Bias），拖垮優質策略在主力權值股上的評分。
- **隔離機制**：
  - 當訊號產生時，系統自動計算個股 20 日均量（`Volume20dAvg`）。
  - 若 20 日均量 < 300 張或單日跳空一字鎖死，自動標記為 `IsNoise = 1`，並記錄原因（如 `低流動性(<300張)`）。
  - **隔離結算**：閉環學習計算勝率與自適應動態權重時，全面基於「**純化資料集 (Clean Signals)**」，保護優質策略不被殭屍股污染；同時在盤前推薦時直接過濾噪聲股。

### 5.2 多策略 × 個股/族群適配組合矩陣 (Stock-Strategy Affinity Matrix)
- **個股專屬適配 (Stock-Level Affinity)**：
  - 統計各策略在特定個股（如台積電 2330、富邦金 2881）上的歷史驗證表現，評估勝率、盈虧比與適配分數。
  - 分級為：
    - `Optimal` (🚀 黃金適配組合，勝率 ≥ 65% 且盈虧比 ≥ 1.2)：給予 1.5x 加成優先推薦。
    - `Good` (✨ 良好適配，勝率 ≥ 50%)：給予 1.2x 標準加成。
    - `Mismatched` (⚠️ 嚴重不符，勝率 < 35%)：標記為互斥反指標，加權大幅降至 0.2x 甚至排除，避免硬套不合適的策略。
- **策略專屬高勝率股票池 (Dedicated Eligible Universe)**：
  - 每個策略不再全市場大海撈針，而是專門操作歷史驗證適合該策略的股票池。
- **產業族群適配分佈 (Industry-Level Affinity)**：
  - 依半導體、電腦週邊、電子零組件、航運、金融等產業族群聚合統計，辨識動能突破策略適合哪些族群、均值回歸策略適合哪些防禦類股。

### 5.3 純化動態權重調整公式
基準權重為 `1.0`，依純化實戰指標動態調整並限制在 `[0.2, 2.5]` 區間：
```
勝率權重加成 = (CleanWinRate - 0.50) * 2.5
盈虧比加成   = (ProfitFactor - 1.0) * 0.3
AdaptiveWeight = Clamp(1.0 + 勝率權重加成 + 盈虧比加成, 0.2, 2.5)
```

### 5.4 策略狀態機
| 狀態 | 判定條件 | 系統行為 |
| :--- | :--- | :--- |
| **ScaledUp (自動加權)** | 純化勝率 ≥ 60% 且 盈虧比 ≥ 1.3 | 權重上調（最高 2.5x），擴大推薦優先權 |
| **Active (標準運行)** | 40% ≤ 純化勝率 < 60% | 維持基準權重（0.8x ~ 1.2x）正常運作 |
| **Demoted (降權保護)** | 純化勝率 < 40% 或 盈虧比 < 0.8 | 權重調降（最低 0.2x），減少該策略推薦排名 |
| **Hibernating (休眠保護)** | 純化勝率 < 30%（連續嚴重失準） | 降低至底限，系統發出警示並暫停主力推薦 |

---

## 6. 後端 RESTful API 規格

| 方法 | 路徑 | 說明 |
| :--- | :--- | :--- |
| `GET` | `/api/stocks` | 取得全市場股票清單與追蹤狀態 |
| `GET` | `/api/stocks/{code}/prices` | 取得指定個股近期的 K 線歷史資料 |
| `GET` | `/api/portfolio` | 取得使用者持股投資組合 |
| `POST` | `/api/portfolio` | 更新或新增持股資訊 |
| `GET` | `/api/dailyreport` | 取得最新的盤前分析與推薦結果 |
| `POST` | `/api/jobs/run-analysis?date=yyyy-MM-dd` | 手動立即觸發每日分析（可選傳入歷史指定單日） |
| `GET` | `/api/verification/summary?days=60` | 取得近期 60 天迴歸驗證總體 KPI、純化勝率與最適矩陣 |
| `GET` | `/api/verification/history?limit=100` | 取得歷史訊號逐筆真實走勢結算明細清單 |
| `POST` | `/api/verification/run?date=yyyy-MM-dd` | 手動立即執行訊號結算比對與權重重算（可選傳入歷史指定單日） |
| `POST` | `/api/simulation/start` | 啟動歷史滾動回放模擬背景任務（可自訂 `startDate`, `endDate`, `min20dVolume`） |
| `GET` | `/api/simulation/status` | 輪詢歷史回放即時進度百分比、目前處理交易日與已結算訊號 |
| `GET` | `/api/simulation/summary` | 取得歷史回放總體摘要（含歷年逐季勝率走勢、策略戰報與天菜個股池） |
| `POST` | `/api/simulation/cancel` | 手動終止進行中的歷史回放模擬任務 |

---

## 7. 歷史滾動回放引擎（Walk-Forward Historical Replay）

為徹底檢驗策略在跨越多年牛熊循環時的真實實戰能力，系統提供專屬的「歷史時間序列滾動前向回放器」：
- **零未來偏差（Zero Look-ahead Bias）**：回放至歷史第 $T$ 日時，技術指標與選股條件僅切片取用 $0 \dots T$ 的歷史序列。
- **逐日前向結算（Forward Verification）**：產生訊號後，利用 $T+1 \dots T+5$ 的真實行情進行盈虧與勝負結算。
- **高效記憶體滑動視窗**：一次性將歷史日線批次快取至記憶體，透過 C# `Parallel.ForEach` 多核心運算，**全台股 2,000 檔標的 × 6 年（2020~2026）歷史逐日回放僅需 3~5 秒即可完成**。
- **歷年逐季勝率走勢圖**：前端以 ECharts 繪製雙軸走勢，可對比「純化實戰勝率」vs「含噪原始勝率」及「平均 5 日波段報酬率」，清晰看見 2020 疫情崩盤、2021 航運狂潮、2022 空頭升息大修正、2023~2026 AI 大行情的真實勝率演進！

---

## 8. 新手友善介面設計（Beginner Friendly UI/UX）

針對股市新手，介面導入多項直覺化設計：
1. **新手快速導引卡（Beginner Guide Banner）**：以淺白易懂的圖文，白話解讀「每日盤前精選」、「為什麼要隔離冷門噪聲」與「如何替股票配對專屬天菜策略」。
2. **快速回測期間預設鍵**：提供「🚀 2020 至今（推薦）」、「📈 近 3 年 AI 多頭」、「🌧️ 2022 空頭考驗」等一鍵帶入，不需手動慢慢挑日期。
3. **直觀評級標籤**：
   - `⭐ 黃金天菜` / `Optimal`：歷史勝率 $\ge 65\%$ 的專屬高勝率標的。
   - `⚠️ 偏弱/逆風` / `Mismatched`：不適合該策略操作的標的。
   - `🚫 冷門噪聲` / `Noise`：成交量不足 300 張已被隔離保護的假突破標的。

---

## 9. 機器學習 (ML) 特徵擴充介面

`signal_tracking` 資料表內建 `features_json` 欄位。每次產生訊號時，系統可即時保留當日的特徵向量快照：
- 技術指標向量：`SMA(5/10/20/60)`、`RSI(14)`、`MACD(12,26,9)`、`KD(9,3)`、`ATR`、乖離率（Bias）。
- 量能與籌碼指標：成交量增幅比率、外資連買天數、投信持股比例。
- **未來拓展**：可直接將歷史資料匯出為 CSV 或 Parquet，使用 Python（LightGBM / XGBoost / CatBoost）或 .NET ML.NET 進行二元分類或排序模型訓練，將機器學習預測機率直接注入作為選股的第二層評分濾網。


