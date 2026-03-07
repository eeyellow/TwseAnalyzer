using Microsoft.AspNetCore.Mvc;
using TWSE.Web.Services;

namespace TWSE.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PortfolioController : ControllerBase
{
    private readonly PortfolioService _portfolioService;
    private readonly TrackingService _trackingService;

    public PortfolioController(PortfolioService portfolioService, TrackingService trackingService)
    {
        _portfolioService = portfolioService;
        _trackingService = trackingService;
    }

    [HttpGet]
    public IActionResult GetAll() => Ok(_portfolioService.GetAll());

    [HttpGet("{stockCode}")]
    public IActionResult Get(string stockCode)
    {
        var item = _portfolioService.Get(stockCode);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public IActionResult AddOrUpdate([FromBody] PortfolioItem item)
    {
        _portfolioService.AddOrUpdate(item);
        _trackingService.Add(item.StockCode);
        return Ok(item);
    }

    [HttpDelete("{stockCode}")]
    public IActionResult Remove(string stockCode)
    {
        return _portfolioService.Remove(stockCode) ? Ok() : NotFound();
    }
}
