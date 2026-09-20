import React, { useEffect, useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchPrices } from '../../api';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { sma, macd, rsi } from 'technicalindicators';
import { useTheme } from '../../context/ThemeContext';
import { fmtCurrency, fmtVolume, fmtPercent } from '../../utils/formatters';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  TrendingUp,
  Activity,
  Layers,
  BarChart2,
} from 'lucide-react';

dayjs.extend(isoWeek);

export default function StockChartModal({ stock, onClose, onMinimize }) {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [period, setPeriod] = useState('D'); // D, W, M
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Indicator visibility toggles
  const [showMA, setShowMA] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [showRSI, setShowRSI] = useState(false);

  // HUD ref for live crosshair inspection
  const hudRef = useRef(null);

  useEffect(() => {
    if (!stock) return;
    setLoading(true);
    const code = stock.code || stock.stockCode;
    fetchPrices(code)
      .then((res) => {
        if (Array.isArray(res)) {
          setData(res.sort((a, b) => new Date(a.date) - new Date(b.date)));
        } else {
          setData([]);
        }
      })
      .catch((err) => {
        console.error('Failed to load prices', err);
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [stock]);

  // Aggregate OHLCV data based on period (Day, Week, Month)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    let res = [];
    if (period === 'D') {
      res = data;
    } else {
      let currentGroup = null;
      let currentKey = null;

      data.forEach((d) => {
        if (d.open === 0 && d.close === 0 && d.high === 0 && d.low === 0) return;

        const date = dayjs(d.date);
        let key = '';
        if (period === 'W') {
          const w = date.isoWeek();
          let y = date.year();
          if (date.month() === 11 && w === 1) y++;
          if (date.month() === 0 && w > 50) y--;
          key = `${y}-W${w.toString().padStart(2, '0')}`;
        } else {
          key = date.format('YYYY-MM');
        }

        if (key !== currentKey) {
          if (currentGroup) res.push(currentGroup);
          currentKey = key;
          currentGroup = {
            date: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
          };
        } else {
          currentGroup.high = Math.max(currentGroup.high, d.high);
          currentGroup.low = Math.min(currentGroup.low, d.low);
          currentGroup.close = d.close;
          currentGroup.volume += d.volume;
          currentGroup.date = d.date;
        }
      });
      if (currentGroup) res.push(currentGroup);
    }

    const dates = res.map((d) => dayjs(d.date).format('YYYY-MM-DD'));
    // ECharts Candlestick format: [Open, Close, Lowest, Highest]
    const kData = res.map((d) => [d.open, d.close, d.low, d.high]);
    const volumes = res.map((d, i) => [i, d.volume, d.close >= d.open ? 1 : -1]);
    const closes = res.map((d) => d.close);

    // Moving Averages: MA5, MA20, MA60
    const calcMA = (p) => {
      if (closes.length < p) return Array(closes.length).fill('-');
      try {
        const result = sma({ period: p, values: closes });
        return [...Array(closes.length - result.length).fill('-'), ...result];
      } catch {
        return Array(closes.length).fill('-');
      }
    };

    const ma5 = calcMA(5);
    const ma20 = calcMA(20);
    const ma60 = calcMA(60);

    // MACD (12, 26, 9)
    let macdHist = Array(closes.length).fill(0);
    let macdLine = Array(closes.length).fill(0);
    let signalLine = Array(closes.length).fill(0);

    if (closes.length >= 26) {
      try {
        const macdResult = macd({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        const pad = closes.length - macdResult.length;
        macdHist = [...Array(pad).fill(0)];
        macdLine = [...Array(pad).fill(0)];
        signalLine = [...Array(pad).fill(0)];
        macdResult.forEach((m) => {
          macdHist.push(m.histogram || 0);
          macdLine.push(m.MACD || 0);
          signalLine.push(m.signal || 0);
        });
      } catch (e) {
        console.warn('MACD calc error', e);
      }
    }

    // RSI (14)
    let rsi14 = Array(closes.length).fill('-');
    if (closes.length >= 14) {
      try {
        const rsiResult = rsi({ period: 14, values: closes });
        rsi14 = [...Array(closes.length - rsiResult.length).fill('-'), ...rsiResult];
      } catch (e) {
        console.warn('RSI calc error', e);
      }
    }

    // Latest price info
    const last = res[res.length - 1] || {};
    const prev = res[res.length - 2] || {};
    const lastClose = last.close || 0;
    const prevClose = prev.close || lastClose;
    const diff = lastClose - prevClose;
    const diffPercent = prevClose ? (diff / prevClose) * 100 : 0;

    return {
      raw: res,
      dates,
      kData,
      volumes,
      ma5,
      ma20,
      ma60,
      macdHist,
      macdLine,
      signalLine,
      rsi14,
      last,
      diff,
      diffPercent,
    };
  }, [data, period]);

  if (!stock) return null;

  // Taiwan market colors
  const upColor = '#ef4444'; // Red for UP
  const downColor = '#10b981'; // Green for DOWN
  const bgColor = isDark ? '#0d121f' : '#ffffff';
  const cardBg = isDark ? '#111827' : '#ffffff';
  const gridBorder = isDark ? '#1e293b' : '#f1f5f9';
  const textMuted = isDark ? '#94a3b8' : '#64748b';

  // Compute grid layouts based on active secondary indicators
  const subGrids = [];
  if (showMACD) subGrids.push('macd');
  if (showRSI) subGrids.push('rsi');

  // Dynamic grid setup
  let klineHeight = '55%';
  let volHeight = '14%';
  let volTop = '60%';

  if (subGrids.length === 1) {
    klineHeight = '50%';
    volHeight = '13%';
    volTop = '55%';
  } else if (subGrids.length === 2) {
    klineHeight = '42%';
    volHeight = '11%';
    volTop = '46%';
  }

  const grids = [
    { left: '4%', right: '4%', top: '3%', height: klineHeight }, // 0: K-Line
    { left: '4%', right: '4%', top: volTop, height: volHeight }, // 1: Volume
  ];

  let currentSubTop = parseFloat(volTop) + parseFloat(volHeight) + 3;
  const subIndicatorHeight = '12%';

  subGrids.forEach((type) => {
    grids.push({
      left: '4%',
      right: '4%',
      top: `${currentSubTop}%`,
      height: subIndicatorHeight,
    });
    currentSubTop += parseFloat(subIndicatorHeight) + 3;
  });

  const xAxis = grids.map((g, idx) => ({
    type: 'category',
    data: chartData?.dates || [],
    gridIndex: idx,
    axisLine: { lineStyle: { color: gridBorder } },
    axisLabel: { show: idx === 0, color: textMuted, fontSize: 11 },
    axisTick: { show: idx === 0 },
    splitLine: { show: false },
  }));

  const yAxis = grids.map((g, idx) => ({
    scale: true,
    gridIndex: idx,
    splitArea: { show: false },
    splitLine: { lineStyle: { color: gridBorder, type: 'dashed' } },
    axisLabel: {
      show: true,
      color: textMuted,
      fontSize: 10,
      inside: true,
      formatter: idx === 1 ? (v) => fmtVolume(v) : (v) => v.toFixed(1),
    },
  }));

  const series = [];

  if (chartData) {
    // 1. Candlestick
    series.push({
      name: 'K線',
      type: 'candlestick',
      data: chartData.kData,
      xAxisIndex: 0,
      yAxisIndex: 0,
      itemStyle: {
        color: upColor,
        color0: downColor,
        borderColor: upColor,
        borderColor0: downColor,
      },
    });

    // 2. MA lines
    if (showMA) {
      series.push(
        {
          name: 'MA5',
          type: 'line',
          data: chartData.ma5,
          smooth: true,
          lineStyle: { width: 1.2, color: '#f59e0b' },
          symbol: 'none',
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: 'MA20',
          type: 'line',
          data: chartData.ma20,
          smooth: true,
          lineStyle: { width: 1.5, color: '#38bdf8' },
          symbol: 'none',
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: 'MA60',
          type: 'line',
          data: chartData.ma60,
          smooth: true,
          lineStyle: { width: 1.5, color: '#ec4899' },
          symbol: 'none',
          xAxisIndex: 0,
          yAxisIndex: 0,
        }
      );
    }

    // 3. Volume
    series.push({
      name: '成交量',
      type: 'bar',
      data: chartData.volumes,
      xAxisIndex: 1,
      yAxisIndex: 1,
      itemStyle: {
        color: (params) => (params.data[2] === 1 ? upColor : downColor),
      },
    });

    // 4. Sub indicators
    let subIdx = 2;
    if (showMACD) {
      series.push(
        {
          name: 'MACD',
          type: 'line',
          data: chartData.macdLine,
          xAxisIndex: subIdx,
          yAxisIndex: subIdx,
          lineStyle: { width: 1.2, color: '#38bdf8' },
          symbol: 'none',
        },
        {
          name: 'Signal',
          type: 'line',
          data: chartData.signalLine,
          xAxisIndex: subIdx,
          yAxisIndex: subIdx,
          lineStyle: { width: 1.2, color: '#f59e0b' },
          symbol: 'none',
        },
        {
          name: 'Histogram',
          type: 'bar',
          data: chartData.macdHist,
          xAxisIndex: subIdx,
          yAxisIndex: subIdx,
          itemStyle: {
            color: (params) => (params.data >= 0 ? upColor : downColor),
          },
        }
      );
      subIdx++;
    }

    if (showRSI) {
      series.push({
        name: 'RSI(14)',
        type: 'line',
        data: chartData.rsi14,
        xAxisIndex: subIdx,
        yAxisIndex: subIdx,
        lineStyle: { width: 1.2, color: '#a855f7' },
        symbol: 'none',
      });
      subIdx++;
    }
  }

  const option = chartData
    ? {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            lineStyle: { color: isDark ? '#475569' : '#cbd5e1', type: 'dashed' },
          },
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          padding: 0,
          formatter: function (params) {
            if (!hudRef.current || !params.length) return '';
            const date = params[0].axisValue;
            const kline = params.find((p) => p.seriesName === 'K線');
            const vol = params.find((p) => p.seriesName === '成交量');
            const ma5 = params.find((p) => p.seriesName === 'MA5');
            const ma20 = params.find((p) => p.seriesName === 'MA20');
            const ma60 = params.find((p) => p.seriesName === 'MA60');
            const macd = params.find((p) => p.seriesName === 'MACD');
            const rsiVal = params.find((p) => p.seriesName === 'RSI(14)');

            if (!kline) return '';
            const open = kline.data[1];
            const close = kline.data[2];
            const low = kline.data[3];
            const high = kline.data[4];
            const isUp = close >= open;
            const cColor = isUp ? upColor : downColor;

            hudRef.current.innerHTML = `
              <div class="flex items-center gap-3 text-xs flex-wrap font-mono">
                <span class="font-bold text-slate-900 dark:text-white">${date}</span>
                <span>開 <b style="color:${cColor}">${open.toFixed(2)}</b></span>
                <span>高 <b style="color:${cColor}">${high.toFixed(2)}</b></span>
                <span>低 <b style="color:${cColor}">${low.toFixed(2)}</b></span>
                <span>收 <b style="color:${cColor}">${close.toFixed(2)}</b></span>
                <span>量 <b>${vol ? fmtVolume(vol.data[1]) : '-'}</b></span>
                ${ma5 && ma5.data !== '-' ? `<span style="color:#f59e0b">MA5: ${Number(ma5.data).toFixed(2)}</span>` : ''}
                ${ma20 && ma20.data !== '-' ? `<span style="color:#38bdf8">MA20: ${Number(ma20.data).toFixed(2)}</span>` : ''}
                ${ma60 && ma60.data !== '-' ? `<span style="color:#ec4899">MA60: ${Number(ma60.data).toFixed(2)}</span>` : ''}
                ${macd && macd.data !== '-' ? `<span style="color:#38bdf8">MACD: ${Number(macd.data).toFixed(2)}</span>` : ''}
                ${rsiVal && rsiVal.data !== '-' ? `<span style="color:#a855f7">RSI: ${Number(rsiVal.data).toFixed(2)}</span>` : ''}
              </div>
            `;
            return '';
          },
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: grids,
        xAxis: xAxis,
        yAxis: yAxis,
        dataZoom: [
          { type: 'inside', xAxisIndex: grids.map((_, i) => i), start: 65, end: 100 },
          {
            show: true,
            xAxisIndex: grids.map((_, i) => i),
            type: 'slider',
            bottom: 6,
            height: 16,
            start: 65,
            end: 100,
            borderColor: gridBorder,
            backgroundColor: isDark ? '#111827' : '#f8fafc',
            fillerColor: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.2)',
          },
        ],
        series: series,
      }
    : {};

  const stockCode = stock.stockCode || stock.code;
  const stockName = stock.stockName || stock.name;

  return (
    <div
      className={`fixed z-50 flex flex-col bg-white/95 dark:bg-[#0a0e17]/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl transition-all duration-300 ${
        isFullscreen
          ? 'inset-0'
          : 'inset-4 md:inset-8 lg:inset-12 rounded-2xl overflow-hidden'
      }`}
    >
      {/* Top Header Bar */}
      <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xl font-black text-sky-600 dark:text-sky-400">
              {stockCode}
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {stockName}
            </span>
          </div>

          {chartData?.last && (
            <div className="hidden sm:flex items-baseline gap-2 ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
              <span className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {fmtCurrency(chartData.last.close, 2)}
              </span>
              <span
                className={`font-mono text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                  chartData.diff >= 0
                    ? 'text-rose-500 bg-rose-500/10'
                    : 'text-emerald-500 bg-emerald-500/10'
                }`}
              >
                {chartData.diff >= 0 ? '+' : ''}
                {chartData.diff.toFixed(2)} ({fmtPercent(chartData.diffPercent)})
              </span>
            </div>
          )}
        </div>

        {/* Center/Right Controls */}
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg p-0.5 bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">
            {[
              { id: 'D', label: '日線' },
              { id: 'W', label: '週線' },
              { id: 'M', label: '月線' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  period === p.id
                    ? 'bg-white dark:bg-sky-500 text-sky-600 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Indicator toggles */}
          <div className="hidden lg:flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
            <button
              onClick={() => setShowMA(!showMA)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showMA
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              均線 (MA)
            </button>
            <button
              onClick={() => setShowMACD(!showMACD)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showMACD
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              MACD
            </button>
            <button
              onClick={() => setShowRSI(!showRSI)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showRSI
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              RSI
            </button>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

          {/* Window action buttons */}
          <button
            onClick={onMinimize}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="縮小至右下角快速清單"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isFullscreen ? '還原視窗大小' : '全螢幕檢視'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="關閉視窗 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart Canvas Area with HUD */}
      <div className="flex-1 flex flex-col p-4 relative overflow-hidden">
        {/* Real-time Crosshair HUD info header */}
        <div
          ref={hudRef}
          className="h-8 px-2 flex items-center text-xs text-slate-400 overflow-x-auto border-b border-slate-100 dark:border-slate-800/80 mb-2 shrink-0"
        >
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Activity className="w-3.5 h-3.5 text-sky-500 animate-pulse" />
            移動游標於圖表上檢視開高低收與指標數值
          </span>
        </div>

        {/* ECharts Instance */}
        <div className="flex-1 relative w-full h-full min-h-[350px]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              <span className="text-xs text-slate-400">載入歷史報價數據中...</span>
            </div>
          ) : !chartData || chartData.dates.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm">
              查無此個股之交易歷史報價
            </div>
          ) : (
            <ReactECharts
              option={option}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
