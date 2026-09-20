import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchStocks,
  getPortfolio,
  getLocalTracking,
  saveLocalTracking,
  fetchSnapshot,
} from '../api';
import localforage from 'localforage';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import {
  Search,
  Star,
  Sliders,
  BarChart3,
  Check,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function TrackingPage({ onOpenChart }) {
  const [data, setData] = useState({ items: [], columns: [], totalCount: 0 });
  const [allStocksCache, setAllStocksCache] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  // Column settings
  const [showColModal, setShowColModal] = useState(false);
  const [hiddenCols, setHiddenCols] = useState([]);

  useEffect(() => {
    fetchStocks().then(setAllStocksCache);
    localforage.getItem('twse_hidden_cols').then((val) => {
      if (val) setHiddenCols(val);
    });
  }, []);

  const load = useCallback(async () => {
    if (!allStocksCache.length) return;
    setLoading(true);

    try {
      const [trackingList, portfolioList] = await Promise.all([
        getLocalTracking(),
        getPortfolio(),
      ]);

      const pCodes = new Set(portfolioList.map((p) => p.stockCode));
      const tCodes = new Set(trackingList);

      let query = allStocksCache;
      if (search) {
        const term = search.toLowerCase();
        query = query.filter(
          (s) => s.code.includes(term) || s.name.includes(term)
        );
      }

      if (statusFilter === '2') query = query.filter((s) => pCodes.has(s.code));
      else if (statusFilter === '1')
        query = query.filter((s) => tCodes.has(s.code));
      else if (statusFilter === '0')
        query = query.filter((s) => !pCodes.has(s.code) && !tCodes.has(s.code));

      // Sort: Portfolio (2) -> Tracked (1) -> Untracked (0), then by code
      query.sort((a, b) => {
        const sA = pCodes.has(a.code) ? 2 : tCodes.has(a.code) ? 1 : 0;
        const sB = pCodes.has(b.code) ? 2 : tCodes.has(b.code) ? 1 : 0;
        if (sA !== sB) return sB - sA;
        return a.code.localeCompare(b.code);
      });

      const totalCount = query.length;
      const paged = query.slice((page - 1) * pageSize, page * pageSize);

      const codes = paged.map((s) => s.code);
      const snapshots = await fetchSnapshot(codes);

      const columns = ['收盤價', '成交量', 'MA20', 'RSI(14)'];
      const items = paged.map((s) => {
        const snap = snapshots.find((x) => x.stockCode === s.code);
        const status = pCodes.has(s.code) ? 2 : tCodes.has(s.code) ? 1 : 0;

        return {
          stockCode: s.code,
          stockName: s.name,
          status: status,
          metrics: {
            收盤價: snap?.close !== undefined ? snap.close.toFixed(2) : '-',
            成交量:
              snap?.volume !== undefined
                ? Number(snap.volume).toLocaleString()
                : '-',
            MA20: snap?.sma20 !== undefined ? snap.sma20.toFixed(2) : '-',
            'RSI(14)': snap?.rsi14 !== undefined ? snap.rsi14.toFixed(2) : '-',
          },
        };
      });

      setData({ items, columns, totalCount });
    } catch (err) {
      console.error('Failed to load tracking data', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize, allStocksCache]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const handleToggleTracking = async (stockCode, currentStatus) => {
    if (currentStatus === 2) return; // in portfolio
    let t = await getLocalTracking();
    if (currentStatus === 1) {
      t = t.filter((c) => c !== stockCode);
    } else {
      if (!t.includes(stockCode)) t.push(stockCode);
    }
    await saveLocalTracking(t);
    load();
  };

  const toggleCol = (col) => {
    const updated = hiddenCols.includes(col)
      ? hiddenCols.filter((c) => c !== col)
      : [...hiddenCols, col];
    setHiddenCols(updated);
    localforage.setItem('twse_hidden_cols', updated);
  };

  const totalCount = data.totalCount || 0;
  const items = data.items || [];
  const allColumns = data.columns || [];
  const visibleColumns = allColumns.filter((c) => !hiddenCols.includes(c));
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            自選監控行情
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            全市場股票快照、技術指標即時評估與自選關注清單
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowColModal(true)}
          icon={Sliders}
        >
          自訂技術指標欄位
        </Button>
      </div>

      {/* Main Filter & Table Card */}
      <Card>
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
            {[
              { id: '', label: '全部個股' },
              { id: '2', label: '💼 庫存中' },
              { id: '1', label: '⭐ 已追蹤' },
              { id: '0', label: '☆ 未關注' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-[#111827] text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="快速搜尋代碼或名稱..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border-none outline-none text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="py-20 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm">查無符合條件之股票標的</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-6">股票標的</th>
                  {visibleColumns.map((col) => (
                    <th key={col} className="py-3.5 px-4 text-right">
                      {col}
                    </th>
                  ))}
                  <th className="py-3.5 px-4">追蹤狀態</th>
                  <th className="py-3.5 px-6 text-right">線圖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((i) => {
                  const isInStock = i.status === 2;
                  const isTracked = i.status === 1;

                  return (
                    <tr
                      key={i.stockCode}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div
                          className="flex items-center gap-2.5 cursor-pointer group"
                          onClick={() => onOpenChart(i)}
                        >
                          <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 group-hover:underline">
                            {i.stockCode}
                          </span>
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {i.stockName}
                          </span>
                        </div>
                      </td>

                      {visibleColumns.map((c) => {
                        const val = i.metrics[c] || '-';
                        return (
                          <td
                            key={c}
                            className="py-3.5 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100"
                          >
                            {val}
                          </td>
                        );
                      })}

                      <td className="py-3.5 px-4">
                        {isInStock ? (
                          <Badge variant="buy" size="sm" dot>
                            💼 庫存中
                          </Badge>
                        ) : (
                          <button
                            onClick={() =>
                              handleToggleTracking(i.stockCode, i.status)
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                              isTracked
                                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white border border-transparent'
                            }`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isTracked ? 'fill-current' : ''
                              }`}
                            />
                            <span>{isTracked ? '已追蹤' : '加入自選'}</span>
                          </button>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onOpenChart(i)}
                          icon={BarChart3}
                          title="查看 K 線技術分析圖"
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
              共 <b className="font-mono">{totalCount}</b> 檔標的 (第{' '}
              <b className="font-mono">{page}</b> /{' '}
              <b className="font-mono">{totalPages}</b> 頁)
            </span>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border-none text-slate-900 dark:text-white outline-none"
            >
              <option value="10">每頁 10 筆</option>
              <option value="20">每頁 20 筆</option>
              <option value="50">每頁 50 筆</option>
            </select>
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

      {/* Column Visibility Modal */}
      <Modal
        isOpen={showColModal}
        onClose={() => setShowColModal(false)}
        title="自訂顯示技術指標欄位"
        subtitle="勾選欲在表格中檢視的行情指標"
        maxWidth="max-w-sm"
      >
        <div className="space-y-3">
          {allColumns.map((col) => {
            const isVisible = !hiddenCols.includes(col);
            return (
              <label
                key={col}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {col}
                </span>
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggleCol(col)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500"
                />
              </label>
            );
          })}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowColModal(false)}
            >
              完成設定
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
