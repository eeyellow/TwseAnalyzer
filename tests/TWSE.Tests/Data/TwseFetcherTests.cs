using System.Net;
using Moq;
using Moq.Protected;
using TWSE.Core.Data;
using Xunit;

namespace TWSE.Tests.Data;

public class TwseFetcherTests
{
    private readonly Xunit.Abstractions.ITestOutputHelper _output;

    public TwseFetcherTests(Xunit.Abstractions.ITestOutputHelper output)
    {
        _output = output;
    }
    [Fact]
    public async Task FetchListedStocksAsync_ShouldParseHtmlCorrectly()
    {
        // Require Big5 encoding registration which is done inside the fetcher, 
        // but since we are mocking the HttpMessageHandler, we just need to provide bytes that represent Big5.
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        
        var htmlResponse = @$"
            <html><body><table>
                <tr></tr>
                <tr>
                    <td>股票</td>
                </tr>
                <tr>
                    <td>2330{'\u3000'}台積電</td>
                    <td>TW0002330008</td>
                    <td>1994/09/05</td>
                    <td>上市</td>
                    <td>半導體業</td>
                    <td>ESVUFR</td>
                    <td></td>
                </tr>
            </table></body></html>";
            
        var bytes = System.Text.Encoding.GetEncoding("Big5").GetBytes(htmlResponse);

        var handlerMock = new Mock<HttpMessageHandler>(MockBehavior.Strict);
        handlerMock
           .Protected()
           .Setup<Task<HttpResponseMessage>>(
              "SendAsync",
              ItExpr.IsAny<HttpRequestMessage>(),
              ItExpr.IsAny<CancellationToken>()
           )
           .ReturnsAsync(() => new HttpResponseMessage()
           {
               StatusCode = HttpStatusCode.OK,
               Content = new ByteArrayContent(bytes),
           })
           .Verifiable();

        var httpClient = new HttpClient(handlerMock.Object);
        var fetcher = new TwseFetcher(httpClient);

        var result = await fetcher.FetchListedStocksAsync();

        // 2 calls (TwseUrl and TpexUrl) returns the same mocked content, so 2 results
        Assert.Equal(2, result.Count); 
        Assert.Equal("2330", result[0].Code);
        Assert.Equal("台積電", result[0].Name);
        Assert.Equal("半導體業", result[0].Industry);
    }

    [Fact]
    public async Task FetchListedStocksAsync_Live()
    {
        using var client = new HttpClient();
        var fetcher = new TwseFetcher(client);
        var stocks = await fetcher.FetchListedStocksAsync();
        Assert.NotEmpty(stocks);

        // Verify valid codes
        var invalid = stocks.Where(s => s.Code.Contains(' ') || s.Code.Contains('\u3000')).ToList();
        Assert.Empty(invalid);

        // Verify 2330 is included
        Assert.Contains(stocks, s => s.Code == "2330");
    }
}
