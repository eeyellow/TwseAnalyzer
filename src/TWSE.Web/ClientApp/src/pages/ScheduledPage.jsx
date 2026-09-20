import React, { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio,
  getDailyReport,
  fetchStocks,
  runUpdateJob,
  runAnalysisJob,
} from '../api';
import { fmtCurrency, fmtDate } from '../utils/formatters';
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
  Clock,
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

export default function ScheduledPage({ onOpenChart, onNavigate }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState([]);
  const [recommendedBuys, setRecommendedBuys] = useState([]);
  const [recommendedSells, setRecommendedSells] = useState([]);
  const [reportDate, setReportDate] = useState(null);

  // Loading actions
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Active Tab: 'holdings' | 'buys' | 'sells' | 'all'
  const [activeTab, setActiveTab] = useState('holdings');

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
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
        setPortfolioAnalysis(report.portfolioAnalysis || []);
        setRecommendedBuys(report.recommendedBuys || []);
        setRecommendedSells(report.recommendedSells || []);
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
    toast.info('開始抓取全市場最新收盤價...');
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
    toast.info('開始執行持股健檢與未持股 Top 20 買賣推薦分析...');
    try {
      const res = await runAnalysisJob();
      toast.success(res.message || '盤前策略分析完成！');
      await fetchReport();
    } catch (e) {
      toast.error(`分析失敗: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Combine raw signals info
  const combinedSignals = signals.map((s) => {
    const p = portfolio.find((x) => x.stockCode === s.stockCode);
    const stockName =
      allStocks.find((x) => x.code === s.stockCode)?.name ||
      p?.stockName ||
      '個股';
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
      isHolding: !!p,
      buySignal: s.signalType === 'Buy',
      sellSignal: s.signalType === 'Sell',
      holdSignal: s.signalType === 'Hold',
    };
  });

  // Decide which list to display based on activeTab
  let currentList = [];
  if (activeTab === 'holdings') {
    currentList = portfolioAnalysis;
  } else if (activeTab === 'buys') {
    currentList = recommendedBuys;
  } else if (activeTab === 'sells') {
    currentList = recommendedSells;
  } else {
    currentList = combinedSignals;
  }

  // Filtering
  let query = currentList;
  if (search) {
    const val = search.toLowerCase();
    query = query.filter(
      (s) =>
        s.stockCode?.toLowerCase().includes(val) ||
        s.stockName?.toLowerCase().includes(val)
    );
  }
  if (strategyFilter) {
    query = query.filter((s) => s.strategyName === strategyFilter);
  }

  const totalCount = query.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paged = query.slice((page - 1) * pageSize, page * pageSize);

  const strategiesList = [
    ...new Set(
      [
        ...portfolioAnalysis.map((s) => s.strategyName),
        ...recommendedBuys.map((s) => s.strategyName),
        ...recommendedSells.map((s) => s.strategyName),
        ...combinedSignals.map((s) => s.strategyName),
      ].filter(Boolean)
    ),
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              每日盤前策略分析
            </h1>
            {reportDate && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                基準日：{fmtDate(reportDate)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 mt-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>定時排程：每天晚上 20:00 (8:00 PM) 自動執行分析</span>
          </div>
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
            更新收盤報價
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAnalysis}
            loading={analyzing}
            disabled={updating || analyzing}
            icon={Zap}
          >
            立即手動運算
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 shrink-0">
            <button
              onClick={() => {
                setActiveTab('holdings');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'holdings'
                  ? 'bg-white dark:bg-[#111827] text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              目前持股操作分析 ({portfolioAnalysis.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('buys');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'buys'
                  ? 'bg-white dark:bg-[#111827] text-rose-500 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
              未持股最推薦買進 Top 20 ({recommendedBuys.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('sells');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'sells'
                  ? 'bg-white dark:bg-[#111827] text-emerald-500 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
              未持股最推薦賣出 Top 20 ({recommendedSells.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              全市場訊號清單 ({combinedSignals.length})
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
              <option value="">所有策略</option>
              {strategiesList.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Loading */}
        {loading ? (
          <div className="py-20 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-500 opacity-60" />
            <p className="text-sm font-medium">
              {activeTab === 'holdings'
                ? '目前庫存中尚無持股部位'
                : '查無符合條件之策略分析訊號'}
            </p>
            {activeTab === 'holdings' && (
              <Button
                variant="primary"
                size="xs"
                className="mt-3"
                onClick={() => onNavigate && onNavigate('portfolio')}
              >
                前往庫存管理新增部位
              </Button>
            )}
          </div>
        ) : activeTab === 'holdings' ? (
          /* TAB 1: 目前持股操作分析 */
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-6">持股標的</th>
                  <th className="py-3.5 px-4 text-right">持股數量</th>
                  <th className="py-3.5 px-4 text-right">買入均價</th>
                  <th className="py-3.5 px-4 text-right">最新收盤價</th>
                  <th className="py-3.5 px-4 text-right">未實現損益</th>
                  <th className="py-3.5 px-4">觸發策略</th>
                  <th className="py-3.5 px-4">建議操作</th>
                  <th className="py-3.5 px-4">診斷理由</th>
                  <th className="py-3.5 px-6 text-right">走勢圖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((s, idx) => {
                  const isUp = s.profitLoss >= 0;
                  const isSell = s.action === 'Sell';
                  const isBuy = s.action === 'Buy';

                  return (
                    <tr
                      key={`${s.stockCode}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
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

                      <td className="py-3.5 px-4 text-right font-mono font-medium">
                        {s.quantity?.toLocaleString() || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        {s.avgCost?.toFixed(2) || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {s.lastClose?.toFixed(2) || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <span
                          className={`font-semibold ${
                            isUp ? 'text-rose-500' : 'text-emerald-500'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {fmtCurrency(s.profitLoss)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="purple" size="sm">
                          {s.strategyName || '總體技術診斷'}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        {isSell ? (
                          <Badge variant="sell" size="sm" dot pulse>
                            建議賣出 / 出場
                          </Badge>
                        ) : isBuy ? (
                          <Badge variant="buy" size="sm" dot pulse>
                            建議加碼 / 買進
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            建議續抱 / 觀望
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {s.reason}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onOpenChart(s)}
                          icon={BarChart3}
                          title="查看走勢圖"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* TAB 2, 3, 4: 未持股 Top 20 買進 / 賣出 / 全部訊號 */
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-6">排名 / 股票標的</th>
                  <th className="py-3.5 px-4">觸發策略模型</th>
                  <th className="py-3.5 px-4 text-right">最新收盤價</th>
                  <th className="py-3.5 px-4 text-right">建議委託價</th>
                  <th className="py-3.5 px-4">系統操作方向</th>
                  <th className="py-3.5 px-4">部位狀態</th>
                  <th className="py-3.5 px-6 text-right">線圖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((s, idx) => {
                  const isBuy = s.signalType === 'Buy';
                  const isSell = s.signalType === 'Sell';
                  const rank = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={`${s.stockCode}-${s.strategyName}-${s.signalType}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {rank}
                          </span>
                          <div
                            className="flex items-center gap-2 cursor-pointer group"
                            onClick={() => onOpenChart(s)}
                          >
                            <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 group-hover:underline">
                              {s.stockCode}
                            </span>
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                              {s.stockName}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="purple" size="sm">
                          {s.strategyName}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {s.lastClose?.toFixed(2) || '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-sky-600 dark:text-sky-400 font-semibold">
                        {(s.suggestedPrice || s.lastClose)?.toFixed(2) || '-'}
                      </td>

                      <td className="py-3.5 px-4">
                        {isBuy && (
                          <Badge variant="buy" size="sm" dot pulse>
                            🟢 最推薦買進
                          </Badge>
                        )}
                        {isSell && (
                          <Badge variant="sell" size="sm" dot pulse>
                            🔴 建議賣出 / 避開
                          </Badge>
                        )}
                        {!isBuy && !isSell && (
                          <Badge variant="neutral" size="sm">
                            ⚪ 觀望
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {s.isHolding ? (
                          <span className="text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                            目前持有中
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            未持有
                          </span>
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
              共 <b className="font-mono">{totalCount}</b> 筆項目 (第{' '}
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
