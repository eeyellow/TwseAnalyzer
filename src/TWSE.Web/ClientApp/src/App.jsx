import { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio, savePortfolioItem, deletePortfolioItem,
  getLocalTracking, saveLocalTracking,
  fetchStrategies, scanPortfolio, fetchStocks,
  fetchSnapshot, getDailyReport, runUpdateJob, runAnalysisJob
} from './api';
import localforage from 'localforage';
import './index.css';

import StockChartModal from './StockChartModal';

function App() {
  const [page, setPage] = useState('tracking'); // Default tracking to see the feature faster
  const [activeChartStock, setActiveChartStock] = useState(null);
  const [minimizedCharts, setMinimizedCharts] = useState([]);

  const openChart = (stock) => {
    setActiveChartStock(stock);
    setMinimizedCharts(prev => prev.filter(s => s.stockCode !== stock.stockCode));
  };

  const closeChart = () => {
    setActiveChartStock(null);
  };

  const minimizeChart = () => {
    if (activeChartStock && !minimizedCharts.find(s => s.stockCode === activeChartStock.stockCode)) {
      setMinimizedCharts(prev => [...prev, activeChartStock]);
    }
    setActiveChartStock(null);
  };

  const restoreChart = (stock) => {
    openChart(stock);
  };

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'scheduled' && <ScheduledAnalysis onOpenChart={openChart} />}
        {page === 'tracking' && <Tracking onOpenChart={openChart} />}
        {page === 'portfolio' && <Portfolio />}
        {page === 'analysis' && <Analysis />}
      </main>

      <StockChartModal
        stock={activeChartStock}
        onClose={closeChart}
        onMinimize={minimizeChart}
      />

      {minimizedCharts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 250, right: 0,
          background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, padding: '8px 16px', zIndex: 900,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)', overflowX: 'auto'
        }}>
          {minimizedCharts.map(stock => (
            <div key={stock.stockCode} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', transition: 'var(--transition)'
            }} onClick={() => restoreChart(stock)}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>📈 {stock.stockName || stock.name}</span>
              <button onClick={(e) => {
                e.stopPropagation();
                setMinimizedCharts(prev => prev.filter(s => s.stockCode !== stock.stockCode));
              }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.9rem', padding: '0 4px' }}>✖</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ page, setPage }) {
  const items = [
    { id: 'dashboard', icon: '📊', label: '儀表板' },
    { id: 'scheduled', icon: '🤖', label: '排程分析' },
    { id: 'tracking', icon: '⭐', label: '我的追蹤' },
    { id: 'portfolio', icon: '💼', label: '庫存管理' },
    { id: 'analysis', icon: '🔍', label: '策略分析' },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">TWSE Analyzer</div>
      <nav className="sidebar-nav">
        {items.map(i => (
          <button key={i.id} className={`nav-item ${page === i.id ? 'active' : ''}`} onClick={() => setPage(i.id)}>
            <span className="nav-icon">{i.icon}</span>{i.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/* ─── Dashboard ─── */
function Dashboard() {
  const [portfolio, setPortfolio] = useState([]);
  const [signals, setSignals] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const [p, report, stocks] = await Promise.all([getPortfolio(), getDailyReport(), fetchStocks()]);
      setPortfolio(p); 
      if(report) {
         setSignals(report.signals || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const combinedSignals = signals.map(s => {
    const p = portfolio.find(x => x.stockCode === s.stockCode);
    let pl = 0;
    if (p) {
        const buyCost = p.avgCost * p.quantity;
        const currentVal = s.lastClose * p.quantity;
        pl = currentVal - buyCost;
    }
    return { 
      ...s, 
      quantity: p ? p.quantity : 0, 
      avgCost: p ? p.avgCost : 0, 
      profitLoss: pl, 
      buySignal: s.signalType === 'Buy', 
      sellSignal: s.signalType === 'Sell' 
    };
  });

  const totalValue = portfolio.reduce((sum, p) => {
    const s = signals.find(x => x.stockCode === p.stockCode);
    const price = s ? s.lastClose : p.avgCost;
    return sum + price * p.quantity;
  }, 0);
  
  const totalPL = combinedSignals.reduce((sum, s) => sum + s.profitLoss, 0);
  const buyCount = combinedSignals.filter(s => s.buySignal).length;
  const sellCount = combinedSignals.filter(s => s.sellSignal).length;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="stat-label">庫存股數</div>
          <div className="stat-value">{portfolio.length}</div>
        </div>
        <div className="card">
          <div className="stat-label">市值估計</div>
          <div className="stat-value">{fmt(totalValue)}</div>
        </div>
        <div className="card">
          <div className="stat-label">未實現損益</div>
          <div className={`stat-value ${totalPL >= 0 ? 'stat-positive' : 'stat-negative'}`}>
            {totalPL >= 0 ? '+' : ''}{fmt(totalPL)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">盤前自動分析</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span className="badge badge-buy">🟢 建議買進 {buyCount}</span>
            <span className="badge badge-sell">🔴 建議賣出 {sellCount}</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Scheduled Analysis ─── */
function ScheduledAnalysis({ onOpenChart }) {
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchReport = async () => {
    setLoading(true);
    try {
      const [p, report, stocks] = await Promise.all([getPortfolio(), getDailyReport(), fetchStocks()]);
      setPortfolio(p); 
      setAllStocks(stocks || []);
      if(report) {
         setReportDate(report.date);
         setSignals(report.signals || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const handleRunUpdate = async () => {
    if(!confirm("確定要手動觸發最新股價抓取嗎？(需要數分鐘)")) return;
    setUpdating(true);
    try {
      const res = await runUpdateJob();
      alert(res.message || "資料更新完成");
    } catch (e) {
      alert("更新失敗: " + e.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleRunAnalysis = async () => {
    if(!confirm("確定要手動觸發全盤分析嗎？")) return;
    setAnalyzing(true);
    try {
      const res = await runAnalysisJob();
      alert(res.message || "分析完成");
      await fetchReport();
    } catch (e) {
      alert("分析失敗: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const combinedSignals = signals.map(s => {
    const p = portfolio.find(x => x.stockCode === s.stockCode);
    const stockName = allStocks.find(x => x.code === s.stockCode)?.name || p?.stockName || 'N/A';
    let pl = 0;
    if (p) {
        const buyCost = p.avgCost * p.quantity;
        const currentVal = s.lastClose * p.quantity;
        pl = currentVal - buyCost;
    }
    return { 
      ...s, 
      stockName,
      quantity: p ? p.quantity : 0, 
      avgCost: p ? p.avgCost : 0, 
      profitLoss: pl, 
      buySignal: s.signalType === 'Buy', 
      sellSignal: s.signalType === 'Sell' 
    };
  });

  let query = combinedSignals;
  if (search) {
     const val = search.toLowerCase();
     query = query.filter(s => s.stockCode.includes(val) || s.stockName.includes(val));
  }
  if (strategyFilter) {
     query = query.filter(s => s.strategyName === strategyFilter);
  }

  query.sort((a,b) => {
    if(a.buySignal !== b.buySignal) return a.buySignal ? -1 : 1;
    return a.stockCode.localeCompare(b.stockCode);
  });

  const totalCount = query.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paged = query.slice((page - 1) * pageSize, page * pageSize);

  const strategiesList = [...new Set(combinedSignals.map(s => s.strategyName))];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>系統排程分析結果</h2>
          {reportDate && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>資料日期: {new Date(reportDate).toLocaleDateString()}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleRunUpdate} disabled={updating || analyzing}>
            {updating ? '🔄 抓取中...' : '⬇️ 手動抓取報價'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRunAnalysis} disabled={updating || analyzing}>
            {analyzing ? '⏳ 分析中...' : '🚀 手動執行分析'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="搜尋代碼或名稱..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 300 }}
        />
        <select className="select" style={{ maxWidth: 200 }} value={strategyFilter} onChange={e => { setStrategyFilter(e.target.value); setPage(1); }}>
          <option value="">所有策略</option>
          {strategiesList.map(st => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="table-container">
          <table>
            <thead><tr><th>股票代碼</th><th>名稱</th><th>策略</th><th>持股</th><th>均價</th><th>現價/建議價</th><th>損益</th><th>系統建議</th></tr></thead>
            <tbody>
              {paged.map(s => (
                <tr key={`${s.stockCode}-${s.strategyName}-${s.signalType}`}>
                  <td style={{ fontWeight: 600, cursor:'pointer', color:'var(--color-teal)' }} onClick={() => onOpenChart && onOpenChart({ stockCode: s.stockCode, stockName: s.stockName })}>
                    {s.stockCode}
                  </td>
                  <td style={{ cursor:'pointer' }} onClick={() => onOpenChart && onOpenChart({ stockCode: s.stockCode, stockName: s.stockName })}>
                    {s.stockName}
                  </td>
                  <td><span className="badge badge-hold">{s.strategyName}</span></td>
                  <td>{s.quantity > 0 ? s.quantity.toLocaleString() : '-'}</td>
                  <td>{s.avgCost > 0 ? s.avgCost.toFixed(2) : '-'}</td>
                  <td>{s.suggestedPrice ? s.suggestedPrice.toFixed(2) : s.lastClose.toFixed(2)}</td>
                  <td className={s.profitLoss >= 0 ? 'stat-positive' : 'stat-negative'}>
                    {s.quantity > 0 ? `${s.profitLoss >= 0 ? '+' : ''}${fmt(s.profitLoss)}` : '-'}
                  </td>
                  <td>
                    {s.buySignal && <><span className="signal-dot buy active" /><span className="badge badge-buy">買進</span></>}
                    {s.sellSignal && <><span className="signal-dot sell active" /><span className="badge badge-sell">賣出</span></>}
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>查無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            共 {totalCount} 筆 (第 {page} / {totalPages} 頁)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</button>
        </div>
      </div>
    </div>
  );
}
/* ─── Portfolio ─── */
function Portfolio() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [allStocks, setAllStocks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [form, setForm] = useState({ stockCode: '', stockName: '', quantity: 0, avgCost: 0, selectedStrategy: '' });
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([getPortfolio(), fetchStrategies()])
      .then(([p, s]) => { setItems(p); setStrategies(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = () => {
    setSearchTerm('');
    setFilteredStocks([]);
    fetchStocks().then(s => { setAllStocks(s); setForm({ stockCode: '', stockName: '', quantity: 0, avgCost: 0, selectedStrategy: '' }); setShowModal(true); });
  };

  const handleSave = async () => {
    await savePortfolioItem(form);
    setShowModal(false);
    setForm({ stockCode: '', stockName: '', quantity: 0, avgCost: 0, selectedStrategy: '' });
    reload();
  };

  const handleDelete = async (code) => {
    if (confirm(`確認刪除 ${code}？`)) {
      await deletePortfolioItem(code);
      reload();
    }
  };

  const handleEdit = (item) => {
    setForm({ ...item });
    setSearchTerm(`${item.stockCode} ${item.stockName}`);
    setShowModal(true);
  };

  const handleSearch = (val) => {
    setSearchTerm(val);
    if (val.trim().length >= 1) {
      const search = val.toLowerCase();
      const filtered = allStocks.filter(s =>
        s.code.includes(search) || s.name.includes(search)
      ).slice(0, 10);
      setFilteredStocks(filtered);
    } else {
      setFilteredStocks([]);
    }
  };

  const handleStockSelect = (stock) => {
    setForm(f => ({ ...f, stockCode: stock.code, stockName: stock.name }));
    setSearchTerm(`${stock.code} ${stock.name}`);
    setFilteredStocks([]);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>＋ 新增個股</button>
        </div>
        {loading ? <div className="spinner" /> : (
          items.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📦</div><p className="empty-state-text">尚無庫存紀錄，點擊「新增個股」開始追蹤</p></div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>代碼</th><th>名稱</th><th>持股數</th><th>均價</th><th>指定策略</th><th>操作</th></tr></thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.stockCode}>
                      <td style={{ fontWeight: 600 }}>{i.stockCode}</td>
                      <td>{i.stockName}</td>
                      <td>{i.quantity.toLocaleString()}</td>
                      <td>{i.avgCost.toFixed(2)}</td>
                      <td><span className="badge badge-hold">{i.selectedStrategy || '預設'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(i)}>✏️ 編輯</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.stockCode)}>🗑 刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{form.stockCode ? '編輯持股' : '新增持股'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">股票代碼</label>
                {!form.stockCode ? (
                  <>
                    <input
                      className="input"
                      placeholder="輸入代碼或名稱搜尋 (例如: 2330)..."
                      value={searchTerm}
                      onChange={e => handleSearch(e.target.value)}
                    />
                    {filteredStocks.length > 0 && (
                      <div className="autocomplete-dropdown">
                        {filteredStocks.map(s => (
                          <div key={s.code} className="autocomplete-item" onClick={() => handleStockSelect(s)}>
                            <span style={{ fontWeight: 600, marginRight: 8, color: 'var(--accent)' }}>{s.code}</span>
                            <span>{s.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" value={`${form.stockCode} ${form.stockName}`} disabled />
                    <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => setForm(f => ({ ...f, stockCode: '', stockName: '' }))}>修改</button>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">持股數量</label>
                  <input className="input" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">買入均價</label>
                  <input className="input" type="number" step="0.01" value={form.avgCost} onChange={e => setForm(f => ({ ...f, avgCost: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">指定策略</label>
                <select className="select" value={form.selectedStrategy || ''} onChange={e => setForm(f => ({ ...f, selectedStrategy: e.target.value }))}>
                  <option value="">使用預設策略</option>
                  {strategies.map(s => <option key={s.fileName} value={s.fileName}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.stockCode}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Analysis ─── */
function Analysis() {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchStrategies().then(s => { setStrategies(s); if (s.length) setSelectedStrategy(s[0].fileName); }); }, []);

  const runScan = async () => {
    if (!selectedStrategy) return;
    setLoading(true);
    const p = await getPortfolio();
    const data = await scanPortfolio(selectedStrategy, p);
    setSignals(data);
    setLoading(false);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="grid grid-3">
          {strategies.map(s => (
            <button key={s.fileName}
              className={`card ${selectedStrategy === s.fileName ? 'active' : ''}`}
              style={{ cursor: 'pointer', textAlign: 'left', border: selectedStrategy === s.fileName ? '2px solid var(--accent)' : undefined }}
              onClick={() => setSelectedStrategy(s.fileName)}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.fileName}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={runScan} disabled={loading || !selectedStrategy}>
            {loading ? '⏳ 分析中...' : '🚀 執行分析'}
          </button>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead><tr><th>代碼</th><th>名稱</th><th>最新收盤</th><th>最新日期</th><th>買進訊號</th><th>賣出訊號</th><th>建議</th></tr></thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.stockCode}>
                    <td style={{ fontWeight: 600 }}>{s.stockCode}</td>
                    <td>{s.stockName}</td>
                    <td>{s.lastClose.toFixed(2)}</td>
                    <td>{new Date(s.lastDate).toLocaleDateString('zh-TW')}</td>
                    <td>{s.buySignal ? <span className="badge badge-buy"><span className="signal-dot buy active" />觸發</span> : '—'}</td>
                    <td>{s.sellSignal ? <span className="badge badge-sell"><span className="signal-dot sell active" />觸發</span> : '—'}</td>
                    <td>
                      {s.buySignal && <span className="badge badge-buy">🟢 建議買進</span>}
                      {s.sellSignal && <span className="badge badge-sell">🔴 建議賣出</span>}
                      {!s.buySignal && !s.sellSignal && <span className="badge badge-hold">⏸ 觀望</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Tracking ─── */
function Tracking({ onOpenChart }) {
  const [data, setData] = useState({ items: [], columns: [], totalCount: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [showColSettings, setShowColSettings] = useState(false);
  const [hiddenCols, setHiddenCols] = useState([]);

  const [allStocksCache, setAllStocksCache] = useState([]);

  useEffect(() => {
    fetchStocks().then(setAllStocksCache);
    localforage.getItem('twse_hidden_cols').then((val) => {
      if (val) setHiddenCols(val);
    });
  }, []);

  const load = useCallback(async () => {
    if (!allStocksCache.length) return;
    setLoading(true);

    let trackingList = await getLocalTracking();
    let portfolioList = await getPortfolio();
    let pCodes = new Set(portfolioList.map(p => p.stockCode));
    let tCodes = new Set(trackingList);

    let query = allStocksCache;
    if (search) query = query.filter(s => s.code.includes(search) || s.name.includes(search));

    if (statusFilter === '2') query = query.filter(s => pCodes.has(s.code));
    else if (statusFilter === '1') query = query.filter(s => tCodes.has(s.code));
    else if (statusFilter === '0') query = query.filter(s => !pCodes.has(s.code) && !tCodes.has(s.code));

    // Sort by status (2: In Portfolio, 1: Tracked, 0: Untracked) then by code
    query.sort((a, b) => {
      let statusA = pCodes.has(a.code) ? 2 : (tCodes.has(a.code) ? 1 : 0);
      let statusB = pCodes.has(b.code) ? 2 : (tCodes.has(b.code) ? 1 : 0);
      if (statusA !== statusB) return statusB - statusA;
      return a.code.localeCompare(b.code);
    });
    const totalCount = query.length;
    const paged = query.slice((page - 1) * pageSize, page * pageSize);

    const codes = paged.map(s => s.code);
    const snapshots = await fetchSnapshot(codes);

    const columns = ['收盤價', '成交量', 'MA20', 'RSI(14)'];
    const items = paged.map(s => {
      let snap = snapshots.find(x => x.stockCode === s.code);
      let status = pCodes.has(s.code) ? 2 : (tCodes.has(s.code) ? 1 : 0);
      return {
        stockCode: s.code,
        stockName: s.name,
        status: status,
        metrics: {
          '收盤價': snap?.close?.toFixed(2) || '-',
          '成交量': snap?.volume?.toLocaleString() || '-',
          'MA20': snap?.sma20?.toFixed(2) || '-',
          'RSI(14)': snap?.rsi14?.toFixed(2) || '-'
        }
      };
    });

    setData({ items, columns, totalCount });
    setLoading(false);
  }, [search, statusFilter, page, pageSize, allStocksCache]);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    localforage.setItem('twse_hidden_cols', hiddenCols);
  }, [hiddenCols]);

  const handleToggle = async (stockCode, currentStatus) => {
    if (currentStatus === 2) return; // In stock
    let t = await getLocalTracking();
    if (currentStatus === 1) {
      t = t.filter(c => c !== stockCode);
    } else {
      if (!t.includes(stockCode)) t.push(stockCode);
    }
    await saveLocalTracking(t);
    load();
  };

  const toggleCol = (col) => {
    setHiddenCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const totalCount = data.totalCount || 0;
  const items = data.items || [];
  const allColumns = data.columns || [];
  const visibleColumns = allColumns.filter(c => !hiddenCols.includes(c));
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <input
            className="input"
            placeholder="搜尋代碼或名稱..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ maxWidth: 300 }}
          />
          <select className="select" style={{ maxWidth: 150 }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">全部狀態</option>
            <option value="2">💼 庫存中</option>
            <option value="1">⭐ 已追蹤</option>
            <option value="0">☆ 未關注</option>
          </select>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost" onClick={() => setShowColSettings(!showColSettings)}>
            ⚙️ 顯示欄位
          </button>
          {showColSettings && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, zIndex: 50, minWidth: 200, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem', color: 'var(--color-dark)' }}>顯示/隱藏技術指標</div>
              {allColumns.map(c => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={!hiddenCols.includes(c)} onChange={() => toggleCol(c)} />
                  {c}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>代碼</th>
                <th>名稱</th>
                {visibleColumns.map(c => <th key={c}>{c}</th>)}
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const InStock = 2;
                const Tracked = 1;

                return (
                  <tr key={i.stockCode} className="tracking-row">
                    <td
                      style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--color-teal)' }}
                      onClick={() => onOpenChart && onOpenChart(i)}
                      title="點擊查看技術分析圖表"
                    >
                      {i.stockCode}
                    </td>
                    <td
                      style={{ cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => onOpenChart && onOpenChart(i)}
                      title="點擊查看技術分析圖表"
                    >
                      {i.stockName}
                    </td>
                    {visibleColumns.map(c => {
                      let color = 'inherit';
                      const val = i.metrics[c] || '';
                      if (c.includes('Histogram')) {
                        if (val.startsWith('-')) color = 'var(--red)';
                        else if (val !== '-' && val !== '0.00') color = 'var(--green)';
                      }
                      return <td key={c} style={{ color }}>{val}</td>;
                    })}
                    <td>
                      {i.status === InStock ? (
                        <span className="badge badge-buy">💼 庫存中</span>
                      ) : (
                        <button
                          className={`btn btn-sm ${i.status === Tracked ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => handleToggle(i.stockCode, i.status)}
                        >
                          {i.status === Tracked ? '⭐ 已追蹤' : '☆ 未關注'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={visibleColumns.length + 3} style={{ textAlign: 'center', padding: 32 }}>查無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            共 {totalCount} 筆 (第 {page} / {totalPages} 頁)
          </span>
          <select className="select" style={{ width: 100, padding: '6px 10px', fontSize: '0.85rem' }} value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1); }}>
            <option value="10">10 筆/頁</option>
            <option value="20">20 筆/頁</option>
            <option value="50">50 筆/頁</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</button>
        </div>
      </div>
    </div>
  );
}

function fmt(n) { return n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

export default App;
