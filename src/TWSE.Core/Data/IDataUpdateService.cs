using TWSE.Core.Models;

namespace TWSE.Core.Data;

public interface IDataUpdateService
{
    Task UpdateHistoricalDataAsync(string stockCode);
    Task UpdateAllHistoricalDataAsync(IEnumerable<string> stockCodes);
}
