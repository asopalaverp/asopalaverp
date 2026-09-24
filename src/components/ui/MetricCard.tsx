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
  statusDotColor,
  icon: Icon,
  className,
}) => {
  const badgeClasses: Record<string, string> = {
    emerald: 'badge-status-emerald',
    amber: 'badge-status-amber',
    blue: 'badge-status-blue',
    rose: 'badge-status-rose',
    neutral: 'badge-status-neutral',
  };

  return (
    <div
      className={cn(
        'p-3.5 sm:p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] shadow-xs space-y-1 font-sans transition-all',
        className
      )}
    >
      {/* Top Header: Label & Icon / Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-medium truncate">
          {label}
        </span>
        {badge ? (
          <span
            className={cn(
              'px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono border font-medium truncate',
              badgeClasses[badgeColor]
            )}
          >
            {badge}
          </span>
        ) : Icon ? (
          <Icon className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
        ) : null}
      </div>

      {/* Main Metric Value: Strict Monochrome & Tabular Numbers */}
      <div className="text-2xl font-medium font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
        {value}
      </div>

      {/* Footer Meta / Status */}
      {(subValue || statusText) && (
        <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans pt-0.5 truncate">
          {statusText || subValue}
        </div>
      )}
    </div>
  );
};
