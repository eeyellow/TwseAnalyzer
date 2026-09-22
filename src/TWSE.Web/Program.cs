using TWSE.Core.Data;
using TWSE.Core.Indicators;
using TWSE.Core.Screening;
using TWSE.Core.Backtesting;
using TWSE.Web.Services;

var builder = WebApplication.CreateBuilder(args);

// Database
static string FindDatabasePath()
{
    var envPath = Environment.GetEnvironmentVariable("TWSE_DB_PATH");
    if (!string.IsNullOrEmpty(envPath) && File.Exists(envPath))
        return Path.GetFullPath(envPath);

    var current = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (current != null)
    {
        var candidate = Path.Combine(current.FullName, "data", "twse.db");
        if (File.Exists(candidate))
            return candidate;

        if (current.GetFiles("*.sln*").Any() || current.GetDirectories(".git").Any())
            return candidate;

        current = current.Parent;
    }

    var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
    while (baseDir != null)
    {
        var candidate = Path.Combine(baseDir.FullName, "data", "twse.db");
        if (File.Exists(candidate))
            return candidate;

        if (baseDir.GetFiles("*.sln*").Any() || baseDir.GetDirectories(".git").Any())
            return candidate;

        baseDir = baseDir.Parent;
    }

    return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "data", "twse.db"));
}

var dbPath = FindDatabasePath();
var dbDir = Path.GetDirectoryName(dbPath);
if (!string.IsNullOrEmpty(dbDir) && !Directory.Exists(dbDir)) Directory.CreateDirectory(dbDir);
Console.WriteLine($"[TWSE.Web] Using database at: {dbPath}");
var connectionString = $"Data Source={dbPath}";

builder.Services.AddSingleton<IStockRepository>(new SqliteRepository(connectionString));
builder.Services.AddSingleton<HttpClient>();
builder.Services.AddSingleton<ITwseFetcher, TwseFetcher>();
builder.Services.AddSingleton<IYahooFetcher, YahooFetcher>();
builder.Services.AddSingleton<IDataUpdateService, DataUpdateService>();
builder.Services.AddSingleton<IIndicatorService, SkenderIndicatorService>();
builder.Services.AddSingleton<IConditionEvaluator, JsonConditionEvaluator>();
builder.Services.AddSingleton<IBacktestEngine, BacktestEngine>();
builder.Services.AddSingleton<IScreener, StockScreener>();
builder.Services.AddScoped<DailyAnalysisService>();
builder.Services.AddSingleton<HistoricalReplayService>();
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

// SPA fallback: serve index.html for any non-API routes, but return 404 JSON for unmatched /api routes
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"error\": \"API endpoint not found\", \"path\": \"" + context.Request.Path + "\"}");
        return;
    }

    var webRoot = app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    var indexPath = Path.Combine(webRoot, "index.html");
    if (File.Exists(indexPath))
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(indexPath);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsync("Frontend build index.html not found.");
    }
});

// Ensure database tables are created
using (var scope = app.Services.CreateScope())
{
    var repo = scope.ServiceProvider.GetRequiredService<IStockRepository>();
    await repo.InitializeDatabaseAsync();
}

app.Run();
