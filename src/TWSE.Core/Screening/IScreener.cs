using TWSE.Core.Models;

namespace TWSE.Core.Screening;

public interface IScreener
{
    Task<List<StockInfo>> ScanAsync(ScreenerConfig config);
}
