using System.Text.Json;

namespace TWSE.Web.Services;

public class PortfolioItem
{
    public string StockCode { get; set; } = string.Empty;
    public string StockName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public string? SelectedStrategy { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.Now;
}

public class PortfolioService
{
    private readonly string _filePath;
    private List<PortfolioItem> _items = new();

    public PortfolioService()
    {
        _filePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "portfolio.json");
        _filePath = Path.GetFullPath(_filePath);
        Load();
    }

    public List<PortfolioItem> GetAll() => _items;

    public PortfolioItem? Get(string stockCode) =>
        _items.FirstOrDefault(i => i.StockCode == stockCode);

    public void AddOrUpdate(PortfolioItem item)
    {
        var existing = _items.FindIndex(i => i.StockCode == item.StockCode);
        if (existing >= 0)
            _items[existing] = item;
        else
            _items.Add(item);
        Save();
    }

    public bool Remove(string stockCode)
    {
        var removed = _items.RemoveAll(i => i.StockCode == stockCode) > 0;
        if (removed) Save();
        return removed;
    }

    private void Load()
    {
        if (File.Exists(_filePath))
        {
            var json = File.ReadAllText(_filePath);
            _items = JsonSerializer.Deserialize<List<PortfolioItem>>(json) ?? new();
        }
    }

    private void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);
        var json = JsonSerializer.Serialize(_items, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_filePath, json);
    }
}
