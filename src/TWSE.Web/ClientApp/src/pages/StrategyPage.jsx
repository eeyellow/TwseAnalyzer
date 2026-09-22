import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchStrategies,
  fetchCombos,
  saveCombo,
  deleteCombo,
  scanCombo,
  getPortfolio,
  getLocalTracking,
  saveLocalTracking,
  fetchStocks,
  backtestStock,
} from '../api';
import {
  fmtCurrency,
  fmtPercent,
  fmtVolume,
} from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import {
  SlidersHorizontal,
  Play,
  CheckCircle,
  AlertTriangle,
  FileCode,
  BarChart3,
  Search,
  Briefcase,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Bookmark,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';

export default function StrategyPage({ onOpenChart, onNavigate }) {
  const toast = useToast();

  // Core Data
  const [strategies, setStrategies] = useState([]);
  const [combos, setCombos] = useState([]);
  const [selectedComboId, setSelectedComboId] = useState('');
  const [selectedStrategyFiles, setSelectedStrategyFiles] = useState([]);
  const [logicMode, setLogicMode] = useState('AND'); // 'AND' | 'OR' | 'SCORE'
  const [minScorePercent, setMinScorePercent] = useState(66);
  const [targetScope, setTargetScope] = useState('portfolio'); // 'portfolio' | 'tracking' | 'all'
  const [filterMinVolume, setFilterMinVolume] = useState(true);

  // Holdings & Tracking Metadata
  const [portfolio, setPortfolio] = useState([]);
  const [trackingCodes, setTrackingCodes] = useState(new Set());
  const [allStocksCount, setAllStocksCount] = useState(0);

  // Scan Execution & Results
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanResultData, setScanResultData] = useState({
    totalTargetCount: 0,
    matchedCount: 0,
    results: [],
  });

  // Table Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [signalFilter, setSignalFilter] = useState('all'); // 'all' | 'buy' | 'sell'

  // Modal: Save Combo
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newComboName, setNewComboName] = useState('');
  const [newComboDesc, setNewComboDesc] = useState('');
  const [savingCombo, setSavingCombo] = useState(false);

  // Modal: Stock Interval Backtest
  const [showBacktestModal, setShowBacktestModal] = useState(false);
  const [backtestStockTarget, setBacktestStockTarget] = useState(null);
  const [backtestRangeType, setBacktestRangeType] = useState('1Y'); // '1Y' | '2Y' | '3Y' | 'all' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);

  const computeDateRange = (rangeType) => {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    if (rangeType === '1Y') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    } else if (rangeType === '2Y') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 2);
      startDate = d.toISOString().split('T')[0];
    } else if (rangeType === '3Y') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (rangeType === 'custom') {
      startDate = customStartDate || null;
      endDate = customEndDate || null;
    }
    return { startDate, endDate };
  };

  const executeStockBacktest = async (target, rangeType = backtestRangeType) => {
    const stock = target || backtestStockTarget;
    if (!stock) return;

    const code = stock.stockCode || stock.code;
    if (!code) return;

    const { startDate, endDate } = computeDateRange(rangeType);
    setBacktesting(true);

    try {
      const res = await backtestStock({
        stockCode: code,
        strategyFileNames: selectedStrategyFiles,
        logicMode,
        minScorePercent,
        startDate,
        endDate,
        initialCapital: 1000000,
      });
      setBacktestResult(res);
    } catch (err) {
      console.error('Backtest error', err);
      toast.error(err.message || '回測執行失敗');
    } finally {
      setBacktesting(false);
    }
  };

  const handleOpenBacktest = (item) => {
    setBacktestStockTarget(item);
    setShowBacktestModal(true);
    setBacktestResult(null);
    executeStockBacktest(item, backtestRangeType);
  };

  // 1. Initial Data Loading
  const loadInitialData = useCallback(async () => {
    try {
      const [stratList, comboList, port, track, stocks] = await Promise.all([
        fetchStrategies().catch(() => []),
        fetchCombos().catch(() => []),
        getPortfolio().catch(() => []),
        getLocalTracking().catch(() => []),
        fetchStocks().catch(() => []),
      ]);

      const validStrats = stratList || [];
      const validCombos = comboList || [];

      setStrategies(validStrats);
      setCombos(validCombos);
      setPortfolio(port || []);
      setTrackingCodes(new Set(track || []));
      setAllStocksCount((stocks || []).length);

      // Default target scope: if portfolio has items, default to portfolio, else tracking or all
      if (port && port.length > 0) {
        setTargetScope('portfolio');
      } else if (track && track.length > 0) {
        setTargetScope('tracking');
      } else {
        setTargetScope('all');
      }

      // Default select the first combo or custom mode
      if (validCombos.length > 0) {
        const first = validCombos[0];
        setSelectedComboId(first.id);
        setSelectedStrategyFiles(first.strategyFileNames || []);
        setLogicMode(first.logicMode || 'AND');
        if (first.minScorePercent) setMinScorePercent(first.minScorePercent);
      } else if (validStrats.length > 0) {
        setSelectedComboId('custom');
        setSelectedStrategyFiles([validStrats[0].fileName]);
      } else {
        setSelectedComboId('custom');
        setSelectedStrategyFiles([]);
      }
    } catch (err) {
      console.error('Failed to load initial strategy data', err);
      toast.error('載入策略資料失敗，請確認伺服器連線狀態。');
    }
  }, [toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Combo Switching
  const handleSelectCombo = (combo) => {
    setSelectedComboId(combo.id);
    setSelectedStrategyFiles(combo.strategyFileNames || []);
    setLogicMode(combo.logicMode || 'AND');
    if (combo.minScorePercent) setMinScorePercent(combo.minScorePercent);
  };

  // 3. Strategy Selection Toggling (Switches to Custom combo mode)
  const handleToggleStrategy = (fileName) => {
    setSelectedStrategyFiles((prev) => {
      let next;
      if (prev.includes(fileName)) {
        next = prev.filter((f) => f !== fileName);
      } else {
        next = [...prev, fileName];
      }
      return next;
    });
    setSelectedComboId('custom');
  };

  const handleSelectAllStrategies = () => {
    setSelectedStrategyFiles(strategies.map((s) => s.fileName));
    setSelectedComboId('custom');
  };

  const handleClearAllStrategies = () => {
    setSelectedStrategyFiles([]);
    setSelectedComboId('custom');
  };

  // 4. Save Current Selection as New Combo
  const handleOpenSaveModal = () => {
    if (selectedStrategyFiles.length === 0) {
      toast.warning('請至少選取一個策略才能儲存為組合！');
      return;
    }
    setNewComboName('');
    setNewComboDesc('');
    setShowSaveModal(true);
  };

  const handleSaveCustomCombo = async (e) => {
    e.preventDefault();
    if (!newComboName.trim()) {
      toast.warning('請輸入策略組合名稱');
      return;
    }
    setSavingCombo(true);
    try {
      const payload = {
        name: newComboName.trim(),
        description: newComboDesc.trim() || '自訂多策略組合',
        strategyFileNames: selectedStrategyFiles,
        logicMode: logicMode,
        minScorePercent: minScorePercent,
      };
      const created = await saveCombo(payload);
      if (created) {
        toast.success(`成功儲存策略組合「${created.name}」！`);
        setShowSaveModal(false);
        const updatedCombos = await fetchCombos();
        setCombos(updatedCombos || []);
        setSelectedComboId(created.id);
      }
    } catch (err) {
      console.error('Save combo error', err);
      toast.error('儲存策略組合失敗');
    } finally {
      setSavingCombo(false);
    }
  };

  // 5. Delete Custom Combo
  const handleDeleteCombo = async (comboId, comboName, e) => {
    e.stopPropagation();
    if (!window.confirm(`確定要刪除自訂策略組合「${comboName}」嗎？`)) return;

    try {
      await deleteCombo(comboId);
      toast.success(`已刪除「${comboName}」`);
      const updatedCombos = await fetchCombos();
      setCombos(updatedCombos || []);
      if (selectedComboId === comboId) {
        if (updatedCombos && updatedCombos.length > 0) {
          handleSelectCombo(updatedCombos[0]);
        } else {
          setSelectedComboId('custom');
        }
      }
    } catch (err) {
      console.error('Delete combo error', err);
      toast.error('刪除失敗');
    }
  };

  // 6. Toggle Stock Tracking
  const handleToggleTracking = async (stockCode, e) => {
    e.stopPropagation();
    const nextSet = new Set(trackingCodes);
    if (nextSet.has(stockCode)) {
      nextSet.delete(stockCode);
      toast.info(`已從自選清單移除 ${stockCode}`);
    } else {
      nextSet.add(stockCode);
      toast.success(`已加入自選清單 ${stockCode}`);
    }
    setTrackingCodes(nextSet);
    await saveLocalTracking(Array.from(nextSet));
  };

  // 7. Run Combo Scan
  const runScan = async () => {
    if (selectedStrategyFiles.length === 0) {
      toast.warning('請至少選取一個策略模型！');
      return;
    }

    setLoading(true);
    setHasScanned(true);

    try {
      const customCodes =
        targetScope === 'tracking' ? Array.from(trackingCodes) : null;

      const payload = {
        strategyFileNames: selectedStrategyFiles,
        logicMode: logicMode,
        targetScope: targetScope,
        customCodes: customCodes,
        minScorePercent: minScorePercent,
        minVolume: targetScope === 'all' && filterMinVolume ? 100000 : 0, // 100 張 = 100,000 股
      };

      const res = await scanCombo(payload);
      if (res && res.results) {
        setScanResultData({
          totalTargetCount: res.totalTargetCount || 0,
          matchedCount: res.matchedCount || res.results.length,
          results: res.results,
        });

        if (res.results.length > 0) {
          toast.success(
            `掃描完成！共篩選出 ${res.results.length} 檔符合條件標的`
          );
        } else {
          toast.info('掃描完成，當前條件下未觸發訊號。');
        }
      }
    } catch (err) {
      console.error('Scan failed', err);
      toast.error('掃描運算失敗，請稍候重試。');
    } finally {
      setLoading(false);
    }
  };

  // 8. Filtered Results
  const filteredResults = useMemo(() => {
    let list = scanResultData.results || [];

    if (signalFilter === 'buy') {
      list = list.filter((r) => r.buySignal);
    } else if (signalFilter === 'sell') {
      list = list.filter((r) => r.sellSignal);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.stockCode.toLowerCase().includes(term) ||
          r.stockName.toLowerCase().includes(term) ||
          (r.industry && r.industry.toLowerCase().includes(term))
      );
    }
    return list;
  }, [scanResultData.results, signalFilter, searchTerm]);

  const buyCount = useMemo(
    () => (scanResultData.results || []).filter((r) => r.buySignal).length,
    [scanResultData.results]
  );
  const sellCount = useMemo(
    () => (scanResultData.results || []).filter((r) => r.sellSignal).length,
    [scanResultData.results]
  );

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              策略組合與多維選股掃描
            </h1>
            <Badge variant="sky" size="sm">
              Ensemble PRO
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            靈活組裝多項量化模型，支援嚴格交集 (AND)、寬鬆聯集 (OR)
            與加權多數決評分，全方位掃描庫存、自選或全市場標的
          </p>
        </div>

        {/* Global Stats preview */}
        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
            持股: <b className="text-sky-500 ml-1">{portfolio.length}</b> 檔
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
            自選: <b className="text-amber-500 ml-1">{trackingCodes.size}</b> 檔
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
            全市場: <b className="text-emerald-500 ml-1">{allStocksCount}</b> 檔
          </span>
        </div>
      </div>

      {/* 1. Strategy Combos Selector Bar */}
      <Card
        title="1. 選擇或自訂策略組合 (Strategy Combo)"
        subtitle="點選現有預設組合，或勾選下方子策略自行組裝專屬的量化決策模組"
        action={
          <Button
            variant="ghost"
            size="xs"
            onClick={handleOpenSaveModal}
            disabled={selectedStrategyFiles.length === 0}
            icon={Plus}
          >
            將當前選擇另存為新組合
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2.5">
          {combos.map((combo) => {
            const isSelected = selectedComboId === combo.id;
            return (
              <button
                key={combo.id}
                onClick={() => handleSelectCombo(combo)}
                className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all duration-200 text-left ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-sm font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <Layers
                  className={`w-3.5 h-3.5 ${
                    isSelected
                      ? 'text-sky-500'
                      : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate max-w-[200px]">{combo.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                  {combo.strategyFileNames?.length || 0} 策略
                </span>
                {!combo.isBuiltIn && (
                  <span
                    onClick={(e) => handleDeleteCombo(combo.id, combo.name, e)}
                    className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors ml-1"
                    title="刪除此自訂組合"
                  >
                    <Trash2 className="w-3 h-3" />
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setSelectedComboId('custom')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all duration-200 ${
              selectedComboId === 'custom'
                ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                : 'border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
            <span>自訂手動組裝</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
              {selectedStrategyFiles.length} 已選
            </span>
          </button>
        </div>

        {/* Selected Combo Explanation */}
        {selectedComboId !== 'custom' && (
          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1.5">
                {combos.find((c) => c.id === selectedComboId)?.name}:
              </span>
              {combos.find((c) => c.id === selectedComboId)?.description}
            </div>
          </div>
        )}

        {/* Sub-strategies Multi-Select Grid */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <span>子策略池清單</span>
              <span className="text-slate-400 font-normal">
                (點擊卡片自由勾選加入/移除)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAllStrategies}
                className="text-[11px] text-sky-500 hover:underline font-medium"
              >
                全選
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                onClick={handleClearAllStrategies}
                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
              >
                清空
              </button>
            </div>
          </div>

          {strategies.length === 0 ? (
            <div className="py-8 text-center text-slate-500 bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/20 p-6">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2.5 text-amber-500" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                尚未偵測到策略設定檔 (.json)
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                系統中目前無策略檔案。請將您的量化策略 JSON 檔案手動上傳至伺服器的{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sky-500 font-mono font-bold">
                  strategies/
                </code>{' '}
                目錄，完成後點擊下方按鈕載入。
              </p>
              <div className="mt-4">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={loadInitialData}
                  icon={RefreshCw}
                >
                  重新整理載入策略
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {strategies.map((strat) => {
                const isChecked = selectedStrategyFiles.includes(strat.fileName);
                return (
                  <div
                    key={strat.fileName}
                    onClick={() => handleToggleStrategy(strat.fileName)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 relative group flex items-start gap-3 ${
                      isChecked
                        ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 group-hover:text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {strat.name}
                        </h4>
                        {isChecked && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                        {strat.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                          買入條件: {strat.entryCount || 1}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-rose-500">
                          出場條件: {strat.exitCount || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* 2. Scan Rules & Execution Panel */}
      <Card
        title="2. 設定掃描範圍與融合邏輯"
        subtitle="指定要進行回測掃描的股票標的名單與策略判定規則"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Target Scope Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              掃描標的範圍 (Target Scope)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Portfolio Option */}
              <button
                type="button"
                onClick={() => setTargetScope('portfolio')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  targetScope === 'portfolio'
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Briefcase
                    className={`w-4 h-4 ${
                      targetScope === 'portfolio'
                        ? 'text-sky-500'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    持股部位
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  真實持股庫存
                </div>
                <div className="mt-2 text-xs font-mono font-bold text-sky-500">
                  {portfolio.length} 檔標的
                </div>
              </button>

              {/* Tracking Option */}
              <button
                type="button"
                onClick={() => setTargetScope('tracking')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  targetScope === 'tracking'
                    ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Star
                    className={`w-4 h-4 ${
                      targetScope === 'tracking'
                        ? 'text-amber-500'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    自選監控
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  自選追蹤清單
                </div>
                <div className="mt-2 text-xs font-mono font-bold text-amber-500">
                  {trackingCodes.size} 檔標的
                </div>
              </button>

              {/* All Market Option */}
              <button
                type="button"
                onClick={() => setTargetScope('all')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  targetScope === 'all'
                    ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles
                    className={`w-4 h-4 ${
                      targetScope === 'all'
                        ? 'text-emerald-500'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    全台股市場
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  全市場技術面選股
                </div>
                <div className="mt-2 text-xs font-mono font-bold text-emerald-500">
                  {allStocksCount || '1,800+'} 檔
                </div>
              </button>
            </div>

            {targetScope === 'all' && (
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={filterMinVolume}
                  onChange={(e) => setFilterMinVolume(e.target.checked)}
                  className="rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                />
                <span>過濾殭屍股 / 低流動性冷門股 (當日成交量 ≧ 100 張)</span>
              </label>
            )}
          </div>

          {/* Logic Mode Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              融合判定規則 (Fusion Logic)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setLogicMode('AND')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  logicMode === 'AND'
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="text-xs text-slate-900 dark:text-white font-bold">
                  AND (嚴格交集)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  所有選定策略必須全數滿足，訊號最精準、勝率最高
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLogicMode('OR')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  logicMode === 'OR'
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="text-xs text-slate-900 dark:text-white font-bold">
                  OR (寬鬆聯集)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  任一策略符合即觸發，覆蓋面廣，不易錯過任何可能行情
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLogicMode('SCORE')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  logicMode === 'SCORE'
                    ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15 shadow-sm font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                }`}
              >
                <div className="text-xs text-slate-900 dark:text-white font-bold">
                  SCORE (加權評分)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  多數決綜合評估，滿足比例 ≧ 門檻即推薦
                </p>
              </button>
            </div>

            {logicMode === 'SCORE' && (
              <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-400">
                <span>評分門檻：</span>
                {[50, 66, 75].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMinScorePercent(pct)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      minScorePercent === pct
                        ? 'bg-sky-500 text-white font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    ≧ {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CTA Bar */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>當前配置：</span>
            <Badge variant="sky" size="sm">
              {selectedStrategyFiles.length} 項策略
            </Badge>
            <Badge variant="neutral" size="sm">
              {logicMode} 模式
            </Badge>
            <Badge variant="purple" size="sm">
              {targetScope === 'portfolio'
                ? '持股部位'
                : targetScope === 'tracking'
                ? '自選監控'
                : '全市場'}
            </Badge>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={runScan}
            loading={loading}
            disabled={loading || selectedStrategyFiles.length === 0}
            icon={Play}
            className="w-full sm:w-auto shadow-md shadow-sky-500/20"
          >
            {loading ? '正在全市場並行回測運算中...' : '開始執行策略組合掃描'}
          </Button>
        </div>
      </Card>

      {/* 3. Scan Results Section */}

      {/* Empty State: Portfolio is empty when selected */}
      {hasScanned &&
        targetScope === 'portfolio' &&
        portfolio.length === 0 &&
        !loading && (
          <Card>
            <div className="py-12 text-center text-slate-500">
              <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-400 opacity-60" />
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                目前庫存中尚無持股
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                「持股部位」掃描專門針對您個人真實持股進行進出場檢測。您可以切換為「自選清單」或「全市場」立即開始選股，或是前往庫存管理新增部位。
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setTargetScope('all');
                    setTimeout(() => runScan(), 50);
                  }}
                  icon={Sparkles}
                >
                  切換為全市場掃描
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate('portfolio')}
                >
                  前往庫存管理新增部位
                </Button>
              </div>
            </div>
          </Card>
        )}

      {/* Empty State: Scanned but no signals matched */}
      {hasScanned &&
        scanResultData.results.length === 0 &&
        !loading &&
        !(targetScope === 'portfolio' && portfolio.length === 0) && (
          <Card>
            <div className="py-12 text-center text-slate-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-80" />
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                在當前條件下未篩選出觸發訊號的標的
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                所有掃描標的在當前交易日皆未完全滿足選定策略之進出場門檻。
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs">
                <span className="text-slate-400">改善建議：</span>
                <button
                  onClick={() => {
                    setLogicMode('OR');
                    setTimeout(() => runScan(), 50);
                  }}
                  className="text-sky-500 hover:underline font-medium"
                >
                  改採「OR (寬鬆聯集)」模式再試一次
                </button>
                {targetScope !== 'all' && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      onClick={() => {
                        setTargetScope('all');
                        setTimeout(() => runScan(), 50);
                      }}
                      className="text-emerald-500 hover:underline font-medium"
                    >
                      切換至「全台股市場」擴大掃描
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}

      {/* Results Table */}
      {scanResultData.results.length > 0 && (
        <Card
          title={`策略組合掃描報告 (${filteredResults.length} 筆)`}
          subtitle={`涵蓋標的 ${scanResultData.totalTargetCount} 檔，共 ${scanResultData.matchedCount} 檔觸發訊號 (買入: ${buyCount} | 出場: ${sellCount})`}
          action={
            <div className="flex items-center gap-3">
              {/* Signal Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setSignalFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    signalFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  全部 ({scanResultData.results.length})
                </button>
                <button
                  onClick={() => setSignalFilter('buy')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    signalFilter === 'buy'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-rose-500'
                  }`}
                >
                  買入 ({buyCount})
                </button>
                <button
                  onClick={() => setSignalFilter('sell')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    signalFilter === 'sell'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-emerald-500'
                  }`}
                >
                  出場 ({sellCount})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜尋代碼、名稱、產業..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border-none outline-none text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto -mx-6 -my-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-6">股票標的</th>
                  <th className="py-3 px-4">最新收盤價</th>
                  <th className="py-3 px-4">當日漲跌</th>
                  <th className="py-3 px-4">成交量</th>
                  <th className="py-3 px-4">訊號評估</th>
                  <th className="py-3 px-4">共振度 / 評分</th>
                  <th className="py-3 px-4">觸發子策略標籤</th>
                  {targetScope === 'portfolio' && (
                    <>
                      <th className="py-3 px-4">持股成本</th>
                      <th className="py-3 px-4">未實現損益</th>
                    </>
                  )}
                  <th className="py-3 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredResults.map((item) => {
                  const isUp = item.changePercent > 0;
                  const isDown = item.changePercent < 0;
                  const isTracked = trackingCodes.has(item.stockCode);

                  return (
                    <tr
                      key={item.stockCode}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Stock Info */}
                      <td className="py-3.5 px-6">
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onOpenChart(item)}
                        >
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400 group-hover:underline">
                            {item.stockCode}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.stockName}
                          </span>
                          {item.industry && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                              {item.industry}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Close Price */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {fmtCurrency(item.lastClose, 2)}
                      </td>

                      {/* Change % */}
                      <td className="py-3.5 px-4 font-mono">
                        <span
                          className={`inline-flex items-center gap-0.5 font-bold ${
                            isUp
                              ? 'text-rose-500'
                              : isDown
                              ? 'text-emerald-500'
                              : 'text-slate-400'
                          }`}
                        >
                          {isUp && <ArrowUpRight className="w-3 h-3" />}
                          {isDown && <ArrowDownRight className="w-3 h-3" />}
                          {fmtPercent(item.changePercent)}
                        </span>
                      </td>

                      {/* Volume */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {fmtVolume(item.volume)}
                      </td>

                      {/* Overall Signal */}
                      <td className="py-3.5 px-4">
                        {item.sellSignal ? (
                          <Badge variant="sell" size="sm" dot pulse>
                            出場警示
                          </Badge>
                        ) : item.buySignal ? (
                          <Badge variant="buy" size="sm" dot pulse>
                            {item.matchScore === 100 ? '強力買進' : '買進訊號'}
                          </Badge>
                        ) : (
                          <Badge variant="hold" size="sm">
                            續抱觀望
                          </Badge>
                        )}
                      </td>

                      {/* Score / Resonance */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.matchScore >= 80
                                  ? 'bg-rose-500'
                                  : item.matchScore >= 50
                                  ? 'bg-sky-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${item.matchScore}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300">
                            {item.matchedCount}/{item.totalStrategies} (
                            {Math.round(item.matchScore)}%)
                          </span>
                        </div>
                      </td>

                      {/* Matched Sub-strategies Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.matchedBuyStrategies?.map((sName) => (
                            <span
                              key={sName}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium"
                            >
                              ✓ {sName}
                            </span>
                          ))}
                          {item.matchedSellStrategies?.map((sName) => (
                            <span
                              key={sName}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                            >
                              ✕ {sName} 出場
                            </span>
                          ))}
                          {item.matchedBuyStrategies?.length === 0 &&
                            item.matchedSellStrategies?.length === 0 && (
                              <span className="text-[10px] text-slate-400">
                                未觸發進出場
                              </span>
                            )}
                        </div>
                      </td>

                      {/* Portfolio Extra Columns */}
                      {targetScope === 'portfolio' && (
                        <>
                          <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                            {item.avgCost ? fmtCurrency(item.avgCost, 2) : '-'}
                            <span className="text-[10px] text-slate-400 ml-1">
                              ({item.quantity}股)
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            {item.profitLoss !== null &&
                            item.profitLoss !== undefined ? (
                              <span
                                className={`font-bold ${
                                  item.profitLoss >= 0
                                    ? 'text-rose-500'
                                    : 'text-emerald-500'
                                }`}
                              >
                                {fmtCurrency(item.profitLoss)} (
                                {fmtPercent(item.profitLossPercent)})
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </>
                      )}

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Bookmark Tracking */}
                          <button
                            onClick={(e) =>
                              handleToggleTracking(item.stockCode, e)
                            }
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isTracked
                                ? 'border-amber-400 bg-amber-400/15 text-amber-500'
                                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
                            }`}
                            title={
                              isTracked ? '已在自選清單' : '加入自選監控清單'
                            }
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isTracked ? 'fill-current' : ''
                              }`}
                            />
                          </button>

                          {/* Open Chart */}
                          <button
                            onClick={() => onOpenChart(item)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-500 hover:border-sky-500 transition-colors"
                            title="開啟 K 線圖與技術指標"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Interval Backtest */}
                          <button
                            onClick={() => handleOpenBacktest(item)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-colors"
                            title="回測此策略組合對該股的歷史區間獲利率"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Save Combo Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="另存為新策略組合"
        subtitle="將目前勾選的多個策略與融合邏輯保存為專屬策略組合"
      >
        <form onSubmit={handleSaveCustomCombo} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              策略組合名稱 *
            </label>
            <input
              type="text"
              required
              value={newComboName}
              onChange={(e) => setNewComboName(e.target.value)}
              placeholder="例如：自訂動能與反轉雙重共振"
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-sky-500 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              組合敘述說明
            </label>
            <textarea
              rows={2}
              value={newComboDesc}
              onChange={(e) => setNewComboDesc(e.target.value)}
              placeholder="簡要描述此策略組合的核心邏輯與選股目的..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-sky-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-xs space-y-1.5">
            <div className="text-slate-500 dark:text-slate-400">
              包含子策略 ({selectedStrategyFiles.length} 項)：
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedStrategyFiles.map((fn) => (
                <span
                  key={fn}
                  className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[11px]"
                >
                  {strategies.find((s) => s.fileName === fn)?.name || fn}
                </span>
              ))}
            </div>
            <div className="text-slate-400 text-[11px] pt-1">
              融合邏輯：<b className="text-slate-600 dark:text-slate-300">{logicMode}</b>
              {logicMode === 'SCORE' && ` (門檻 ≧ ${minScorePercent}%)`}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowSaveModal(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={savingCombo}
            >
              確認建立組合
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Interval Backtest Modal */}
      <Modal
        isOpen={showBacktestModal}
        onClose={() => setShowBacktestModal(false)}
        title={`個股策略區間獲利回測: ${backtestStockTarget?.stockCode || backtestStockTarget?.code || ''} ${backtestStockTarget?.stockName || backtestStockTarget?.name || ''}`}
        subtitle="評估當前策略組合在指定時間區間內的累積獲利率、勝率與逐筆交易歷程"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          {/* Top Config & Date Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                回測區間：
              </span>
              {[
                { id: '1Y', label: '近 1 年' },
                { id: '2Y', label: '近 2 年' },
                { id: '3Y', label: '近 3 年' },
                { id: 'all', label: '全歷史' },
                { id: 'custom', label: '自訂' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => {
                    setBacktestRangeType(btn.id);
                    if (btn.id !== 'custom') {
                      executeStockBacktest(backtestStockTarget, btn.id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    backtestRangeType === btn.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs */}
            {backtestRangeType === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px]"
                />
                <span className="text-slate-400">至</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px]"
                />
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => executeStockBacktest(backtestStockTarget, 'custom')}
                  loading={backtesting}
                >
                  回測
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                融合模式: <b>{logicMode}</b>
              </span>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => executeStockBacktest(backtestStockTarget, backtestRangeType)}
                loading={backtesting}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                重新運算
              </Button>
            </div>
          </div>

          {/* Loading Indicator */}
          {backtesting && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs">正在逐日滾動計算該標的進出場訊號與前向結算...</span>
            </div>
          )}

          {/* Empty / Initial State */}
          {!backtesting && !backtestResult && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
              尚未取得回測運算結果，請點選上方「重新運算」或切換時間區間。
            </div>
          )}

          {/* Results Display */}
          {!backtesting && backtestResult && (() => {
            const totalReturn = Number(backtestResult.totalReturn ?? backtestResult.TotalReturn ?? 0);
            const annualizedReturn = Number(backtestResult.annualizedReturn ?? backtestResult.AnnualizedReturn ?? 0);
            const winRate = Number(backtestResult.winRate ?? backtestResult.WinRate ?? 0);
            const totalTrades = Number(backtestResult.totalTrades ?? backtestResult.TotalTrades ?? 0);
            const maxDrawdown = Number(backtestResult.maxDrawdown ?? backtestResult.MaxDrawdown ?? 0);
            const sharpeRatio = Number(backtestResult.sharpeRatio ?? backtestResult.SharpeRatio ?? 0);
            const initialCapital = Number(backtestResult.initialCapital ?? backtestResult.InitialCapital ?? 0);
            const finalCapital = Number(backtestResult.finalCapital ?? backtestResult.FinalCapital ?? 0);
            const tradesList = Array.isArray(backtestResult.trades)
              ? backtestResult.trades
              : Array.isArray(backtestResult.Trades)
              ? backtestResult.Trades
              : [];

            return (
              <div className="space-y-4">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">總累積報酬率</div>
                    <div
                      className={`text-lg font-mono font-bold mt-0.5 ${
                        totalReturn >= 0 ? 'text-rose-500' : 'text-emerald-500'
                      }`}
                    >
                      {fmtPercent(totalReturn * 100)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">年化報酬率</div>
                    <div
                      className={`text-lg font-mono font-bold mt-0.5 ${
                        annualizedReturn >= 0 ? 'text-rose-500' : 'text-emerald-500'
                      }`}
                    >
                      {fmtPercent(annualizedReturn * 100)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">勝率 / 交易次數</div>
                    <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                      {fmtPercent(winRate * 100)}
                      <span className="text-xs font-normal text-slate-400 ml-1.5">
                        ({totalTrades}次)
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">最大回撤 / 夏普比率</div>
                    <div className="text-lg font-mono font-bold mt-0.5 text-slate-900 dark:text-slate-100">
                      <span className="text-rose-500">
                        -{fmtPercent(maxDrawdown * 100)}
                      </span>
                      <span className="text-xs font-normal text-slate-400 ml-1.5">
                        (SR: {isNaN(sharpeRatio) ? '0.00' : sharpeRatio.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trades Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      歷史交易進出場歷程 ({tradesList.length} 筆)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      期初本金: {fmtCurrency(initialCapital)} ➔ 期末資產: {fmtCurrency(finalCapital)}
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2 px-3">買進日期</th>
                          <th className="py-2 px-3">買進價格</th>
                          <th className="py-2 px-3">賣出日期</th>
                          <th className="py-2 px-3">賣出價格</th>
                          <th className="py-2 px-3">持有天數</th>
                          <th className="py-2 px-3 text-right">單筆獲利</th>
                          <th className="py-2 px-3 text-right">報酬率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {tradesList.length > 0 ? (
                          tradesList.map((t, idx) => {
                            const buyDate = t.buyDate ?? t.BuyDate ?? '-';
                            const buyPrice = Number(t.buyPrice ?? t.BuyPrice ?? 0);
                            const sellDate = t.sellDate ?? t.SellDate;
                            const sellPrice = t.sellPrice ?? t.SellPrice;
                            const days = t.days ?? t.Days ?? 0;
                            const profitLoss = Number(t.profitLoss ?? t.ProfitLoss ?? 0);
                            const returnRate = Number(t.return ?? t.Return ?? t.returnRate ?? t.ReturnRate ?? 0);
                            const isProfit = profitLoss >= 0;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 font-mono">
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{buyDate}</td>
                                <td className="py-2 px-3">{fmtCurrency(buyPrice, 2)}</td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{sellDate || '尚未出場'}</td>
                                <td className="py-2 px-3">{sellPrice ? fmtCurrency(sellPrice, 2) : '-'}</td>
                                <td className="py-2 px-3 text-slate-500">{days} 天</td>
                                <td className={`py-2 px-3 text-right font-bold ${isProfit ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {fmtCurrency(profitLoss)}
                                </td>
                                <td className={`py-2 px-3 text-right font-bold ${isProfit ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {fmtPercent(returnRate * 100)}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                              此時間區間內未觸發任何完整進出場交易（可嘗試切換更長期間或調整為 OR 邏輯模式）
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}
