import React, { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio,
  getDailyReport,
  fetchStocks,
  runUpdateJob,
  runAnalysisJob,
  getVerificationSummary,
  getVerificationHistory,
  runVerificationJob,
} from '../api';
import { fmtCurrency, fmtDate, fmtPercent } from '../utils/formatters';
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
  BrainCircuit,
  Award,
  Sliders,
  CheckCircle2,
  XCircle,
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

  // Verification & Adaptive Learning State
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [verificationHistory, setVerificationHistory] = useState([]);
  const [verifying, setVerifying] = useState(false);

  // Loading actions
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Active Tab: 'holdings' | 'buys' | 'sells' | 'verification' | 'all'
  const [activeTab, setActiveTab] = useState('holdings');

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [p, report, stocks, vSummary, vHistory] = await Promise.all([
        getPortfolio(),
        getDailyReport(),
        fetchStocks(),
        getVerificationSummary(60).catch(() => null),
        getVerificationHistory(100).catch(() => []),
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
      if (vSummary) setVerificationSummary(vSummary);
      if (vHistory) setVerificationHistory(vHistory);
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
    toast.info('開始執行全市場分析、歷史迴歸驗證與動態權重自適應...');
    try {
      const res = await runAnalysisJob();
      toast.success(res.message || '分析與自適應驗證完成！');
      await fetchReport();
    } catch (e) {
      toast.error(`分析失敗: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunVerification = async () => {
    setVerifying(true);
    toast.info('重新結算所有歷史訊號實戰勝率與模型權重...');
    try {
      const res = await runVerificationJob();
      toast.success(res.message || '迴歸驗證與模型權重更新完成！');
      if (res.summary) setVerificationSummary(res.summary);
      const vHistory = await getVerificationHistory(100);
      setVerificationHistory(vHistory || []);
    } catch (e) {
      toast.error(`驗證失敗: ${e.message}`);
    } finally {
      setVerifying(false);
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
  } else if (activeTab === 'verification') {
    currentList = verificationHistory;
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
        ...verificationHistory.map((s) => s.strategyName),
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
              每日盤前策略分析與自適應學習
            </h1>
            {reportDate && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                基準日：{fmtDate(reportDate)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 mt-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>
              定時排程：每天晚上 20:00 (8:00 PM) 自動執行全盤分析與次日迴歸驗證
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunUpdate}
            loading={updating}
            disabled={updating || analyzing || verifying}
            icon={RefreshCw}
          >
            更新收盤報價
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAnalysis}
            loading={analyzing}
            disabled={updating || analyzing || verifying}
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
                setActiveTab('verification');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'verification'
                  ? 'bg-white dark:bg-[#111827] text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />
              迴歸驗證與自適應學習 ({verificationHistory.length})
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
        ) : activeTab === 'verification' ? (
          /* TAB: 迴歸驗證與模型自適應學習面板 */
          <div className="space-y-6">
            {/* Top Verification Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>歷史訊號結算總數</span>
                  <Award className="w-4 h-4 text-sky-500" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {verificationSummary?.totalVerifiedSignals || 0} /{' '}
                  {verificationSummary?.totalTrackedSignals || 0} 筆
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  最近 60 日全市場真實追蹤
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>T+1 隔日沖勝率</span>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-500">
                  {fmtPercent(
                    (verificationSummary?.overallWinRate1D || 0) * 100
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  次日平均報酬率：
                  <span className="font-mono font-medium ml-1">
                    {fmtPercent(
                      (verificationSummary?.overallAvgReturn1D || 0) * 100
                    )}
                  </span>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>T+3 短波段勝率</span>
                  <BrainCircuit className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-xl font-bold font-mono text-purple-500">
                  {fmtPercent(
                    (verificationSummary?.overallWinRate3D || 0) * 100
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  3日平均報酬率：
                  <span className="font-mono font-medium ml-1">
                    {fmtPercent(
                      (verificationSummary?.overallAvgReturn3D || 0) * 100
                    )}
                  </span>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>閉環自適應優化</span>
                  <Sliders className="w-4 h-4 text-amber-500" />
                </div>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="xs"
                    className="w-full"
                    onClick={handleRunVerification}
                    loading={verifying}
                    icon={RefreshCw}
                  >
                    重新計算模型動態權重
                  </Button>
                </div>
              </div>
            </div>

            {/* Strategy Weights Table */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>各策略組合實戰表現與自適應權重</span>
                <span className="text-xs font-normal text-slate-400">
                  （系統根據近期實戰勝率自動調升或調降策略在 Top 20 的排序權重）
                </span>
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">策略模型名稱</th>
                      <th className="py-3 px-4 text-right">追蹤訊號</th>
                      <th className="py-3 px-4 text-right">已結算筆數</th>
                      <th className="py-3 px-4 text-right">T+1 實戰勝率</th>
                      <th className="py-3 px-4 text-right">T+1 平均報酬</th>
                      <th className="py-3 px-4 text-right">盈虧比</th>
                      <th className="py-3 px-4 text-center">
                        動態自適應權重乘數
                      </th>
                      <th className="py-3 px-4">模型調度狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(verificationSummary?.strategyMetrics || []).map((sm) => {
                      const isHigh = sm.adaptiveWeight > 1.0;
                      const isLow = sm.adaptiveWeight < 1.0;

                      return (
                        <tr
                          key={sm.strategyName}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                            {sm.strategyName}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sm.totalSignals}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sm.verifiedSignals}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            <span
                              className={
                                sm.winRate >= 0.5
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                              }
                            >
                              {fmtPercent(sm.winRate * 100)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {fmtPercent(sm.avgReturn1D * 100)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sm.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                isHigh
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : isLow
                                  ? 'bg-rose-500/10 text-rose-500'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              }`}
                            >
                              x{sm.adaptiveWeight.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {sm.statusRecommendation === 'ScaledUp' && (
                              <Badge variant="buy" size="sm">
                                🚀 自動加權擴大
                              </Badge>
                            )}
                            {sm.statusRecommendation === 'Demoted' && (
                              <Badge variant="sell" size="sm">
                                ⚠️ 自動降權觀察
                              </Badge>
                            )}
                            {sm.statusRecommendation === 'Hibernating' && (
                              <Badge variant="sell" size="sm">
                                ❄️ 暫停休眠冷卻
                              </Badge>
                            )}
                            {sm.statusRecommendation === 'Active' && (
                              <Badge variant="neutral" size="sm">
                                正常運算
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical Verification Track Log */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
                <span>歷史訊號逐筆迴歸驗證軌跡 (前 100 筆)</span>
                <span className="text-xs font-normal text-slate-400">
                  比對每日分析當初推薦價與後續真實市場走勢
                </span>
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">訊號日期</th>
                      <th className="py-3 px-4">股票標的</th>
                      <th className="py-3 px-4">方向</th>
                      <th className="py-3 px-4">觸發策略</th>
                      <th className="py-3 px-4 text-right">推薦進場價</th>
                      <th className="py-3 px-4 text-right">T+1 收盤價</th>
                      <th className="py-3 px-4 text-right">T+1 實際報酬</th>
                      <th className="py-3 px-4 text-right">T+3 報酬</th>
                      <th className="py-3 px-4 text-center">實戰驗證結果</th>
                      <th className="py-3 px-4 text-right">線圖</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paged.map((item) => {
                      const isWin = item.isWin === 1;
                      const hasReturn = item.return1D !== null;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {item.signalDate}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-sky-600 dark:text-sky-400 mr-1.5">
                              {item.stockCode}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {item.stockName}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {item.signalType === 'Buy' ? (
                              <Badge variant="buy" size="xs">
                                買進
                              </Badge>
                            ) : (
                              <Badge variant="sell" size="xs">
                                賣出
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {item.strategyName}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {item.entryPrice?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {item.nextClose?.toFixed(2) || '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {hasReturn ? (
                              <span
                                className={
                                  (item.return1D || 0) >= 0
                                    ? 'text-emerald-500'
                                    : 'text-rose-500'
                                }
                              >
                                {fmtPercent((item.return1D || 0) * 100)}
                              </span>
                            ) : (
                              <span className="text-slate-400">待次日結算</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {item.return3D !== null
                              ? fmtPercent((item.return3D || 0) * 100)
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!hasReturn ? (
                              <Badge variant="neutral" size="xs">
                                ⏳ 驗證中
                              </Badge>
                            ) : isWin ? (
                              <Badge variant="buy" size="xs">
                                 獲利命中
                              </Badge>
                            ) : (
                              <Badge variant="sell" size="xs">
                                ❌ 停損/失準
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onOpenChart(item)}
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
            </div>
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
          /* TAB 2, 3, 5: 未持股 Top 20 買進 / 賣出 / 全部訊號 */
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
