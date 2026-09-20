using TWSE.Core.Data;
using TWSE.Core.Indicators;
using TWSE.Core.Screening;
using TWSE.Core.Backtesting;
using TWSE.Web.Services;

var builder = WebApplication.CreateBuilder(args);

// Database
var currentDataPath = Path.Combine(Directory.GetCurrentDirectory(), "data", "twse.db");
var fallbackDataPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "twse.db"));
var dbPath = File.Exists(currentDataPath) ? currentDataPath : (File.Exists(fallbackDataPath) ? fallbackDataPath : currentDataPath);
var dbDir = Path.GetDirectoryName(dbPath);
if (!string.IsNullOrEmpty(dbDir) && !Directory.Exists(dbDir)) Directory.CreateDirectory(dbDir);
var connectionString = $"Data Source={dbPath}";

builder.Services.AddSingleton<IStockRepository>(new SqliteRepository(connectionString));
builder.Services.AddSingleton<HttpClient>();
builder.Services.AddSingleton<IYahooFetcher, YahooFetcher>();
builder.Services.AddSingleton<IDataUpdateService, DataUpdateService>();
builder.Services.AddSingleton<IIndicatorService, SkenderIndicatorService>();
builder.Services.AddSingleton<IConditionEvaluator, JsonConditionEvaluator>();
builder.Services.AddSingleton<IBacktestEngine, BacktestEngine>();
builder.Services.AddSingleton<IScreener, StockScreener>();
builder.Services.AddScoped<DailyAnalysisService>();
builder.Services.AddHostedService<DailyUpdateService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();

// SPA fallback: serve index.html for any non-API routes
app.MapFallbackToFile("index.html");

// Ensure database tables are created
using (var scope = app.Services.CreateScope())
{
    var repo = scope.ServiceProvider.GetRequiredService<IStockRepository>();
    await repo.InitializeDatabaseAsync();
}

app.Run();
