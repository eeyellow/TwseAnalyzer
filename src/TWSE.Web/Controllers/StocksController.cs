using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StocksController : ControllerBase
{
    private readonly IStockRepository _repo;

    public StocksController(IStockRepository repo)
    {
        _repo = repo;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var stocks = await _repo.GetAllStocksAsync();
        return Ok(stocks);
    }

    [HttpGet("{code}/prices")]
    public async Task<IActionResult> GetPrices(string code, [FromQuery] int? days = null)
    {
        DateTime? startDate = null;
        if (days.HasValue) 
        {
            startDate = DateTime.Now.AddDays(-days.Value);
        }
        
        var prices = await _repo.GetDailyPricesAsync(code, startDate);
        return Ok(prices);
    }
}
