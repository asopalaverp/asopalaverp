import React, { useRef, useEffect, useState } from 'react';
import { cn, triggerHaptic } from '@/lib/utils';

export interface SegmentOption<T extends string = string> {
  id?: T;
  value?: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

interface IOSSegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const IOSSegmentedControl = <T extends string = string>({
  options = [],
  value,
  onChange,
  className,
  size = 'md',
  fullWidth = false,
}: IOSSegmentedControlProps<T>) => {
  const getOptKey = (opt: SegmentOption<T>): T => (opt.id ?? opt.value ?? '') as T;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const [hasMeasured, setHasMeasured] = useState(false);

  const selectedIndex = options.findIndex((opt) => getOptKey(opt) === value);

  const updateIndicator = () => {
    if (!containerRef.current) return;
    const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
    if (selectedIndex >= 0 && buttons[selectedIndex]) {
      const targetBtn = buttons[selectedIndex];
      const containerRect = containerRef.current.getBoundingClientRect();
      const targetRect = targetBtn.getBoundingClientRect();
      setIndicatorStyle({
        left: targetRect.left - containerRect.left,
        width: targetRect.width,
      });
      setHasMeasured(true);
    }
  };

  useEffect(() => {
    updateIndicator();
    // Update on resize
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [selectedIndex, options]);

  const sizeClasses = {
    sm: 'h-[32px] p-0.5 text-xs',
    md: 'h-[38px] p-1 text-xs sm:text-sm',
    lg: 'h-[44px] p-1.5 text-sm',
  };

  if (!options || options.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={cn(
        'relative inline-flex items-center rounded-[12px] select-none touch-manipulation overflow-x-auto no-scrollbar max-w-full',
        'bg-slate-200/70 dark:bg-white/10 border border-slate-200/80 dark:border-white/10 backdrop-blur-xl',
        fullWidth ? 'w-full flex' : 'w-auto',
        sizeClasses[size],
        className
      )}
    >
      {/* Dynamic Measured Sliding Active Pill Indicator */}
      {hasMeasured && selectedIndex >= 0 && (
        <div
          className={cn(
            'absolute transition-all duration-200 ease-out bg-white dark:bg-[#3a3a3c] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-black/[0.04] dark:border-white/10 pointer-events-none',
            size === 'sm' ? 'top-0.5 bottom-0.5 rounded-[8px]' : size === 'lg' ? 'top-1.5 bottom-1.5 rounded-[10px]' : 'top-1 bottom-1 rounded-[9px]'
          )}
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}

      {/* Segment Buttons */}
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
              'relative z-10 flex items-center justify-center gap-1.5 h-full px-3.5 whitespace-nowrap transition-all duration-150 cursor-pointer rounded-[9px] font-sans font-medium select-none ios-press shrink-0',
              fullWidth && 'flex-1',
              isSelected
                ? 'text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#a1a1a6] hover:text-slate-900 dark:hover:text-white'
            )}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span className="whitespace-nowrap">{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none font-semibold ml-0.5',
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-[#3ecf8e]'
                    : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-[#8e8e93]'
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
