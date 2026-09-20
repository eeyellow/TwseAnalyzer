using System.Text.Json.Serialization;

namespace TWSE.Core.Models;

public class ScreenerConfig
{
    [JsonPropertyName("screen")]
    public List<string> Screen { get; set; } = new();

    [JsonPropertyName("entry")]
    public List<string> Entry { get; set; } = new();

    [JsonPropertyName("sortBy")]
    public string SortBy { get; set; } = string.Empty;

    [JsonPropertyName("limit")]
    public int Limit { get; set; } = 50;
}
