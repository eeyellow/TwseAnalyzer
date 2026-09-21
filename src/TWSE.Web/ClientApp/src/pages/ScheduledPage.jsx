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
import BeginnerGuideBanner from '../components/common/BeginnerGuideBanner';
import SimulationReplayPanel from '../components/simulation/SimulationReplayPanel';
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
  Target,
  Sparkles,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Calendar,
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
  const [affinityView, setAffinityView] = useState('stocks'); // 'stocks' | 'universes' | 'industries'
  const [affinitySearch, setAffinitySearch] = useState('');
  const [customRunDate, setCustomRunDate] = useState('');

  // Loading actions
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Active Tab: 'holdings' | 'buys' | 'sells' | 'verification' | 'simulation' | 'all'
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

  const handleRunAnalysis = async (targetDate = null) => {
    const dateToRun = targetDate || customRunDate || null;
    setAnalyzing(true);
    toast.info(dateToRun ? `開始執行 ${dateToRun} 指定日期分析與自適應驗證...` : '開始執行全市場分析、歷史迴歸驗證與動態權重自適應...');
    try {
      const res = await runAnalysisJob(dateToRun);
      toast.success(res.message || '分析與自適應驗證完成！');
      await fetchReport();
    } catch (e) {
      toast.error(`分析失敗: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunVerification = async (targetDate = null) => {
    const dateToRun = targetDate || customRunDate || null;
    setVerifying(true);
    toast.info(dateToRun ? `重新結算 ${dateToRun} 歷史訊號勝率與模型權重...` : '重新結算所有歷史訊號實戰勝率與模型權重...');
    try {
      const res = await runVerificationJob(dateToRun);
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

        <div className="flex flex-wrap items-center gap-2">
          {/* 指定日期運算 (可選) */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d121f] text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-400 text-[11px] hidden sm:inline">指定日期:</span>
            <input
              type="date"
              value={customRunDate}
              onChange={(e) => setCustomRunDate(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
              title="留空則預設分析當前最新交易日"
            />
            {customRunDate && (
              <button
                type="button"
                onClick={() => setCustomRunDate('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1 text-xs"
                title="清除指定日期"
              >
                ✕
              </button>
            )}
          </div>

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
            onClick={() => handleRunAnalysis(customRunDate || null)}
            loading={analyzing}
            disabled={updating || analyzing || verifying}
            icon={Zap}
          >
            {customRunDate ? `分析指定日期 (${customRunDate})` : '立即手動運算'}
          </Button>
        </div>
      </div>

      {/* 新手快速指引橫幅 */}
      <BeginnerGuideBanner />

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
                setActiveTab('simulation');
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'simulation'
                  ? 'bg-white dark:bg-[#111827] text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              歷史滾動回放 (2020~2026)
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
                  <span>有效結算 / 總追蹤</span>
                  <Award className="w-4 h-4 text-sky-500" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {verificationSummary?.totalVerifiedSignals || 0} /{' '}
                  {verificationSummary?.totalTrackedSignals || 0} 筆
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  近 60 日真實市場每日逐筆結算
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>純化實戰勝率 (T+1)</span>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-500">
                  {fmtPercent(
                    (verificationSummary?.overallWinRate1D || 0) * 100
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  含噪全市場勝率：
                  <span className="font-mono font-medium ml-1">
                    {fmtPercent(
                      (verificationSummary?.rawWinRate1D || 0) * 100
                    )}
                  </span>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>低量與噪聲股隔離保護</span>
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-xl font-bold font-mono text-purple-500">
                  {verificationSummary?.filteredNoiseSignals || 0} 筆隔離
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  排除 20日均量 &lt; 300張與流動性枯竭股
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>閉環自適應權重</span>
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
                <span>各策略實戰表現與自適應權重</span>
                <span className="text-xs font-normal text-slate-400">
                  （以純化數據計算動態權重，保護優質策略不被冷門殭屍股拖垮）
                </span>
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">策略模型名稱</th>
                      <th className="py-3 px-4 text-right">純化有效樣本</th>
                      <th className="py-3 px-4 text-right">隔離噪聲筆數</th>
                      <th className="py-3 px-4 text-right">純化實戰勝率</th>
                      <th className="py-3 px-4 text-right">原始全市場勝率</th>
                      <th className="py-3 px-4 text-right">盈虧比</th>
                      <th className="py-3 px-4 text-center">專屬股票池</th>
                      <th className="py-3 px-4 text-center">
                        動態權重乘數
                      </th>
                      <th className="py-3 px-4">調度狀態</th>
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
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {sm.cleanSignals || sm.verifiedSignals}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-purple-500">
                            {sm.noiseCount || 0}
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
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            {fmtPercent((sm.rawWinRate || sm.winRate) * 100)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sm.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <Badge variant="neutral" size="xs">
                              {sm.dedicatedUniverseCount || 0} 檔
                            </Badge>
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

            {/* Multi-Strategy Stock & Industry Affinity Matrix */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-500" />
                    <span>多策略 × 個股與族群最適投資組合矩陣</span>
                    <Badge variant="buy" size="xs">
                      個股專屬適配非萬用
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    打破「全市場單一策略」局限，針對不同股票與產業特性訓練最適組合，並過濾冷門噪聲股
                  </p>
                </div>

                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 self-start md:self-auto">
                  <button
                    onClick={() => setAffinityView('stocks')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                      affinityView === 'stocks'
                        ? 'bg-white dark:bg-[#111827] text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    個股專屬最適策略 ({verificationSummary?.topStockAffinities?.length || 0})
                  </button>

                  <button
                    onClick={() => setAffinityView('universes')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                      affinityView === 'universes'
                        ? 'bg-white dark:bg-[#111827] text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    策略專屬高勝率股票池
                  </button>

                  <button
                    onClick={() => setAffinityView('industries')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                      affinityView === 'industries'
                        ? 'bg-white dark:bg-[#111827] text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    產業族群適配分佈 ({verificationSummary?.industryAffinities?.length || 0})
                  </button>
                </div>
              </div>

              {/* View 1: 個股專屬策略適配表 */}
              {affinityView === 'stocks' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={affinitySearch}
                        onChange={(e) => setAffinitySearch(e.target.value)}
                        placeholder="搜尋代碼、名稱、產業或策略..."
                        className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      顯示歷史驗證適配評分 Top 標的
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                        <tr>
                          <th className="py-2.5 px-4">股票標的</th>
                          <th className="py-2.5 px-4">所屬產業</th>
                          <th className="py-2.5 px-4">專屬適配策略</th>
                          <th className="py-2.5 px-4 text-right">驗證樣本</th>
                          <th className="py-2.5 px-4 text-right">實戰勝率</th>
                          <th className="py-2.5 px-4 text-right">平均報酬</th>
                          <th className="py-2.5 px-4 text-right">盈虧比</th>
                          <th className="py-2.5 px-4 text-center">適配評級</th>
                          <th className="py-2.5 px-4 text-center">專屬推薦池</th>
                          <th className="py-2.5 px-4 text-right">線圖</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(verificationSummary?.topStockAffinities || [])
                          .filter((a) => {
                            if (!affinitySearch) return true;
                            const q = affinitySearch.toLowerCase();
                            return (
                              a.stockCode.toLowerCase().includes(q) ||
                              a.stockName.toLowerCase().includes(q) ||
                              a.industry.toLowerCase().includes(q) ||
                              a.strategyName.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 30)
                          .map((a) => (
                            <tr
                              key={`${a.stockCode}_${a.strategyName}`}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                            >
                              <td className="py-2.5 px-4">
                                <span className="font-mono font-bold text-sky-600 dark:text-sky-400 mr-1.5">
                                  {a.stockCode}
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {a.stockName}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-500">
                                {a.industry || '-'}
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                {a.strategyName}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono">
                                {a.sampleCount} 筆
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold">
                                <span
                                  className={
                                    a.winRate >= 0.5
                                      ? 'text-emerald-500'
                                      : 'text-rose-500'
                                  }
                                >
                                  {fmtPercent(a.winRate * 100)}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono">
                                {fmtPercent(a.avgReturn1D * 100)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono">
                                {a.profitFactor.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                {a.fitLevel === 'Optimal' && (
                                  <Badge variant="buy" size="xs">
                                    🚀 黃金適配
                                  </Badge>
                                )}
                                {a.fitLevel === 'Good' && (
                                  <Badge variant="neutral" size="xs">
                                    ✨ 良好適配
                                  </Badge>
                                )}
                                {a.fitLevel === 'Mismatched' && (
                                  <Badge variant="sell" size="xs">
                                    ⚠️ 嚴重不相容
                                  </Badge>
                                )}
                                {a.fitLevel === 'Evaluating' && (
                                  <Badge variant="neutral" size="xs">
                                    ⏳ 樣本累積中
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                {a.isRecommendedUniverse ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    納入加權
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    標準
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  icon={BarChart3}
                                  onClick={() => onOpenChart(a.stockCode)}
                                >
                                  看線圖
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* View 2: 策略專屬高勝率股票池 */}
              {affinityView === 'universes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(verificationSummary?.strategyMetrics || []).map((sm) => {
                    const pool = (
                      verificationSummary?.topStockAffinities || []
                    ).filter(
                      (a) =>
                        a.strategyName.toLowerCase() ===
                          sm.strategyName.toLowerCase() &&
                        a.isRecommendedUniverse
                    );

                    const avgWin =
                      pool.length > 0
                        ? pool.reduce((acc, x) => acc + x.winRate, 0) /
                          pool.length
                        : sm.winRate;

                    return (
                      <div
                        key={sm.strategyName}
                        className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-amber-500" />
                              <span>{sm.strategyName}</span>
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              專屬標的池：{pool.length} 檔，池內平均勝率{' '}
                              <span className="font-bold text-emerald-500">
                                {fmtPercent(avgWin * 100)}
                              </span>
                            </p>
                          </div>
                          <Badge variant="buy" size="xs">
                            專屬池加成 x1.5
                          </Badge>
                        </div>

                        {pool.length === 0 ? (
                          <p className="text-xs text-slate-400 py-3 text-center">
                            尚無足夠樣本建立專屬推薦池，目前採用全市場標準運行
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {pool.map((p) => (
                              <button
                                key={p.stockCode}
                                onClick={() => onOpenChart(p.stockCode)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1 border border-slate-200/60 dark:border-slate-700/60"
                              >
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {p.stockCode}
                                </span>
                                <span>{p.stockName}</span>
                                <span className="text-[10px] text-emerald-500 font-mono font-semibold ml-0.5">
                                  {fmtPercent(p.winRate * 100)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View 3: 產業族群適配分佈 */}
              {affinityView === 'industries' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">產業族群名稱</th>
                        <th className="py-2.5 px-4">策略模型</th>
                        <th className="py-2.5 px-4 text-right">累積驗證樣本</th>
                        <th className="py-2.5 px-4 text-right">族群勝率</th>
                        <th className="py-2.5 px-4 text-right">平均報酬</th>
                        <th className="py-2.5 px-4 text-right">盈虧比</th>
                        <th className="py-2.5 px-4 text-center">產業適配建議</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(verificationSummary?.industryAffinities || []).map((ia) => (
                        <tr
                          key={`${ia.industry}_${ia.strategyName}`}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                            {ia.industry}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                            {ia.strategyName}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {ia.sampleCount} 筆
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold">
                            <span
                              className={
                                ia.winRate >= 0.5
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                              }
                            >
                              {fmtPercent(ia.winRate * 100)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {fmtPercent(ia.avgReturn1D * 100)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {ia.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {ia.fitRecommendation === 'HighlySuitable' && (
                              <Badge variant="buy" size="xs">
                                🚀 高度適合 (優先加權)
                              </Badge>
                            )}
                            {ia.fitRecommendation === 'Suitable' && (
                              <Badge variant="neutral" size="xs">
                                ✨ 適合 (標準運行)
                              </Badge>
                            )}
                            {ia.fitRecommendation === 'Caution' && (
                              <Badge variant="sell" size="xs">
                                ⚠️ 警惕 (易假突破/回撤大)
                              </Badge>
                            )}
                            {ia.fitRecommendation === 'Neutral' && (
                              <Badge variant="neutral" size="xs">
                                觀察中
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
        ) : activeTab === 'simulation' ? (
          /* TAB: 歷史滾動回放引擎 (Walk-Forward Replay 2020~2026) */
          <SimulationReplayPanel onOpenChart={onOpenChart} />
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
