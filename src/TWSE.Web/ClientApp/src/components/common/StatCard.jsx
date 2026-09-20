import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({
  title,
  value,
  subtitle,
  change,
  changePercent,
  trend = 'neutral', // 'up' | 'down' | 'neutral'
  icon: Icon,
  iconColor = 'text-sky-500 bg-sky-500/10',
  className = '',
  loading = false,
  extra,
}) {
  const trendClasses = {
    up: 'text-rose-500 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
    down: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    neutral: 'text-slate-500 dark:text-slate-400 bg-slate-500/10 border-slate-500/20',
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={`p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase">
          {title}
        </span>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${iconColor} transition-transform group-hover:scale-110 duration-200`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
        ) : (
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {value}
          </span>
        )}
      </div>

      {(subtitle || change !== undefined || changePercent !== undefined || extra) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {(change !== undefined || changePercent !== undefined) && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold tabular-nums ${trendClasses[trend]}`}
              >
                <TrendIcon className="w-3 h-3" />
                {change !== undefined && <span>{change}</span>}
                {changePercent !== undefined && <span>({changePercent})</span>}
              </span>
            )}
            {subtitle && (
              <span className="text-slate-500 dark:text-slate-400">{subtitle}</span>
            )}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}
    </div>
  );
}
