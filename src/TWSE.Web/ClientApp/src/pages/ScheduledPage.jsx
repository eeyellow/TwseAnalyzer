import React, { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio,
  getDailyReport,
  fetchStocks,
  runUpdateJob,
  runAnalysisJob,
} from '../api';
import {
  fmtCurrency,
  fmtDate,
} from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import {
  RefreshCw,
  Zap,
  Search,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Filter,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

export default function ScheduledPage({ onOpenChart }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [reportDate, setReportDate] = useState(null);

  // Loading actions
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [signalTypeFilter, setSignalTypeFilter] = useState(''); // 'Buy' | 'Sell' | ''
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [p, report, stocks] = await Promise.all([
        getPortfolio(),
        getDailyReport(),
        fetchStocks(),
      ]);
      setPortfolio(p || []);
      setAllStocks(stocks || []);
      if (report) {
        setReportDate(report.date);
        setSignals(report.signals || []);
      }
    } catch (err) {
      toast.error(`載入報告失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleRunUpdate = async () => {
    setUpdating(true);
    toast.info('開始手動抓取所有股票歷史日收盤...');
    try {
      const res = await runUpdateJob();
      toast.success(res.message || '股價歷史更新完成！');
    } catch (e) {
      toast.error(`更新失敗: ${e.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    toast.info('開始進行全市場策略分析...');
    try {
      const res = await runAnalysisJob();
      toast.success(res.message || '全市場分析完成！');
      await fetchReport();
    } catch (e) {
      toast.error(`分析失敗: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Combine signal info with portfolio holding status
  const combinedSignals = signals.map((s) => {
    const p = portfolio.find((x) => x.stockCode === s.stockCode);
    const stockName =
      allStocks.find((x) => x.code === s.stockCode)?.name ||
      p?.stockName ||
      'N/A';
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
      sellSignal: s.signalType === 'Sell',
    };
  });

  // Filtering
  let query = combinedSignals;
  if (search) {
    const val = search.toLowerCase();
    query = query.filter(
      (s) =>
        s.stockCode.toLowerCase().includes(val) ||
        s.stockName.toLowerCase().includes(val)
    );
  }
  if (strategyFilter) {
    query = query.filter((s) => s.strategyName === strategyFilter);
  }
  if (signalTypeFilter) {
    query = query.filter((s) => s.signalType === signalTypeFilter);
  }

  // Sort: Buy signals first, then stockCode
  query.sort((a, b) => {
    if (a.buySignal !== b.buySignal) return a.buySignal ? -1 : 1;
    return a.stockCode.localeCompare(b.stockCode);
  });

  const totalCount = query.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paged = query.slice((page - 1) * pageSize, page * pageSize);

  const strategiesList = [
    ...new Set(combinedSignals.map((s) => s.strategyName)),
  ];

  const buyTotal = combinedSignals.filter((s) => s.buySignal).length;
  const sellTotal = combinedSignals.filter((s) => s.sellSignal).length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              排程盤前策略分析
            </h1>
            {reportDate && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                基準日：{fmtDate(reportDate)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            由系統後台自動排程每日盤後運算全市場技術策略產生的決策報告
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunUpdate}
            loading={updating}
            disabled={updating || analyzing}
            icon={RefreshCw}
          >
            手動抓取最新報價
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAnalysis}
            loading={analyzing}
            disabled={updating || analyzing}
            icon={Zap}
          >
            重新運算全盤分析
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Signal Type Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 shrink-0">
            <button
              onClick={() => {
                setSignalTypeFilter('');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                signalTypeFilter === ''
                  ? 'bg-white dark:bg-[#111827] text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:white'
              }`}
            >
              全部訊號 ({combinedSignals.length})
            </button>
            <button
              onClick={() => {
                setSignalTypeFilter('Buy');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                signalTypeFilter === 'Buy'
                  ? 'bg-white dark:bg-[#111827] text-rose-500 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:white'
              }`}
            >
              🟢 買進建議 ({buyTotal})
            </button>
            <button
              onClick={() => {
                setSignalTypeFilter('Sell');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                signalTypeFilter === 'Sell'
                  ? 'bg-white dark:bg-[#111827] text-emerald-500 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:white'
              }`}
            >
              🔴 賣出建議 ({sellTotal})
            </button>
          </div>

          {/* Search & Strategy Select */}
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="搜尋代碼或名稱..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border-none outline-none text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

            <select
              value={strategyFilter}
              onChange={(e) => {
                setStrategyFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border-none text-slate-900 dark:text-white outline-none"
            >
              <option value="">所有分析策略</option>
              {strategiesList.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Signals Table */}
        {loading ? (
          <div className="py-20 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-500 opacity-60" />
            <p className="text-sm">查無符合條件之排程訊號</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-6">股票標的</th>
                  <th className="py-3.5 px-4">觸發策略</th>
                  <th className="py-3.5 px-4 text-right">現有持股</th>
                  <th className="py-3.5 px-4 text-right">持股均價</th>
                  <th className="py-3.5 px-4 text-right">現價 / 建議價</th>
                  <th className="py-3.5 px-4 text-right">持股損益</th>
                  <th className="py-3.5 px-4">系統建議</th>
                  <th className="py-3.5 px-6 text-right">線圖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((s, idx) => {
                  const isUp = s.profitLoss >= 0;

                  return (
                    <tr
                      key={`${s.stockCode}-${s.strategyName}-${s.signalType}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div
                          className="flex items-center gap-2.5 cursor-pointer group"
                          onClick={() => onOpenChart(s)}
                        >
                          <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 group-hover:underline">
                            {s.stockCode}
                          </span>
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {s.stockName}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="purple" size="sm">
                          {s.strategyName}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-medium">
                        {s.quantity > 0 ? s.quantity.toLocaleString() : '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        {s.avgCost > 0 ? s.avgCost.toFixed(2) : '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {s.suggestedPrice
                          ? s.suggestedPrice.toFixed(2)
                          : s.lastClose.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
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

                      <td className="py-3.5 px-4">
                        {s.buySignal && (
                          <Badge variant="buy" size="sm" dot pulse>
                            買進訊號
                          </Badge>
                        )}
                        {s.sellSignal && (
                          <Badge variant="sell" size="sm" dot pulse>
                            賣出訊號
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onOpenChart(s)}
                          icon={BarChart3}
                          title="查看走勢線圖"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span>
              共 <b className="font-mono">{totalCount}</b> 筆訊號 (第{' '}
              <b className="font-mono">{page}</b> /{' '}
              <b className="font-mono">{totalPages}</b> 頁)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              icon={ChevronLeft}
            >
              上一頁
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一頁
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
