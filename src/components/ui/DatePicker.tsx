import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Lock, ShieldAlert, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOverrideStore } from '@/store/overrideStore';
import { showToast } from '@/components/ui/ToastContainer';
import { cn, triggerHaptic } from '@/lib/utils';

export interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  allowPastDatesOverride?: boolean; // If true, bypasses cashier today lock for special admin tools
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select date...',
  minDate,
  maxDate,
  disabled = false,
  required = false,
  error,
  hint,
  className,
  id,
  'aria-label': ariaLabel,
  allowPastDatesOverride = false,
  size = 'md',
  align = 'left',
}) => {
  const { user, can } = useAuthStore();
  const { isBackdatedAllowed } = useOverrideStore();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);

  // Cashier Date Restriction Engine:
  // Super Admin and Developer have full rights to select any date.
  // Cashiers without backdating rights and without active admin override can only pick today's date.
  const hasBackdateRights = useMemo(() => {
    if (allowPastDatesOverride) return true;
    if (!user) return true;
    if (user.role_code === 'Super_Admin' || user.role_code === 'Developer') return true;
    if (can('can_backdate_voucher')) return true;
    if (isBackdatedAllowed()) return true;
    return false;
  }, [user, can, isBackdatedAllowed, allowPastDatesOverride]);

  const isCashierLockedToToday = !hasBackdateRights;

  // Auto-correct to today's date if cashier is locked and value was set to past/empty
  useEffect(() => {
    if (isCashierLockedToToday && value && value !== todayStr) {
      onChange(todayStr);
    }
  }, [isCashierLockedToToday, value, todayStr, onChange]);

  // Parse current date value
  const parsedDate = value && isValid(parseISO(value)) ? parseISO(value) : null;
  const [viewMonth, setViewMonth] = useState<Date>(parsedDate || today);

  // Update view month when value changes
  useEffect(() => {
    if (parsedDate) {
      setViewMonth(parsedDate);
    }
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Calendar day calculation
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const checkIsDayDisabled = (day: Date): boolean => {
    if (disabled) return true;
    const dayStr = format(day, 'yyyy-MM-dd');

    // If Cashier is restricted to today only:
    if (isCashierLockedToToday && dayStr !== todayStr) {
      return true;
    }

    // Min & Max bounds
    if (minDate && dayStr < minDate) return true;
    if (maxDate && dayStr > maxDate) return true;

    return false;
  };

  const handleSelectDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const isDayDisabled = checkIsDayDisabled(day);

    if (isDayDisabled) {
      triggerHaptic('warning');
      if (isCashierLockedToToday && dayStr !== todayStr) {
        showToast({
          type: 'warning',
          title: 'Date Selection Locked',
          message: `Cashier account is locked to Today's date (${format(today, 'dd-MMM-yyyy')}). Super Admin can toggle backdating in F12 Profile & Security.`,
        });
      }
      return;
    }

    triggerHaptic('selection');
    onChange(dayStr);
    setIsOpen(false);
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'startOfMonth' | 'clear') => {
    const now = new Date();
    if (preset === 'today') {
      triggerHaptic('selection');
      onChange(format(now, 'yyyy-MM-dd'));
      setViewMonth(now);
      setIsOpen(false);
      return;
    }

    if (isCashierLockedToToday) {
      triggerHaptic('warning');
      showToast({
        type: 'warning',
        title: 'Past Date Locked',
        message: 'Cashiers can only record vouchers for today. Super Admin can enable past-date override in F12.',
      });
      return;
    }

    if (preset === 'yesterday') {
      triggerHaptic('selection');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      onChange(format(yesterday, 'yyyy-MM-dd'));
      setViewMonth(yesterday);
    } else if (preset === 'startOfMonth') {
      triggerHaptic('selection');
      const som = startOfMonth(now);
      onChange(format(som, 'yyyy-MM-dd'));
      setViewMonth(som);
    } else if (preset === 'clear') {
      triggerHaptic('light');
      onChange('');
    }
    setIsOpen(false);
  };

  const formattedDisplay = parsedDate ? format(parsedDate, 'dd-MMM-yyyy') : '';

  return (
    <div ref={containerRef} className={cn('relative w-full font-sans', isOpen ? 'z-40' : 'z-auto', className)}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor={id}
            className="block text-xs font-medium text-slate-900 dark:text-white font-sans"
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {isCashierLockedToToday ? (
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
              <Lock className="w-2.5 h-2.5 shrink-0" />
              <span>Today Only</span>
            </span>
          ) : isBackdatedAllowed() ? (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-[#3ecf8e] flex items-center gap-1 font-medium">
              <Zap className="w-2.5 h-2.5 shrink-0" />
              <span>Admin Override Active</span>
            </span>
          ) : null}
        </div>
      )}

      {/* Trigger Button / Input Enclosure */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'w-full rounded-[10px] border flex items-center justify-between gap-2 transition-all cursor-pointer select-none text-xs font-sans',
          size === 'sm' ? 'min-h-[34px] h-[34px] px-2.5 py-1' : size === 'lg' ? 'min-h-[42px] px-3.5 py-2.5' : 'min-h-[38px] px-3 py-2',
          'bg-slate-50/60 dark:bg-[#121212] text-slate-900 dark:text-[#EDEDED]',
          isOpen
            ? 'border-[#3ecf8e] dark:border-[#3ecf8e] ring-2 ring-[#3ecf8e]/20 shadow-xs'
            : 'border-black/[0.08] dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-[#383838]',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-[#1c1c1c]',
          error && 'border-rose-500 ring-2 ring-rose-500/20'
        )}
        aria-label={ariaLabel || label || 'Date picker'}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
          {formattedDisplay ? (
            <span className="font-mono font-medium text-xs text-slate-900 dark:text-white tabular-nums truncate">
              {formattedDisplay}
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-zinc-500 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && !isCashierLockedToToday && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-1 rounded-[4px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
              title="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            className={cn(
              'text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-[4px] border',
              isCashierLockedToToday
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1'
                : 'bg-slate-100 dark:bg-[#222222] text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-[#2e2e2e]'
            )}
          >
            {isCashierLockedToToday && <Lock className="w-2.5 h-2.5 shrink-0" />}
            {parsedDate && isToday(parsedDate) ? 'Today' : 'Pick'}
          </span>
        </div>
      </div>

      {/* Calendar Dropdown Popover */}
      {isOpen && (
        <div className={cn(
          "absolute top-full mt-1.5 z-50 w-[300px] sm:w-[320px] rounded-[16px] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-2xl p-3.5 animate-in fade-in zoom-in-95 duration-100 font-sans",
          align === 'right' ? 'right-0 left-auto' : 'left-0'
        )}>
          {/* Header Note for Cashiers */}
          {isCashierLockedToToday && (
            <div className="mb-2.5 p-2 rounded-[6px] bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-left">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[10px] text-amber-800 dark:text-amber-300 leading-tight">
                <span className="font-semibold block font-mono">CASHIER DATE LOCK ACTIVE</span>
                Only today's date ({format(today, 'dd-MMM-yyyy')}) can be selected. Super Admin can enable past-date entries in Profile & Security.
              </div>
            </div>
          )}

          {/* Month & Year Navigation Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#282828]">
            <button
              type="button"
              disabled={isCashierLockedToToday}
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className={cn(
                'p-1 rounded-[4px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer',
                isCashierLockedToToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-[#242424]'
              )}
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-medium font-mono text-slate-900 dark:text-white tracking-tight">
              {format(viewMonth, 'MMMM yyyy')}
            </span>

            <button
              type="button"
              disabled={isCashierLockedToToday}
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className={cn(
                'p-1 rounded-[4px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer',
                isCashierLockedToToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-[#242424]'
              )}
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 py-1.5 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = parsedDate && isSameDay(day, parsedDate);
              const isCurrentMonth = isSameMonth(day, viewMonth);
              const isCurrentDay = isToday(day);
              const isDayDisabled = checkIsDayDisabled(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  disabled={isDayDisabled && !isCashierLockedToToday}
                  className={cn(
                    'h-7 w-full rounded-[4px] text-xs font-mono flex items-center justify-center transition-colors select-none',
                    isDayDisabled
                      ? 'text-slate-300 dark:text-zinc-600 opacity-30 cursor-not-allowed line-through'
                      : 'cursor-pointer',
                    !isCurrentMonth && !isDayDisabled && 'text-slate-300 dark:text-zinc-600 opacity-40',
                    isCurrentMonth && !isSelected && !isDayDisabled && 'text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#242424]',
                    isCurrentDay && !isSelected && 'border border-[#3ecf8e] text-slate-900 dark:text-white font-semibold',
                    isSelected && 'bg-[#3ecf8e] text-[#171717] font-semibold shadow-xs'
                  )}
                  title={isDayDisabled ? 'Locked (Cashier Today-Only Policy)' : format(day, 'dd-MMM-yyyy')}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Quick Presets Bar */}
          <div className="pt-2.5 mt-2.5 border-t border-slate-200 dark:border-[#282828] flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickPreset('today')}
                className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] text-slate-800 dark:text-zinc-200 font-mono text-[11px] font-medium transition-colors cursor-pointer border border-slate-200 dark:border-[#2e2e2e]"
              >
                Today
              </button>

              <button
                type="button"
                disabled={isCashierLockedToToday}
                onClick={() => handleQuickPreset('yesterday')}
                className={cn(
                  'px-2 py-0.5 rounded-[4px] font-mono text-[11px] transition-colors border',
                  isCashierLockedToToday
                    ? 'opacity-30 cursor-not-allowed bg-slate-100 dark:bg-[#1c1c1c] text-slate-400 border-transparent'
                    : 'bg-slate-50 dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-[#2e2e2e] cursor-pointer'
                )}
                title={isCashierLockedToToday ? 'Yesterday is locked for Cashiers' : 'Pick Yesterday'}
              >
                Yesterday
              </button>
            </div>

            {value && !isCashierLockedToToday && (
              <button
                type="button"
                onClick={() => handleQuickPreset('clear')}
                className="text-[11px] text-slate-400 hover:text-rose-500 font-mono transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-500 font-mono mt-1">{error}</p>}
      {hint && !error && <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-1">{hint}</p>}
    </div>
  );
};
