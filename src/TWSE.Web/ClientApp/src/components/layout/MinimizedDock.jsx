import React from 'react';
import { TrendingUp, X } from 'lucide-react';

export default function MinimizedDock({
  stocks = [],
  onRestore,
  onClose,
  sidebarCollapsed,
}) {
  if (!stocks || stocks.length === 0) return null;

  return (
    <div
      className={`fixed bottom-4 z-40 flex items-center gap-2 max-w-full overflow-x-auto p-2 rounded-2xl bg-white/90 dark:bg-[#111827]/90 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md transition-all duration-300 ${
        sidebarCollapsed ? 'left-24' : 'left-72'
      } right-6`}
    >
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 pl-2 pr-1 shrink-0">
        <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
        <span>縮小圖表</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto py-0.5">
        {stocks.map((stock) => {
          const code = stock.stockCode || stock.code;
          const name = stock.stockName || stock.name;

          return (
            <div
              key={code}
              onClick={() => onRestore(stock)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-sky-500/10 hover:border-sky-500/30 border border-transparent cursor-pointer transition-all duration-200 group text-xs shrink-0"
            >
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                {code}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300 max-w-[100px] truncate">
                {name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(code);
                }}
                className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="關閉"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
