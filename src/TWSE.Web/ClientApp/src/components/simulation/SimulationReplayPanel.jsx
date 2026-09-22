import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import {
  startSimulation,
  getSimulationStatus,
  getSimulationSummary,
  cancelSimulation,
} from '../../api';
import Button from '../common/Button';
import {
  Play,
  Square,
  RefreshCw,
  Calendar,
  TrendingUp,
  Layers,
  ShieldCheck,
  Award,
  Clock,
  BarChart3,
} from 'lucide-react';

export default function SimulationReplayPanel({ onOpenChart }) {
  const { isDark } = useTheme();
  const toast = useToast();

  // Range Form
  const [startDate, setStartDate] = useState('2020-01-01');
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [minVolume, setMinVolume] = useState(300);

  // Status & Progress State
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [viewTab, setViewTab] = useState('quarterly'); // 'quarterly' | 'strategies' | 'stocks' | 'industries'

  const pollTimerRef = useRef(null);

  // Initial Load: check if an existing simulation or completed report exists
  useEffect(() => {
    async function init() {
      try {
        const currentStatus = await getSimulationStatus().catch(() => null);
        if (currentStatus) setStatus(currentStatus);

        if (currentStatus?.status === 'Completed' || currentStatus?.status === 'Idle') {
          const latestSum = await getSimulationSummary().catch(() => null);
          if (latestSum) setSummary(latestSum);
        }
      } catch (err) {
        console.warn('Failed to load initial simulation state', err);
      }
    }
    init();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Polling loop when Running
  useEffect(() => {
    if (status?.status === 'Running') {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(async () => {
          try {
            const st = await getSimulationStatus();
            setStatus(st);
            if (st.status === 'Completed') {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              toast.success('歷史滾動回放模擬完成！');
              const sum = await getSimulationSummary();
              setSummary(sum);
            } else if (st.status === 'Failed') {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              toast.error(`模擬執行失敗: ${st.error || st.message}`);
            } else if (st.status === 'Cancelled') {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              toast.info('歷史回放已取消');
            }
          } catch (err) {
            console.error('Polling error', err);
          }
        }, 800);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [status?.status, toast]);

  // Quick Preset Handlers
  const handleSetPreset = (start, end, vol = 300) => {
    setStartDate(start);
    setEndDate(end);
    setMinVolume(vol);
  };

  const handleStart = async () => {
    try {
      const res = await startSimulation({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        min20dVolume: Number(minVolume),
      });
      setStatus(res);
      toast.success('已啟動歷史滾動回放模擬引擎！');
    } catch (err) {
      toast.error(`啟動失敗: ${err.message}`);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSimulation();
      toast.info('已發送終止請求...');
    } catch (err) {
      toast.error(`終止失敗: ${err.message}`);
    }
  };

  // ECharts Configuration for Quarterly Trends
  const chartOption = useMemo(() => {
    if (!summary || !summary.quarterlyTrends || summary.quarterlyTrends.length === 0) {
      return null;
    }

    const quarters = summary.quarterlyTrends.map((q) => q.quarter);
    const cleanWinRates = summary.quarterlyTrends.map((q) => q.cleanWinRate);
    const rawWinRates = summary.quarterlyTrends.map((q) => q.rawWinRate);
    const ret5D = summary.quarterlyTrends.map((q) => q.avgReturn5D);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: isDark ? '#334155' : '#cbd5e1',
        textStyle: { color: isDark ? '#e2e8f0' : '#1e293b' },
        formatter: (params) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const qData = summary.quarterlyTrends[idx];
          return `
            <div style="font-size: 12px; line-height: 1.5; min-width: 180px;">
              <div style="font-weight: bold; border-bottom: 1px solid ${isDark ? '#334155' : '#e2e8f0'}; padding-bottom: 4px; margin-bottom: 4px;">
                ${qData.quarter} 【${qData.marketTrend}】
              </div>
              <div>✨ 純化實戰勝率: <b style="color: #10b981;">${qData.cleanWinRate}%</b></div>
              <div>⚠️ 含噪原始勝率: <b style="color: #94a3b8;">${qData.rawWinRate}%</b></div>
              <div>📈 平均 5 日報酬: <b style="color: ${qData.avgReturn5D >= 0 ? '#10b981' : '#ef4444'};">${qData.avgReturn5D > 0 ? '+' : ''}${qData.avgReturn5D}%</b></div>
              <div>🎯 獲利因子 (盈虧比): <b>${qData.profitFactor}x</b></div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                有效訊號: ${qData.cleanSignals} 筆 | 隔離噪聲: ${qData.noiseSignals} 筆
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['純化實戰勝率 (%)', '含噪原始勝率 (%)', '平均 5 日報酬率 (%)'],
        textStyle: { color: isDark ? '#94a3b8' : '#475569', fontSize: 11 },
        top: 0,
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '8%',
        top: '14%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: quarters,
        axisLine: { lineStyle: { color: isDark ? '#334155' : '#cbd5e1' } },
        axisLabel: {
          color: isDark ? '#94a3b8' : '#64748b',
          fontSize: 11,
          rotate: quarters.length > 12 ? 40 : 0,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '勝率 (%)',
          min: 0,
          max: 100,
          position: 'left',
          axisLine: { show: true, lineStyle: { color: isDark ? '#334155' : '#cbd5e1' } },
          splitLine: { lineStyle: { color: isDark ? 'rgba(51, 65, 85, 0.4)' : '#f1f5f9' } },
          axisLabel: { color: isDark ? '#94a3b8' : '#64748b', formatter: '{value}%' },
        },
        {
          type: 'value',
          name: '5日報酬 (%)',
          position: 'right',
          axisLine: { show: true, lineStyle: { color: isDark ? '#334155' : '#cbd5e1' } },
          splitLine: { show: false },
          axisLabel: { color: isDark ? '#94a3b8' : '#64748b', formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: '純化實戰勝率 (%)',
          type: 'bar',
          data: cleanWinRates,
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0],
          },
          markLine: {
            data: [{ yAxis: 50, name: '損益平衡線 (50%)' }],
            lineStyle: { type: 'dashed', color: '#f59e0b', width: 1.5 },
            label: { formatter: '平衡線 50%', position: 'end', color: '#f59e0b', fontSize: 10 },
          },
        },
        {
          name: '含噪原始勝率 (%)',
          type: 'bar',
          data: rawWinRates,
          itemStyle: {
            color: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(203, 213, 225, 0.7)',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: '平均 5 日報酬率 (%)',
          type: 'line',
          yAxisIndex: 1,
          data: ret5D,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
        },
      ],
    };
  }, [summary, isDark]);

  const isRunning = status?.status === 'Running';

  return (
    <div className="space-y-6">
      {/* 1. Control & Date Range Panel */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                歷史滾動回放引擎（Walk-Forward Historical Replay）
              </h2>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                逐日閉環驗證
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              以歷史全市場真實數據，模擬「逐日產生訊號 ➔ 次日結算 ➔ 滾動調整適配矩陣」，檢驗策略在牛熊循環中的實戰勝率。
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <Button variant="danger" icon={Square} onClick={handleCancel}>
                終止回放
              </Button>
            ) : (
              <Button variant="primary" icon={Play} onClick={handleStart}>
                開始逐日回放模擬
              </Button>
            )}
          </div>
        </div>

        {/* Quick Presets & Custom Form */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              回測起始日 (支援 2020 至今)
            </label>
            <input
              type="date"
              disabled={isRunning}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              回測結束日
            </label>
            <input
              type="date"
              disabled={isRunning}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              冷門股噪聲過濾門檻 (20日均量)
            </label>
            <div className="relative">
              <input
                type="number"
                disabled={isRunning}
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
                min="0"
                step="50"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400">張</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              常用測試區間快捷鍵
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleSetPreset('2020-01-01', new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors"
              >
                🚀 2020至今 (推薦)
              </button>
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleSetPreset('2023-01-01', new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 transition-colors"
              >
                📈 近3年AI多頭
              </button>
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleSetPreset('2022-01-01', '2022-12-31')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-colors"
              >
                🌧️ 2022空頭考驗
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Running Progress Bar */}
        {isRunning && (
          <div className="mt-5 p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 animate-pulse">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                {status.message || '正在進行歷史滾動前向迴歸模擬...'}
              </span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                {status.progressPercentage}%
              </span>
            </div>

            {/* Progress Bar Track */}
            <div className="w-full h-2.5 bg-indigo-200/60 dark:bg-indigo-900/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${status.progressPercentage}%` }}
              />
            </div>

            {/* Detail Stats */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300 mt-2">
              <span>目前模擬交易日: <b>{status.currentDate || '初始化中'}</b></span>
              <span>已推進天數: <b>{status.processedTradingDays} / {status.totalTradingDays} 天</b></span>
              <span>已產出訊號: <b>{status.totalSignalsGenerated} 筆</b></span>
              <span>耗時: <b>{status.elapsedSeconds}s</b></span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Simulation Summary KPI Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Pure Clean Win Rate */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>純化實戰勝率 (T+1)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {summary.overallCleanWinRate}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                <span>含噪原始勝率:</span>
                <span className="line-through text-slate-400">{summary.overallRawWinRate}%</span>
                <span className="text-emerald-500 font-semibold">
                  +{(summary.overallCleanWinRate - summary.overallRawWinRate).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Total Signals & Clean Signals */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>有效實戰訊號數</span>
                <Layers className="w-4 h-4 text-sky-500" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                {summary.totalCleanSignals?.toLocaleString()} 筆
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                <span>已隔離冷門噪聲:</span>
                <span className="text-amber-500 font-medium">{summary.totalNoiseIsolated?.toLocaleString()} 筆</span>
              </div>
            </div>

            {/* Average 5D Return */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>平均 5 日波段報酬</span>
                <TrendingUp className="w-4 h-4 text-indigo-500" />
              </div>
              <div
                className={`text-xl sm:text-2xl font-bold ${
                  summary.overallAvgReturn5D >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                }`}
              >
                {summary.overallAvgReturn5D > 0 ? '+' : ''}{summary.overallAvgReturn5D}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                <span>1日均報酬:</span>
                <span>{summary.overallAvgReturn1D > 0 ? '+' : ''}{summary.overallAvgReturn1D}%</span>
              </div>
            </div>

            {/* Profit Factor */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>整體獲利因子 (盈虧比)</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary.overallProfitFactor}x
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                總獲利 / 總虧損比例
              </div>
            </div>

            {/* Verified Trading Days */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>回放歷經交易日</span>
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                {summary.totalTradingDays} 天
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                <span>運算總耗時:</span>
                <span>{summary.totalExecutionSeconds} 秒</span>
              </div>
            </div>
          </div>

          {/* 3. Quarterly Win-Rate Trend Interactive Chart */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  歷年逐季勝率與報酬走勢圖 (Quarterly Win Rate & Return Trends)
                </h3>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                綠色柱: 純化勝率 | 灰色柱: 原始含噪勝率 | 藍色折線: 5日報酬率
              </span>
            </div>

            {chartOption && (
              <div className="w-full h-80">
                <ReactECharts
                  option={chartOption}
                  style={{ width: '100%', height: '100%' }}
                  opts={{ renderer: 'svg' }}
                />
              </div>
            )}
          </div>

          {/* 4. Sub-view Tabs (Quarterly Table / Strategies / Top Affinities) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewTab('quarterly')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewTab === 'quarterly'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  📅 歷年逐季詳細數據
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('strategies')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewTab === 'strategies'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  ⚙️ 各策略歷史表現
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('stocks')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewTab === 'stocks'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  ⭐ 歷史最適天菜個股
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('industries')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewTab === 'industries'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  🏢 產業族群適配排行
                </button>
              </div>
            </div>

            {/* Tab 1: Quarterly Details Table */}
            {viewTab === 'quarterly' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">季度</th>
                      <th className="py-2.5 px-3">市場多空行情</th>
                      <th className="py-2.5 px-3 text-right">有效訊號</th>
                      <th className="py-2.5 px-3 text-right">隔離噪聲</th>
                      <th className="py-2.5 px-3 text-right">純化勝率</th>
                      <th className="py-2.5 px-3 text-right">含噪勝率</th>
                      <th className="py-2.5 px-3 text-right">平均5日報酬</th>
                      <th className="py-2.5 px-3 text-right">獲利因子</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {summary.quarterlyTrends.map((q) => (
                      <tr key={q.quarter} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                          {q.quarter}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {q.marketTrend}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                          {q.cleanSignals} 筆
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-500 font-medium">
                          {q.noiseSignals} 筆
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {q.cleanWinRate}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400 line-through">
                          {q.rawWinRate}%
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            q.avgReturn5D >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                          }`}
                        >
                          {q.avgReturn5D > 0 ? '+' : ''}{q.avgReturn5D}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                          {q.profitFactor}x
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: Strategy Performances */}
            {viewTab === 'strategies' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {summary.strategyPerformances.map((strat) => (
                  <div
                    key={strat.strategyName}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {strat.strategyName}
                        </h4>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            strat.winRate >= 60
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          動態加權: {strat.adaptiveWeight}x
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>純化實戰勝率:</span>
                          <strong className="text-emerald-600 dark:text-emerald-400">{strat.winRate}%</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>含噪原始勝率:</span>
                          <span className="text-slate-400 line-through">{strat.rawWinRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>總有效訊號:</span>
                          <span>{strat.cleanSignals} 筆 (隔離噪聲 {strat.noiseCount} 筆)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Top Stock Affinities */}
            {viewTab === 'stocks' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">個股</th>
                      <th className="py-2.5 px-3">產業</th>
                      <th className="py-2.5 px-3">最適策略</th>
                      <th className="py-2.5 px-3 text-right">觸發次數</th>
                      <th className="py-2.5 px-3 text-right">實戰勝率</th>
                      <th className="py-2.5 px-3 text-right">平均報酬</th>
                      <th className="py-2.5 px-3 text-right">適配評分</th>
                      <th className="py-2.5 px-3 text-center">評級標籤</th>
                      <th className="py-2.5 px-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {summary.topStockAffinities.slice(0, 30).map((a) => (
                      <tr key={`${a.stockCode}_${a.strategyName}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                          {a.stockCode} {a.stockName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{a.industry || '-'}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                          {a.strategyName}
                        </td>
                        <td className="py-2.5 px-3 text-right">{a.sampleCount} 次</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {a.winRate}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                          {a.avgReturn1D > 0 ? '+' : ''}{a.avgReturn1D}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                          {a.affinityScore}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              a.fitLevel === 'Optimal'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                            }`}
                          >
                            {a.fitLevel === 'Optimal' ? '⭐ 黃金天菜' : '良好適配'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onOpenChart?.({ stockCode: a.stockCode, stockName: a.stockName })}
                            className="p-1 rounded text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/50"
                            title="開啟K線圖"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 4: Industry Affinities */}
            {viewTab === 'industries' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {summary.industryAffinities.map((ind) => (
                  <div
                    key={`${ind.industry}_${ind.strategyName}`}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-slate-800 dark:text-white">
                        {ind.industry}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          ind.fitRecommendation === 'HighlySuitable'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {ind.fitRecommendation === 'HighlySuitable' ? '強烈適配' : '普通相容'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>適配策略:</span>
                        <strong className="text-slate-700 dark:text-slate-300">{ind.strategyName}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>歷史勝率:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">{ind.winRate}%</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>樣本筆數:</span>
                        <span>{ind.sampleCount} 筆</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
