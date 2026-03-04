# Proposal: Fix Yahoo Finance Data Source

## Motivation

The `YahooFinanceApi` NuGet package currently in use is failing to fetch historical daily price data due to Yahoo Finance's recent changes to their Cookie and Crumb validation mechanism, resulting in a `401 Unauthorized` HTTP error. This is a critical blocker as historical data is required for calculating technical indicators and running strategy backtests.

## Proposed Changes

- Replace the `YahooFinanceApi` NuGet package with `YahooQuotesApi` in the `TWSE.Core` project.
- Refactor the `YahooFetcher` class to use the new API to download historical data.
- Update `YahooFetcher` error handling to correctly log or propagate exceptions instead of returning an empty list silently.
- Fix/add unit and integration tests to ensure data is fetched successfully using the new library.

## Impact

- **Affected Components**: `TWSE.Core.Data.YahooFetcher`, unit and integration tests in `TWSE.Tests`.
- **Dependencies**: Changing NuGet package from `YahooFinanceApi` to `YahooQuotesApi`.
- **User Experience**: Users will be able to successfully download historical stock data using the `init` and `update` commands without silent failures.

