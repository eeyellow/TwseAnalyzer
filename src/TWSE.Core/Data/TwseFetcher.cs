using System.Text;
using HtmlAgilityPack;
using TWSE.Core.Models;

namespace TWSE.Core.Data;

public class TwseFetcher : ITwseFetcher
{
    private readonly HttpClient _httpClient;
    private const string TwseUrl = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=2";
    private const string TpexUrl = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=4";

    public TwseFetcher(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<List<StockInfo>> FetchListedStocksAsync()
    {
        var twseStocks = await FetchFromUrlAsync(TwseUrl);
        var tpexStocks = await FetchFromUrlAsync(TpexUrl);

        return twseStocks.Concat(tpexStocks).ToList();
    }

    private async Task<List<StockInfo>> FetchFromUrlAsync(string url)
    {
        var results = new List<StockInfo>();
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();

        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        var html = Encoding.GetEncoding("Big5").GetString(bytes);

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var trs = doc.DocumentNode.SelectNodes("//tr");
        if (trs == null) return results;

        string currentType = string.Empty;

        foreach (var tr in trs.Skip(1))
        {
            var tds = tr.SelectNodes("td");
            if (tds == null) continue;

            if (tds.Count == 1)
            {
                currentType = tds[0].InnerText.Trim();
            }
            else if (tds.Count >= 6)
            {
                if (currentType != "股票" && currentType != "ETF")
                    continue;

                var codeAndName = tds[0].InnerText.Trim();
                var parts = codeAndName.Split('\u3000', 2, StringSplitOptions.RemoveEmptyEntries);
                
                if (parts.Length == 2)
                {
                    results.Add(new StockInfo
                    {
                        Code = parts[0].Trim(),
                        Name = parts[1].Trim(),
                        Industry = tds[4].InnerText.Trim()
                    });
                }
            }
        }
        
        return results;
    }
}
