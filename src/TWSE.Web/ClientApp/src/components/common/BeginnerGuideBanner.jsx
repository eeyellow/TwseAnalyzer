import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  Zap,
  Target,
} from 'lucide-react';

export default function BeginnerGuideBanner() {
  const [open, setOpen] = useState(() => {
    return localStorage.getItem('twse_beginner_guide_open') !== 'false';
  });

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem('twse_beginner_guide_open', String(next));
      return next;
    });
  };

  return (
    <div className="mb-6 rounded-2xl border border-sky-200/80 dark:border-sky-900/60 bg-gradient-to-r from-sky-50/90 via-indigo-50/40 to-white dark:from-sky-950/30 dark:via-indigo-950/20 dark:to-[#0d121f] p-4 sm:p-5 shadow-sm transition-all duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between cursor-pointer" onClick={toggleOpen}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                新手快速導引：3 分鐘看懂全市場閉環量化系統
              </h3>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                新手友善指南
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              無需死記複雜技術指標，系統自動幫你完成「每日精選 ➔ 隔日結算 ➔ 滾動學習」三大閉環
            </p>
          </div>
        </div>

        <button
          className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-sky-100/50 dark:hover:bg-sky-900/40"
          aria-label={open ? '收合新手導引' : '展開新手導引'}
        >
          <span>{open ? '收合指南' : '展開速懂指南'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable Content Grid */}
      {open && (
        <div className="mt-4 pt-4 border-t border-sky-100 dark:border-sky-900/40 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: 每日盤前推薦 */}
          <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center gap-2 mb-1.5 text-sky-600 dark:text-sky-400 font-bold text-xs sm:text-sm">
              <Zap className="w-4 h-4 shrink-0" />
              <span>1. 每天開盤前看什麼？</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              每天晚上 8 點系統自動掃描全台股，挑出
              <strong className="text-slate-800 dark:text-slate-100">「Top 20 最推薦買進」</strong>與
              <strong className="text-slate-800 dark:text-slate-100">「Top 20 警示避開」</strong>。標有
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">【⭐ 黃金適配】</span>
              代表歷史實戰勝率最高！
            </p>
          </div>

          {/* Card 2: 噪聲隔離與純化勝率 */}
          <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center gap-2 mb-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs sm:text-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>2. 為什麼要有「噪聲隔離」？</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              成交量太小的殭屍股容易被大單做出假突破騙線。系統自動把
              <strong className="text-slate-800 dark:text-slate-100">「日均量不足 300 張」</strong>
              的冷門股隔離，計算出的
              <strong className="text-emerald-600 dark:text-emerald-400">「純化勝率」</strong>
              才是你真正買得到、賣得掉的實戰成績。
            </p>
          </div>

          {/* Card 3: 專屬投資組合與歷史驗證 */}
          <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center gap-2 mb-1.5 text-indigo-600 dark:text-indigo-400 font-bold text-xs sm:text-sm">
              <Target className="w-4 h-4 shrink-0" />
              <span>3. 沒有萬用策略，只有天菜配對</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              波動大的半導體適合動能突破，傳產金融適合拉回低接。系統自動推導出每檔股票與策略的
              <strong className="text-indigo-600 dark:text-indigo-400">「專屬高勝率股票池」</strong>
              ，還能切換到歷史回放驗證過去 6 年的牛熊表現！
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
