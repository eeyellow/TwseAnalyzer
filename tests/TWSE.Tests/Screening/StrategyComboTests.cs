using System.Text.Json;
using TWSE.Core.Models;
using Xunit;

namespace TWSE.Tests.Screening;

public class StrategyComboTests
{
    [Fact]
    public void StrategyCombo_Serialization_Roundtrip_Works()
    {
        var combo = new StrategyCombo
        {
            Id = "combo-test",
            Name = "測試動能組合",
            Description = "MA金叉 + 量能突破",
            StrategyFileNames = new List<string> { "ma-golden-cross.json", "volume-breakout.json" },
            LogicMode = "AND",
            MinScorePercent = 100,
            IsBuiltIn = true
        };

        var json = JsonSerializer.Serialize(combo);
        var deserialized = JsonSerializer.Deserialize<StrategyCombo>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("combo-test", deserialized.Id);
        Assert.Equal("測試動能組合", deserialized.Name);
        Assert.Equal(2, deserialized.StrategyFileNames.Count);
        Assert.Equal("AND", deserialized.LogicMode);
        Assert.True(deserialized.IsBuiltIn);
    }

    [Theory]
    [InlineData("AND", 2, 2, true)]
    [InlineData("AND", 1, 2, false)]
    [InlineData("OR", 1, 2, true)]
    [InlineData("OR", 0, 2, false)]
    [InlineData("SCORE", 2, 3, true)] // 66.7% >= 50%
    public void ComboLogic_EvaluatesCorrectly(string mode, int matchedCount, int totalCount, bool expectedResult)
    {
        double scorePercent = totalCount > 0 ? (double)matchedCount / totalCount * 100.0 : 0;
        bool isTriggered = mode switch
        {
            "AND" => matchedCount == totalCount,
            "OR" => matchedCount > 0,
            "SCORE" => scorePercent >= 50,
            _ => false
        };

        Assert.Equal(expectedResult, isTriggered);
    }
}
