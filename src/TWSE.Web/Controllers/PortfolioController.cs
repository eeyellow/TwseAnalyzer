using Microsoft.AspNetCore.Mvc;
using TWSE.Core.Data;
using TWSE.Core.Models;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PortfolioController : ControllerBase
{
    private readonly IStockRepository _repo;

    public PortfolioController(IStockRepository repo)
    {
        _repo = repo;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var list = await _repo.GetPortfolioAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] PortfolioItem item)
    {
        if (string.IsNullOrWhiteSpace(item.StockCode))
            return BadRequest("Stock code is required.");

        await _repo.UpdatePortfolioItemAsync(item);
        return Ok();
    }

    [HttpDelete("{code}")]
    public async Task<IActionResult> Delete(string code)
    {
        await _repo.DeletePortfolioItemAsync(code);
        return Ok();
    }
}
