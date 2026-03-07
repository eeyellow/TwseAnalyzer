using System.Text.Json;

namespace TWSE.Web.Services;

public class TrackingService
{
    private readonly string _filePath;
    private HashSet<string> _trackedCodes = new();

    public TrackingService()
    {
        _filePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "tracking.json");
        _filePath = Path.GetFullPath(_filePath);
        Load();
    }

    public List<string> GetAll() => _trackedCodes.ToList();

    public bool IsTracked(string stockCode) => _trackedCodes.Contains(stockCode);

    public void Add(string stockCode)
    {
        if (_trackedCodes.Add(stockCode))
            Save();
    }

    public void Remove(string stockCode)
    {
        if (_trackedCodes.Remove(stockCode))
            Save();
    }

    private void Load()
    {
        if (File.Exists(_filePath))
        {
            var json = File.ReadAllText(_filePath);
            var list = JsonSerializer.Deserialize<List<string>>(json) ?? new();
            _trackedCodes = new HashSet<string>(list);
        }
    }

    private void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);
        var json = JsonSerializer.Serialize(_trackedCodes.ToList(), new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_filePath, json);
    }
}
