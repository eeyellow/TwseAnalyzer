import React, { useState, useEffect } from 'react';
import {
  getPortfolio,
  getDailyReport,
  fetchSnapshot,
  fetchStocks,
} from '../api';
import {
  fmtCurrency,
  fmtPercent,
  fmtDate,
} from '../utils/formatters';
import StatCard from '../components/common/StatCard';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import {
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Sparkles,
  ChevronRight,
  AlertCircle,
  BarChart3,
  Search,
} from 'lucide-react';

export default function DashboardPage({ onOpenChart, onNavigate }) {
  const [portfolio, setPortfolio] = useState([]);
  const [signals, setSignals] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [snapshots, setSnapshots] = useState({});
  const [allStocks, setAllStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
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
      if (p && p.length > 0) {
        const snaps = await fetchSnapshot(p.map((x) => x.stockCode));
        const snapMap = {};
        snaps.forEach((s) => {
          snapMap[s.stockCode] = s.close;
        });
        setSnapshots(snapMap);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute portfolio metrics
  const totalCost = portfolio.reduce(
    (sum, p) => sum + p.avgCost * p.quantity,
    0
  );

  const totalValue = portfolio.reduce((sum, p) => {
    const currentPrice = snapshots[p.stockCode] || p.avgCost;
    return sum + currentPrice * p.quantity;
  }, 0);

  const totalPL = totalValue - totalCost;
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  const buySignals = signals.filter((s) => s.signalType === 'Buy');
  const sellSignals = signals.filter((s) => s.signalType === 'Sell');

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            儀表板總覽
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            即時監控持股現值、盤前策略訊號與資產分佈
          </p>
        </div>

        {reportDate && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" />
            <span>最新報告基準日：</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {fmtDate(reportDate)}
            </span>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="持股檔數"
          value={loading ? '...' : `${portfolio.length} 檔`}
          subtitle="現有庫存部位"
          icon={Wallet}
          iconColor="text-sky-500 bg-sky-500/10"
          loading={loading}
          extra={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onNavigate('portfolio')}
            >
              管理 →
            </Button>
          }
        />

        <StatCard
          title="投資組合市值"
          value={loading ? '...' : `NT$ ${fmtCurrency(totalValue)}`}
          subtitle={`成本 NT$ ${fmtCurrency(totalCost)}`}
          icon={PieChart}
          iconColor="text-indigo-500 bg-indigo-500/10"
          loading={loading}
        />

        <StatCard
          title="未實現總損益"
          value={
            loading
              ? '...'
              : `${totalPL >= 0 ? '+' : ''}${fmtCurrency(totalPL)}`
          }
          changePercent={fmtPercent(totalPLPercent)}
          trend={totalPL > 0 ? 'up' : totalPL < 0 ? 'down' : 'neutral'}
          subtitle="含手續費與證交稅估算"
          icon={totalPL >= 0 ? ArrowUpRight : ArrowDownRight}
          iconColor={
            totalPL >= 0
              ? 'text-rose-500 bg-rose-500/10'
              : 'text-emerald-500 bg-emerald-500/10'
          }
          loading={loading}
        />

        <StatCard
          title="盤前自動分析訊號"
          value={loading ? '...' : `${signals.length} 則`}
          icon={Sparkles}
          iconColor="text-amber-500 bg-amber-500/10"
          loading={loading}
          extra={
            <div className="flex items-center gap-1.5">
              <Badge variant="buy" size="sm" dot>
                買進 {buySignals.length}
              </Badge>
              <Badge variant="sell" size="sm" dot>
                賣出 {sellSignals.length}
              </Badge>
            </div>
          }
        />
      </div>

      {/* Main Content Grid: Top Signals & Holdings Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Actionable Daily Signals */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="今日盤前建議訊號"
            subtitle="系統定時針對全市場運算之買進/賣出訊號"
            action={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigate('scheduled')}
              >
                查看全部排程 ({signals.length}) →
              </Button>
            }
          >
            {loading ? (
              <div className="py-12 flex justify-center items-center">
                <div className="w-7 h-7 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              </div>
            ) : signals.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-60" />
                <p className="text-sm font-medium">今日未觸發任何買賣建議訊號</p>
                <p className="text-xs text-slate-500 mt-1">
                  可點擊上方「執行分析」重新對最新盤後數據運算
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 -mx-6 -my-4">
                {signals.slice(0, 5).map((s, idx) => {
                  const isBuy = s.signalType === 'Buy';
                  const stock = allStocks.find((x) => x.code === s.stockCode);
                  const name = stock?.name || s.stockName || '個股';

                  return (
                    <div
                      key={`${s.stockCode}-${s.strategyName}-${idx}`}
                      className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isBuy
                              ? 'bg-rose-500/15 text-rose-500 dark:text-rose-400'
                              : 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400'
                          }`}
                        >
                          {isBuy ? '買進' : '賣出'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() =>
                                onOpenChart({
                                  stockCode: s.stockCode,
                                  stockName: name,
                                })
                              }
                              className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                            >
                              {s.stockCode}
                            </span>
                            <span className="font-semibold text-sm text-slate-900 dark:text-white">
                              {name}
                            </span>
                            <Badge variant="neutral" size="sm">
                              {s.strategyName}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
                            <span>
                              建議價：
                              <b className="font-mono text-slate-700 dark:text-slate-300">
                                {s.suggestedPrice
                                  ? s.suggestedPrice.toFixed(2)
                                  : s.lastClose.toFixed(2)}
                              </b>
                            </span>
                            <span>
                              最新收盤：
                              <b className="font-mono text-slate-700 dark:text-slate-300">
                                {s.lastClose.toFixed(2)}
                              </b>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            onOpenChart({
                              stockCode: s.stockCode,
                              stockName: name,
                            })
                          }
                          icon={BarChart3}
                        >
                          技術線圖
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Top Holdings & Asset Weighting */}
        <div className="space-y-6">
          <Card
            title="主要持股權重"
            subtitle={`現有庫存共 ${portfolio.length} 檔個股`}
            action={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigate('portfolio')}
              >
                全部部位 →
              </Button>
            }
          >
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : portfolio.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-sm">尚未建立持股部位</p>
                <Button
                  variant="primary"
                  size="xs"
                  className="mt-3"
                  onClick={() => onNavigate('portfolio')}
                >
                  新增第一筆持股
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {portfolio
                  .slice()
                  .sort((a, b) => {
                    const valA =
                      (snapshots[a.stockCode] || a.avgCost) * a.quantity;
                    const valB =
                      (snapshots[b.stockCode] || b.avgCost) * b.quantity;
                    return valB - valA;
                  })
                  .slice(0, 5)
                  .map((p) => {
                    const price = snapshots[p.stockCode] || p.avgCost;
                    const val = price * p.quantity;
                    const cost = p.avgCost * p.quantity;
                    const pl = val - cost;
                    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
                    const weight = totalValue > 0 ? (val / totalValue) * 100 : 0;

                    return (
                      <div key={p.stockCode} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() =>
                                onOpenChart({
                                  stockCode: p.stockCode,
                                  stockName: p.stockName,
                                })
                              }
                              className="font-mono font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                            >
                              {p.stockCode}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {p.stockName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {weight.toFixed(1)}%
                            </span>
                            <span
                              className={`font-mono text-[11px] font-semibold ${
                                pl >= 0
                                  ? 'text-rose-500'
                                  : 'text-emerald-500'
                              }`}
                            >
                              {pl >= 0 ? '+' : ''}
                              {plPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(2, weight))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
