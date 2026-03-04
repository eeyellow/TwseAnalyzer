# Specification: Yahoo Finance Data Integration Fix

## Requirements

1. The `YahooFetcher.FetchHistoricalDataAsync(string stockCode, DateTime? startDate = null, DateTime? endDate = null)` function must fetch historical K-lines correctly using `YahooQuotesApi`.
2. The method must translate from the fetched `ITick` list (or similar models provided by `YahooQuotesApi`) back into the `TWSE.Core.Models.OHLCV` business entity.
3. The method must filter data strictly according to `startDate` and `endDate` boundaries (inclusive) if they are provided, as `YahooQuotesApi` sometimes returns more history than asked for or has a different filter signature.
4. Any failure to fetch a stock from Yahoo must throw or log an error and **not hide the exception implicitly**, unless it's explicitly a 404 (Stock not found), which should gracefully return an empty list without a crash.
5. The `SemaphoreSlim` limit should remain (rate limiting) to prevent overwhelming Yahoo's API, causing sudden HTTP 429 back-offs.

## Acceptance Criteria

- [ ] Project compiles successfully without referencing `YahooFinanceApi`.
- [ ] Integration tests verify extracting full daily price history using `YahooQuotesApi` for a known solid ticker (e.g., `"2330.TW"`).
- [ ] The CLI `dotnet run -- init --years 1` populates the SQLite database's `daily_prices` table without printing unhandled exceptions silently swallowed in `FetchHistoricalDataAsync`.

