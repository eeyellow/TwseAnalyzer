import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Moon,
  Sun,
  RefreshCw,
  Zap,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { runUpdateJob, runAnalysisJob } from '../../api';
import Button from '../common/Button';

export default function Header({
  allStocks = [],
  onOpenChart,
  onRefreshData,
}) {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (!val.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const query = val.toLowerCase().trim();
    const matched = allStocks
      .filter((s) => s.code.includes(query) || s.name.includes(query))
      .slice(0, 8);
    setResults(matched);
    setShowDropdown(matched.length > 0);
  };

  const handleSelectStock = (stock) => {
    onOpenChart({ stockCode: stock.code, stockName: stock.name });
    setSearch('');
    setShowDropdown(false);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    toast.info('正在向台灣證券交易所抓取最新收盤歷史...');
    try {
      const res = await runUpdateJob();
      toast.success(res.message || '股價歷史更新成功！');
      if (onRefreshData) onRefreshData();
    } catch (err) {
      toast.error(`更新失敗: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleAnalysis = async () => {
    setAnalyzing(true);
    toast.info('全市場策略分析運算中...');
    try {
      const res = await runAnalysisJob();
      toast.success(res.message || '策略分析運算完成！');
      if (onRefreshData) onRefreshData();
    } catch (err) {
      toast.error(`分析失敗: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Determine Taiwan market status (09:00 - 13:30 Mon-Fri)
  const getMarketStatus = () => {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const timeInMins = hours * 60 + mins;

    if (day === 0 || day === 6) {
      return { text: '週末休市', color: 'bg-slate-500/15 text-slate-500 border-slate-500/30' };
    }
    if (timeInMins >= 540 && timeInMins <= 810) {
      return { text: '台股盤中交易', color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' };
    }
    return { text: '台股已收盤', color: 'bg-sky-500/15 text-sky-500 border-sky-500/30' };
  };

  const marketStatus = getMarketStatus();

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#0d121f]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20 transition-colors">
      {/* Global Quick Search */}
      <div ref={searchRef} className="relative w-72 lg:w-96">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="搜尋個股代碼或名稱 (例如: 2330 台積電)..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-transparent focus:border-sky-500 focus:bg-white dark:focus:bg-slate-850 text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-all"
          />
        </div>

        {showDropdown && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-xl overflow-hidden z-50 animate-slide-in">
            <div className="p-1.5">
              {results.map((item) => (
                <button
                  key={item.code}
                  onClick={() => handleSelectStock(item)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                      {item.code}
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">開起線圖 →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Market Status badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${marketStatus.color}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{marketStatus.text}</span>
        </div>

        {/* Action buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleUpdate}
          loading={updating}
          disabled={updating || analyzing}
          icon={RefreshCw}
          title="手動抓取所有股票歷史日收盤數據"
        >
          抓取報價
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handleAnalysis}
          loading={analyzing}
          disabled={updating || analyzing}
          icon={Zap}
          title="觸發全市場選股與策略指標分析"
        >
          執行分析
        </Button>

        <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? '切換為亮色主題' : '切換為暗色主題'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>
      </div>
    </header>
  );
}
