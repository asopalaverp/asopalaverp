import React from 'react';
import { cn, triggerHaptic } from '@/lib/utils';

export interface SegmentOption<T extends string = string> {
  id?: T;
  value?: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const SegmentedControl = <T extends string = string>({
  options = [],
  value,
  onChange,
  className,
  size = 'md',
  fullWidth = false,
}: SegmentedControlProps<T>) => {
  const getOptKey = (opt: SegmentOption<T>): T => (opt.id ?? opt.value ?? '') as T;

  if (!options || options.length === 0) return null;

  const sizeClasses = {
    sm: 'h-[30px] p-0.5 text-xs',
    md: 'h-[34px] p-0.5 text-xs',
    lg: 'h-[38px] p-1 text-sm',
  };

  const btnSizeClasses = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-3.5 py-1.5 text-sm',
  };

  return (
    <div
      role="tablist"
      className={cn(
        'relative inline-flex items-center rounded-[6px] select-none overflow-x-auto no-scrollbar max-w-full',
        'bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200/80 dark:border-[#282828]',
        fullWidth ? 'w-full flex' : 'w-auto',
        sizeClasses[size],
        className
      )}
    >
      {options.map((option, idx) => {
        const optKey = getOptKey(option);
        const isSelected = optKey === value;
        return (
          <button
            key={optKey || idx}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              if (!isSelected && optKey) {
                triggerHaptic('selection');
                onChange(optKey);
              }
            }}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 h-full whitespace-nowrap transition-all duration-150 cursor-pointer rounded-[4px] font-sans select-none shrink-0',
              btnSizeClasses[size],
              fullWidth && 'flex-1',
              isSelected
                ? 'bg-white dark:bg-[#2b2b2b] text-slate-900 dark:text-white font-semibold shadow-2xs border border-slate-200/80 dark:border-[#383838]'
                : 'text-slate-500 dark:text-[#8e8e8e] hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/[0.04] border border-transparent font-normal'
            )}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span className="whitespace-nowrap">{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none font-semibold ml-0.5',
                  isSelected
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20'
                    : 'bg-slate-200/80 dark:bg-[#2e2e2e] text-slate-600 dark:text-[#a1a1a1]'
                )}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// Backwards compatibility alias
export const IOSSegmentedControl = SegmentedControl;
export default SegmentedControl;
