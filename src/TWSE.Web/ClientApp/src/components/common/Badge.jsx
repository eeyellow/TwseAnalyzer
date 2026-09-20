import React from 'react';

export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  pulse = false,
  className = '',
}) {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  };

  const variantClasses = {
    buy: 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30',
    sell: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
    hold: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
    neutral: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700/60',
    sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30',
    purple: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30',
  };

  const dotColor = {
    buy: 'bg-rose-500',
    sell: 'bg-emerald-500',
    hold: 'bg-amber-500',
    neutral: 'bg-slate-400',
    sky: 'bg-sky-500',
    purple: 'bg-indigo-500',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[variant] || 'bg-current'} ${pulse ? 'animate-pulse-glow' : ''}`}
        />
      )}
      {children}
    </span>
  );
}
