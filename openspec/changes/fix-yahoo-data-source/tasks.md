# Implementation Tasks: Yahoo Finance Data Integration Fix

## 1. Dependency Update
- [x] 1.1 `dotnet remove src/TWSE.Core/TWSE.Core.csproj package YahooFinanceApi`
- [x] 1.2 `dotnet add src/TWSE.Core/TWSE.Core.csproj package YahooQuotesApi`

## 2. Refactor YahooFetcher
- [x] 2.1 Update `YahooFetcher.cs` to import `YahooQuotesApi` namespaces.
- [x] 2.2 Create a singleton instance or local instance of `YahooQuotesBuilder` within `YahooFetcher`.
- [x] 2.3 Refactor `FetchHistoricalDataAsync` to use the new API (`GetHistoryAsync`).
- [x] 2.4 If necessary, apply manual `Where` filtering using `.Date` to honor `startDate` and `endDate` parameters out of the returned history from the API.
- [x] 2.5 Ensure the returned `ITick` objects map carefully onto the `TWSE.Core.Models.OHLCV`.
- [x] 2.6 Refactor error handling: catch `Exception` but log them out to stderr or throw, removing the silent `return new List<OHLCV>()` logic (except for explicit 404 stock not found scenarios, if available).

## 3. Verify and Test
- [x] 3.1 Refactor the `YahooFetcherIntegrationTests` to test `YahooQuotesApi` fetching logic without the `YahooFinanceApi` legacy code breaking the build.
- [x] 3.2 Add a new edge-case unit test for fetching an invalid stock code (like `"INVALID.TW"`) to verify how the application responds and whether we catch it gracefully inside the Fetcher.
- [x] 3.3 Ensure the `dotnet test` suite runs entirely green.
- [x] 3.4 Ensure the CLI `dotnet run --project src/TWSE.Cli/TWSE.Cli.csproj -- init` fetches and seeds database records correctly.

