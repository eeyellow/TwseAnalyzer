import React, { useState, useEffect } from 'react';
import {
  fetchStrategies,
  getPortfolio,
  scanPortfolio,
} from '../api';
import {
  fmtCurrency,
  fmtDate,
} from '../utils/formatters';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import {
  SlidersHorizontal,
  Play,
  CheckCircle,
  AlertTriangle,
  FileCode,
  BarChart3,
  Search,
  Briefcase,
} from 'lucide-react';

export default function StrategyPage({ onOpenChart, onNavigate }) {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [portfolioEmpty, setPortfolioEmpty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchStrategies().then((list) => {
      setStrategies(list || []);
      if (list && list.length > 0) {
        setSelectedStrategy(list[0].fileName);
      }
    });
  }, []);

  const runScan = async () => {
    if (!selectedStrategy) return;
    setLoading(true);
    setHasScanned(true);

    try {
      const p = await getPortfolio();
      if (!p || p.length === 0) {
        setPortfolioEmpty(true);
        setSignals([]);
        return;
      }
      setPortfolioEmpty(false);
      const data = await scanPortfolio(selectedStrategy, p);
      setSignals(data || []);
    } catch (err) {
      console.error('Scan failed', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSignals = signals.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.stockCode.toLowerCase().includes(term) ||
      s.stockName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          策略選股與持股健檢
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          套用自定義量化條件模型，針對現有持股進行買入點或停利出場檢測
        </p>
      </div>

      {/* Strategy Selector Grid */}
      <Card
        title="選擇分析策略模型"
        subtitle="點選欲套用的策略設定檔，系統將對庫存部位進行逐檔逐日技術運算"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {strategies.map((s) => {
            const isSelected = selectedStrategy === s.fileName;
            return (
              <div
                key={s.fileName}
                onClick={() => setSelectedStrategy(s.fileName)}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 relative group ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {s.name}
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">
                        {s.fileName}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse-glow" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            目前選定：
            <b className="text-slate-700 dark:text-slate-200 font-mono ml-1">
              {selectedStrategy || '未選擇'}
            </b>
          </span>

          <Button
            variant="primary"
            size="sm"
            onClick={runScan}
            loading={loading}
            disabled={loading || !selectedStrategy}
            icon={Play}
          >
            執行持股掃描分析
          </Button>
        </div>
      </Card>

      {/* Empty State: No Portfolio */}
      {portfolioEmpty && hasScanned && (
        <Card>
          <div className="py-12 text-center text-slate-500">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-400 opacity-60" />
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              目前庫存中尚無持股
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              策略掃描針對您庫存中的股票部位進行買賣訊號檢測。請先新增持股後再執行。
            </p>
            <Button
              variant="primary"
              size="xs"
              className="mt-4"
              onClick={() => onNavigate('portfolio')}
            >
              前往庫存管理新增部位
            </Button>
          </div>
        </Card>
      )}

      {/* Empty State: Scanned but no signals triggered */}
      {!portfolioEmpty && hasScanned && signals.length === 0 && !loading && (
        <Card>
          <div className="py-12 text-center text-slate-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-80" />
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              庫存個股目前皆未觸發此策略之進出場訊號
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              當前所有庫存持股部位均處於正常持有或觀望狀態。
            </p>
          </div>
        </Card>
      )}

      {/* Results Table */}
      {signals.length > 0 && (
        <Card
          title={`掃描結果清單 (${filteredSignals.length} 筆)`}
          subtitle={`套用策略「${selectedStrategy}」運算最新交易日狀態`}
          action={
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜尋代碼或名稱..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border-none outline-none text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>
          }
        >
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-6">股票標的</th>
                  <th className="py-3 px-4">持股數量</th>
                  <th className="py-3 px-4">買入均價</th>
                  <th className="py-3 px-4">最新收盤價</th>
                  <th className="py-3 px-4">未實現損益</th>
                  <th className="py-3 px-4">訊號觸發</th>
                  <th className="py-3 px-4">系統建議</th>
                  <th className="py-3 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSignals.map((s) => {
                  const isUp = s.profitLoss >= 0;

                  return (
                    <tr
                      key={s.stockCode}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-6">
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onOpenChart(s)}
                        >
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400 group-hover:underline">
                            {s.stockCode}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {s.stockName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {s.quantity > 0 ? s.quantity.toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {s.avgCost > 0 ? s.avgCost.toFixed(2) : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {s.lastClose.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {s.quantity > 0 ? (
                          <span
                            className={`font-semibold ${
                              isUp ? 'text-rose-500' : 'text-emerald-500'
                            }`}
                          >
                            {isUp ? '+' : ''}
                            {fmtCurrency(s.profitLoss)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {s.buySignal && (
                            <Badge variant="buy" size="sm" dot pulse>
                              買進條件成立
                            </Badge>
                          )}
                          {s.sellSignal && (
                            <Badge variant="sell" size="sm" dot pulse>
                              出場條件成立
                            </Badge>
                          )}
                          {!s.buySignal && !s.sellSignal && (
                            <span className="text-slate-400 text-xs">無訊號</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {s.buySignal && (
                          <span className="font-bold text-rose-500">
                            強烈建議買進
                          </span>
                        )}
                        {s.sellSignal && (
                          <span className="font-bold text-emerald-500">
                            建議獲利了結/停損
                          </span>
                        )}
                        {!s.buySignal && !s.sellSignal && (
                          <span className="text-slate-400">續抱觀望</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onOpenChart(s)}
                          icon={BarChart3}
                        >
                          看盤線圖
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
