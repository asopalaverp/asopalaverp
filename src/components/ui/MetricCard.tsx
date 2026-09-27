import React from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  badge?: string;
  badgeColor?: 'emerald' | 'amber' | 'blue' | 'rose' | 'neutral';
  statusText?: string;
  statusDotColor?: string;
  icon?: React.ElementType;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  badge,
  badgeColor = 'neutral',
  statusText,
  icon: Icon,
  className,
}) => {
  const badgeClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/12 text-emerald-700 dark:text-[#3ecf8e] border-emerald-500/20',
    amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/20',
    rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/20',
    neutral: 'bg-black/5 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border-black/5 dark:border-white/10',
  };

  return (
    <div
      className={cn(
        'p-3.5 sm:p-4 rounded-[16px] sm:rounded-[18px] ios18-glass-card',
        'space-y-1 font-sans transition-all duration-200 hover:shadow-md select-none min-w-0 overflow-hidden',
        className
      )}
    >
      {/* Top Header: Label & Icon / Badge */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[#8e8e93] dark:text-[#98989d] font-semibold truncate">
          {label}
        </span>
        {badge ? (
          <span
            className={cn(
              'px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono border font-medium shrink-0 whitespace-nowrap',
              badgeClasses[badgeColor]
            )}
          >
            {badge}
          </span>
        ) : Icon ? (
          <Icon className="w-3.5 h-3.5 text-[#8e8e93] dark:text-[#98989d] shrink-0" />
        ) : null}
      </div>

      {/* Main Metric Value */}
      <div className="text-xl sm:text-2xl md:text-[26px] font-semibold font-mono text-[#1c1c1e] dark:text-white tabular-nums tracking-tight truncate">
        {value}
      </div>

      {/* Footer Meta / Status */}
      {(subValue || statusText) && (
        <div className="text-[10.5px] sm:text-[11px] text-[#8e8e93] dark:text-[#98989d] font-sans pt-0.5 truncate">
          {statusText || subValue}
        </div>
      )}
    </div>
  );
};
