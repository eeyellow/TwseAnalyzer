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

首次啟動必備，它會建立 SQLite 資料庫，從證交所 ISIN 網頁抓取所有上市櫃「股票」及「ETF」的清單，接著往回從 Yahoo Finance 抓取指定年份的歷史 K 線資料。

```bash
# 預設會往回抓取數年的資料，可透過 --years 參數控制
dotnet run --project src/TWSE.Cli -- init --years 5
```

### 2. 更新增量行情 (update)

每日盤後執行一次，用來把最新的歷史日線補齊。此指令會掃描本地資料庫中各股票的最新一筆日期，並自動往後補齊至今日。

```bash
dotnet run --project src/TWSE.Cli -- update
```

### 3. 條件選股 (scan)

套用自定義的 JSON 策略檔，去篩選出今天（或最後一天）符合進場條件的個股。

```bash
# --strategy 參數需指定 json 設定檔的相對/絕對路徑
dotnet run --project src/TWSE.Cli -- scan --strategy strategies/oversold-bounce.json
```

### 4. 單股技術指標分析 (analyze)

針對單一個股，列出最近幾個交易日的報價與相關技術指標結果（如 SMA、RSI、MACD 等）。

```bash
# --stock 指定代碼
dotnet run --project src/TWSE.Cli -- analyze --stock "2330"
```

### 5. 策略回測 (backtest)

可針對單一或全部股票進行歷史回測，評估某一策略的「年化報酬率」、「勝率」、「最大回撤 (MDD)」與「夏普比率」。

```bash
# 針對特定股票進行回測
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --stock "2330"

# 針對全市場進行掃描回測（耗時較長）
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --all

# 全市場回測後只顯示績效最佳的前 N 筆
dotnet run --project src/TWSE.Cli -- backtest --strategy strategies/golden-cross.json --top 10
```

---

## 策略設定檔格式

專案內的 `strategies/` 資料夾中包含數個 JSON 範例檔案，可供觀察與修改：

- `golden-cross.json` 示範了如何設定黃金交叉（如 `cross_above`）與固定報酬率的停利/停損。
- `oversold-bounce.json` 示範了利用 RSI 超賣且 MACD 反轉等條件選股。

你可以完全無須改動 C# 程式碼，僅透過編寫新的 JSON 策略檔就能測試各式想法！
