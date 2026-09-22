import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Star,
  Briefcase,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

export default function Sidebar({
  currentPage,
  onSelectPage,
  collapsed,
  onToggleCollapse,
  badgeCounts = {},
}) {
  const navItems = [
    {
      id: 'dashboard',
      label: '儀表板總覽',
      icon: LayoutDashboard,
      description: '資產與最新訊號摘要',
    },
    {
      id: 'scheduled',
      label: '排程盤前分析',
      icon: Bot,
      badge: badgeCounts.signals,
      badgeVariant: 'buy',
      description: '每日自動策略掃描報告',
    },
    {
      id: 'tracking',
      label: '自選監控行情',
      icon: Star,
      badge: badgeCounts.tracked,
      description: '技術指標與自選清單',
    },
    {
      id: 'portfolio',
      label: '持股庫存管理',
      icon: Briefcase,
      badge: badgeCounts.holdings,
      description: '真實持股與未實現損益',
    },
    {
      id: 'analysis',
      label: '策略組合掃描',
      icon: SlidersHorizontal,
      description: '多策略組合選股與持股健檢',
    },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-30 flex flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#0d121f]/95 backdrop-blur-md transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white leading-tight">
                TWSE Analyzer
              </span>
              <span className="text-[11px] font-medium text-sky-500 tracking-wider uppercase">
                PRO TERMINAL
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={collapsed ? '展開側邊欄' : '收合側邊欄'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-500 rounded-r-full" />
              )}
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive
                    ? 'text-sky-500 dark:text-sky-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              {!collapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                        item.badgeVariant === 'buy'
                          ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer System Status */}
      {!collapsed && (
        <div className="p-4 m-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span>系統排程狀態</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-glow" />
              運作中
            </span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            每日 18:00 自動下載歷史數據與運算策略
          </div>
        </div>
      )}
    </aside>
  );
}
