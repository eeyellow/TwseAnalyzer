# Technical Design: Yahoo Finance Data Source Fix

## Architecture

The project already uses the `IYahooFetcher` interface. No changes to the interface are required since it abstracts away the concrete library.
The `YahooFetcher` implementation will be modified to use `YahooQuotesApi` instead of `YahooFinanceApi`.

## Implementation Details

1. **Dependency Update:**
    - Remove `YahooFinanceApi` package.
    - Add `YahooQuotesApi` package to the `TWSE.Core` project.

2. **Fetching Logic (`YahooFetcher.cs`):**
    - The old `Yahoo.GetHistoricalAsync` will be replaced entirely.
    - `YahooQuotesApi` requires a slightly different setup (e.g., using an injected `YahooQuotesBuilder`).
    - The builder typically automatically handles the Crumb cookies in the background. Example usage for `YahooQuotesApi`:
      ```csharp
      var yahooQuotes = new YahooQuotesBuilder().Build();
      var history = await yahooQuotes.GetHistoryAsync(symbol);
      ```
    - Since `YahooQuotesBuilder` can be reused, we may declare a private readonly instance.

3. **Date Filtering:**
    - The new library might get all history by default. If it supports start/end dates out of the box we will use them, otherwise we will manually filter the returned `ITick` list before converting it to `OHLCV`.

4. **Error Handling (`YahooFetcher.cs`):**
    - The `catch (Exception)` block must be reviewed.
    - If the fetch fails, log appropriately (using an injected `ILogger` or `Console.WriteLine` for a quick CLI fallback) instead of silently returning an empty list, so the `cli` `init` process doesn't pretend it successfully fetched 0 records.
    - For this fix, printing the error stream to `Console.Error` is acceptable, avoiding adding full `ILogger` plumbing to the entire application right now if it isn't set up. But `IDataUpdateService` shouldn't fail the whole loop on one stock failure (this is already handled by `try/catch` in the CLI caller loop).

## Alternatives Considered

- **Writing Custom HttpClient Crumb Logic**: Too brittle and hard to maintain as Yahoo constantly changes the mechanism.
- **Using other data sources (e.g., Fugle/FinMind)**: Requires rewriting major components, API Keys, and managing much stricter rate limits. `YahooQuotesApi` is an open-source wrap that is heavily maintained by community.

