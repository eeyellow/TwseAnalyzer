import React, { useEffect, useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchPrices } from './api';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { sma, macd, ema } from 'technicalindicators';

dayjs.extend(isoWeek);

export default function StockChartModal({ stock, onClose, onMinimize }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [period, setPeriod] = useState('D'); // D, W, M
    const infoRef = useRef(null);

    useEffect(() => {
        if (!stock) return;
        setLoading(true);
        fetchPrices(stock.code || stock.stockCode) // Fetch all available history
            .then(res => {
                setData(res.sort((a, b) => new Date(a.date) - new Date(b.date)));
            })
            .finally(() => setLoading(false));
    }, [stock]);

    // Handle OHLCV aggregation
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return null;

        let res = [];
        if (period === 'D') {
            res = data;
        } else {
            // Aggregate to Weekly or Monthly
            let currentGroup = null;
            let currentKey = null;

            data.forEach(d => {
                // Skip days with no trading volume/prices if they are 0
                if (d.open === 0 && d.close === 0 && d.high === 0 && d.low === 0) return;

                const date = dayjs(d.date);
                let key = '';
                if (period === 'W') {
                    const w = date.isoWeek();
                    let y = date.year();
                    // If month is December but week is 1, it belongs to next year's week 1
                    if (date.month() === 11 && w === 1) y++;
                    // If month is January but week is > 50, it belongs to previous year's last week
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
                        volume: d.volume
                    };
                } else {
                    currentGroup.high = Math.max(currentGroup.high, d.high);
                    currentGroup.low = Math.min(currentGroup.low, d.low);
                    currentGroup.close = d.close; // Last close
                    currentGroup.volume += d.volume;
                    currentGroup.date = d.date; // Keep end of period date
                }
            });
            if (currentGroup) res.push(currentGroup);
        }

        // Prepare arrays for ECharts
        const dates = res.map(d => dayjs(d.date).format('YYYY-MM-DD'));
        const kData = res.map(d => [d.open, d.close, d.low, d.high]); // Sequence for Echarts: [Open, Close, Low, High]
        const volumes = res.map((d, i) => [i, d.volume, d.close >= d.open ? 1 : -1]);

        const closes = res.map(d => d.close);

        // Tech Indicators
        const ma20 = [...Array(19).fill('-'), ...sma({ period: 20, values: closes })];
        const ma60 = [...Array(59).fill('-'), ...sma({ period: 60, values: closes })];

        // MACD
        const macdResult = macd({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });

        // Padding MACD to match length
        const macdPad = closes.length - macdResult.length;
        const macdHist = [...Array(macdPad).fill(0)];
        const macdLine = [...Array(macdPad).fill(0)];
        const signalLine = [...Array(macdPad).fill(0)];

        macdResult.forEach(m => {
            macdHist.push(m.histogram || 0);
            macdLine.push(m.MACD || 0);
            signalLine.push(m.signal || 0);
        });

        return { dates, kData, volumes, ma20, ma60, macdHist, macdLine, signalLine };
    }, [data, period]);

    if (!stock) return null;

    const option = chartData ? {
        backgroundColor: 'var(--bg-card)',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            padding: 0,
            shadowColor: 'transparent',
            formatter: function (params) {
                if (!infoRef.current || !params.length) return '';
                let date = params[0].axisValue;
                let kline = params.find(p => p.seriesName === 'K線');
                let vol = params.find(p => p.seriesName === '成交量');
                let ma20 = params.find(p => p.seriesName === 'MA20');
                let ma60 = params.find(p => p.seriesName === 'MA60');
                let macdLine = params.find(p => p.seriesName === 'MACD (12,26,9)');
                let signalLine = params.find(p => p.seriesName === 'Signal');
                let hist = params.find(p => p.seriesName === 'Histogram');

                if (!kline) return '';
                let open = kline.data[1];
                let close = kline.data[2];
                let low = kline.data[3];
                let high = kline.data[4];
                let color = close >= open ? '#ff333a' : '#00ab5e';

                let html = `
                  <div style="display: flex; gap: 16px; font-size: 0.9rem; align-items: center; width: 100%; flex-wrap: wrap;">
                    <div style="font-weight: bold; color: var(--text-primary);">${date}</div>
                    <div style="color: var(--text-muted)">開: <span style="color: ${color}; font-weight: 500;">${open.toFixed(2)}</span></div>
                    <div style="color: var(--text-muted)">高: <span style="color: ${color}; font-weight: 500;">${high.toFixed(2)}</span></div>
                    <div style="color: var(--text-muted)">低: <span style="color: ${color}; font-weight: 500;">${low.toFixed(2)}</span></div>
                    <div style="color: var(--text-muted)">收: <span style="color: ${color}; font-weight: 500;">${close.toFixed(2)}</span></div>
                    <div style="color: var(--text-muted)">量: <span style="color: var(--text-primary); font-weight: 500;">${vol ? vol.data[1].toLocaleString() : 0}</span></div>
                    ${ma20 && ma20.data !== '-' ? `<div style="color: #2196f3; font-weight: 500;">MA20: ${Number(ma20.data).toFixed(2)}</div>` : ''}
                    ${ma60 && ma60.data !== '-' ? `<div style="color: #ffc107; font-weight: 500;">MA60: ${Number(ma60.data).toFixed(2)}</div>` : ''}
                    ${macdLine && macdLine.data !== '-' ? `<div style="color: #065758; font-weight: 500;">MACD: ${Number(macdLine.data).toFixed(2)}</div>` : ''}
                    ${signalLine && signalLine.data !== '-' ? `<div style="color: #ff9800; font-weight: 500;">Signal: ${Number(signalLine.data).toFixed(2)}</div>` : ''}
                    ${hist && hist.data !== '-' ? `<div style="color: ${hist.data >= 0 ? '#ff333a' : '#00ab5e'}; font-weight: 500;">Hist: ${Number(hist.data).toFixed(2)}</div>` : ''}
                  </div>
                `;
                infoRef.current.innerHTML = html;
                return '';
            }
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
            { left: '4%', right: '4%', top: '2%', height: '55%' }, // K-line
            { left: '4%', right: '4%', top: '62%', height: '15%' }, // Volume
            { left: '4%', right: '4%', top: '82%', height: '15%' }, // MACD
        ],
        xAxis: [
            { type: 'category', data: chartData.dates, gridIndex: 0, axisLine: { lineStyle: { color: '#ccc' } }, axisLabel: { color: 'var(--text-muted)' } },
            { type: 'category', data: chartData.dates, gridIndex: 1, axisLabel: { show: false }, axisTick: { show: false } },
            { type: 'category', data: chartData.dates, gridIndex: 2, axisLabel: { show: false }, axisTick: { show: false } },
        ],
        yAxis: [
            { scale: true, gridIndex: 0, splitArea: { show: false }, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: 'var(--text-muted)' } },
            { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
            { scale: true, gridIndex: 2, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1, 2], start: 70, end: 100 },
            { show: true, xAxisIndex: [0, 1, 2], type: 'slider', bottom: 10, start: 70, end: 100 }
        ],
        series: [
            {
                name: 'K線', type: 'candlestick',
                data: chartData.kData,
                xAxisIndex: 0, yAxisIndex: 0,
                itemStyle: {
                    color: '#ff333a', color0: '#00ab5e',
                    borderColor: '#ff333a', borderColor0: '#00ab5e'
                }
            },
            {
                name: 'MA20', type: 'line', data: chartData.ma20, smooth: true, lineStyle: { width: 1.5, color: '#2196f3' }, symbol: 'none'
            },
            {
                name: 'MA60', type: 'line', data: chartData.ma60, smooth: true, lineStyle: { width: 1.5, color: '#ffc107' }, symbol: 'none'
            },
            {
                name: '成交量', type: 'bar',
                data: chartData.volumes,
                xAxisIndex: 1, yAxisIndex: 1,
                itemStyle: {
                    color: (params) => params.data[2] === 1 ? '#ff333a' : '#00ab5e'
                }
            },
            {
                name: 'MACD (12,26,9)', type: 'line',
                data: chartData.macdLine,
                xAxisIndex: 2, yAxisIndex: 2,
                itemStyle: { color: '#065758' }, symbol: 'none'
            },
            {
                name: 'Signal', type: 'line',
                data: chartData.signalLine,
                xAxisIndex: 2, yAxisIndex: 2,
                itemStyle: { color: '#ff9800' }, symbol: 'none'
            },
            {
                name: 'Histogram', type: 'bar',
                data: chartData.macdHist,
                xAxisIndex: 2, yAxisIndex: 2,
                itemStyle: { color: (params) => params.data >= 0 ? '#ff333a' : '#00ab5e' }
            }
        ]
    } : {};

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', backdropFilter: 'blur(10px)'
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 24px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--color-sky)'
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <h2 style={{ margin: 0, color: 'var(--color-dark)', fontSize: '1.4rem' }}>{stock.stockName || stock.name}</h2>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{stock.stockCode || stock.code}</span>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="btn-group" style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', marginRight: 16 }}>
                        {['D', 'W', 'M'].map(p => (
                            <button key={p}
                                onClick={() => setPeriod(p)}
                                style={{
                                    padding: '4px 12px', border: 'none', cursor: 'pointer',
                                    backgroundColor: period === p ? 'var(--color-teal)' : 'var(--bg-card)',
                                    color: period === p ? '#fff' : 'var(--text-primary)',
                                    fontWeight: period === p ? 'bold' : 'normal'
                                }}>
                                {p === 'D' ? '日線' : p === 'W' ? '週線' : '月線'}
                            </button>
                        ))}
                    </div>

                    <button onClick={onMinimize} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-primary)' }}>_</button>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--red)' }}>✖</button>
                </div>
            </div>

            <div style={{ flex: 1, padding: '16px 24px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <div ref={infoRef} style={{ minHeight: 32, borderBottom: '1px dashed var(--border)', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>💡 請在圖表上移動游標以檢視詳細數據</span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    {loading ? (
                        <div className="spinner" style={{ top: '50%', left: '50%', position: 'absolute' }} />
                    ) : (
                        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />
                    )}
                </div>
            </div>
        </div>
    );
}
