import React, { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio,
  savePortfolioItem,
  deletePortfolioItem,
  fetchStrategies,
  fetchStocks,
  fetchSnapshot,
} from '../api';
import {
  fmtCurrency,
  fmtPercent,
} from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  Plus,
  Edit2,
  Trash2,
  BarChart3,
  Search,
  Wallet,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

export default function PortfolioPage({ onOpenChart }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [form, setForm] = useState({
    stockCode: '',
    stockName: '',
    quantity: 1000,
    avgCost: 0,
    selectedStrategy: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredStocks, setFilteredStocks] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, strats, stocks] = await Promise.all([
        getPortfolio(),
        fetchStrategies(),
        fetchStocks(),
      ]);
      setItems(p || []);
      setStrategies(strats || []);
      setAllStocks(stocks || []);

      if (p && p.length > 0) {
        const snaps = await fetchSnapshot(p.map((x) => x.stockCode));
        const snapMap = {};
        snaps.forEach((s) => {
          snapMap[s.stockCode] = s.close;
        });
        setSnapshots(snapMap);
      }
    } catch (err) {
      toast.error(`讀取庫存失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setForm({
      stockCode: '',
      stockName: '',
      quantity: 1000,
      avgCost: 0,
      selectedStrategy: '',
    });
    setSearchTerm('');
    setFilteredStocks([]);
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item) => {
    setForm({
      stockCode: item.stockCode,
      stockName: item.stockName,
      quantity: item.quantity,
      avgCost: item.avgCost,
      selectedStrategy: item.selectedStrategy || '',
    });
    setSearchTerm(`${item.stockCode} ${item.stockName}`);
    setShowModal(true);
  };

  // Search stocks in modal
  const handleStockSearch = (val) => {
    setSearchTerm(val);
    if (!val.trim()) {
      setFilteredStocks([]);
      return;
    }
    const q = val.toLowerCase().trim();
    const matched = allStocks
      .filter((s) => s.code.includes(q) || s.name.includes(q))
      .slice(0, 8);
    setFilteredStocks(matched);
  };

  const handleSelectStock = (stock) => {
    setForm((f) => ({
      ...f,
      stockCode: stock.code,
      stockName: stock.name,
    }));
    setSearchTerm(`${stock.code} ${stock.name}`);
    setFilteredStocks([]);
  };

  // Save item
  const handleSave = async () => {
    if (!form.stockCode) {
      toast.warning('請先選擇股票標的');
      return;
    }
    if (form.quantity <= 0) {
      toast.warning('持股數量必須大於 0');
      return;
    }
    if (form.avgCost <= 0) {
      toast.warning('買入均價必須大於 0');
      return;
    }

    setSaving(true);
    try {
      await savePortfolioItem(form);
      toast.success(
        form.stockCode ? `持股 ${form.stockCode} 已儲存` : '新增持股成功'
      );
      setShowModal(false);
      loadData();
    } catch (err) {
      toast.error(`儲存失敗: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Delete item
  const handleDeleteConfirm = async () => {
    if (!confirmDeleteCode) return;
    setDeleting(true);
    try {
      await deletePortfolioItem(confirmDeleteCode);
      toast.success(`已自庫存移除 ${confirmDeleteCode}`);
      setConfirmDeleteCode(null);
      loadData();
    } catch (err) {
      toast.error(`刪除失敗: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Summary calculations
  const totalCost = items.reduce(
    (sum, i) => sum + i.avgCost * i.quantity,
    0
  );
  const totalMarketVal = items.reduce((sum, i) => {
    const p = snapshots[i.stockCode] || i.avgCost;
    return sum + p * i.quantity;
  }, 0);
  const totalPL = totalMarketVal - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            持股庫存管理
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            記錄真實庫存均價與股數，結合即時收盤報價計算未實現損益
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleOpenAdd}
          icon={Plus}
        >
          新增持股部位
        </Button>
      </div>

      {/* Portfolio Summary Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            庫存總成本
          </span>
          <div className="mt-1 text-lg font-bold font-mono text-slate-900 dark:text-white">
            NT$ {fmtCurrency(totalCost)}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            庫存總市值
          </span>
          <div className="mt-1 text-lg font-bold font-mono text-slate-900 dark:text-white">
            NT$ {fmtCurrency(totalMarketVal)}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            未實現總損益
          </span>
          <div
            className={`mt-1 text-lg font-bold font-mono ${
              totalPL >= 0 ? 'text-rose-500' : 'text-emerald-500'
            }`}
          >
            {totalPL >= 0 ? '+' : ''}
            {fmtCurrency(totalPL)}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            整體報酬率
          </span>
          <div
            className={`mt-1 text-lg font-bold font-mono ${
              totalPLPct >= 0 ? 'text-rose-500' : 'text-emerald-500'
            }`}
          >
            {totalPLPct >= 0 ? '+' : ''}
            {fmtPercent(totalPLPct)}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <Card
        title={`庫存部位清單 (${items.length} 檔)`}
        subtitle="點擊代碼或看盤按鈕可即時開啟 K 線圖與技術指標"
      >
        {loading ? (
          <div className="py-16 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-500 opacity-60" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
              尚無庫存持股紀錄
            </p>
            <p className="text-xs text-slate-500 mt-1">
              點擊右上角「新增持股部位」開始追蹤投資組合
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAdd}
              icon={Plus}
              className="mt-4"
            >
              立即新增第一檔持股
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-6">標的名稱</th>
                  <th className="py-3.5 px-4 text-right">持股股數</th>
                  <th className="py-3.5 px-4 text-right">買入均價</th>
                  <th className="py-3.5 px-4 text-right">最新市價</th>
                  <th className="py-3.5 px-4 text-right">買入總成本</th>
                  <th className="py-3.5 px-4 text-right">目前總市值</th>
                  <th className="py-3.5 px-4 text-right">未實現損益</th>
                  <th className="py-3.5 px-4">綁定策略</th>
                  <th className="py-3.5 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((i) => {
                  const currentPrice = snapshots[i.stockCode] || i.avgCost;
                  const cost = i.avgCost * i.quantity;
                  const val = currentPrice * i.quantity;
                  const pl = val - cost;
                  const plPct = cost > 0 ? (pl / cost) * 100 : 0;
                  const isUp = pl >= 0;

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
                      <td className="py-3.5 px-4 text-right font-mono font-medium">
                        {i.quantity.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {i.avgCost.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {currentPrice.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {fmtCurrency(cost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {fmtCurrency(val)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span className={isUp ? 'text-rose-500' : 'text-emerald-500'}>
                          {isUp ? '+' : ''}
                          {fmtCurrency(pl)}
                          <span className="text-[11px] ml-1 opacity-80">
                            ({isUp ? '+' : ''}
                            {fmtPercent(plPct)})
                          </span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="neutral" size="sm">
                          {i.selectedStrategy || '預設全策略'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onOpenChart(i)}
                            icon={BarChart3}
                            title="查看走勢線圖"
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleOpenEdit(i)}
                            icon={Edit2}
                            title="編輯部位"
                          />
                          <Button
                            variant="danger"
                            size="xs"
                            onClick={() => setConfirmDeleteCode(i.stockCode)}
                            icon={Trash2}
                            title="刪除部位"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={form.stockCode && !form.stockCode ? '新增持股部位' : '編輯/新增持股部位'}
        subtitle="請輸入台股個股代碼、持有股數與平均成交買進成本"
      >
        <div className="space-y-4">
          {/* Stock Search/Select */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              股票代碼與標的
            </label>
            {!form.stockCode ? (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleStockSearch(e.target.value)}
                    placeholder="輸入代碼或名稱搜尋 (例如: 2330 台積電)..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  />
                </div>
                {filteredStocks.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-xl z-50 divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStocks.map((s) => (
                      <div
                        key={s.code}
                        onClick={() => handleSelectStock(s)}
                        className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                          {s.code}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400">
                    {form.stockCode}
                  </span>
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    {form.stockName}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setForm((f) => ({ ...f, stockCode: '', stockName: '' }))
                  }
                >
                  更換標的
                </Button>
              </div>
            )}
          </div>

          {/* Quantity & Avg Cost */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                持股數量 (股)
              </label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quantity: parseInt(e.target.value) || 0,
                  }))
                }
                step="100"
                min="1"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                買入平均價格 (TWD)
              </label>
              <input
                type="number"
                value={form.avgCost}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    avgCost: parseFloat(e.target.value) || 0,
                  }))
                }
                step="0.05"
                min="0"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Estimated Total Investment */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">預估持有成本：</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              NT$ {fmtCurrency(form.quantity * form.avgCost)}
            </span>
          </div>

          {/* Strategy selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              指定專屬分析策略 (選填)
            </label>
            <select
              value={form.selectedStrategy}
              onChange={(e) =>
                setForm((f) => ({ ...f, selectedStrategy: e.target.value }))
              }
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-sky-500"
            >
              <option value="">預設 (套用全策略篩選)</option>
              {strategies.map((s) => (
                <option key={s.fileName} value={s.fileName}>
                  {s.name} ({s.fileName})
                </option>
              ))}
            </select>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!form.stockCode || form.quantity <= 0}
            >
              儲存部位
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmModal
        isOpen={Boolean(confirmDeleteCode)}
        onClose={() => setConfirmDeleteCode(null)}
        onConfirm={handleDeleteConfirm}
        title="確認刪除持股部位"
        message={`確定要自投資組合庫存中刪除個股「${confirmDeleteCode}」嗎？此操作將同時移除其損益追蹤。`}
        confirmText="刪除部位"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
