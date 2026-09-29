import React from 'react';
import { KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SupabaseFieldRowProps {
  columnName?: string;
  label?: string;
  dataType?: string;
  required?: boolean;
  isPrimaryKey?: boolean;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  showDataType?: boolean;
}

// Convert snake_case column names to clean Title Case labels
function humanizeColumnName(col: string): string {
  if (!col) return '';
  if (col.toLowerCase() === 'id') return 'ID Code';
  return col
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const SupabaseFieldRow: React.FC<SupabaseFieldRowProps> = ({
  columnName = '',
  label,
  dataType,
  required = false,
  isPrimaryKey = false,
  description,
  badge,
  children,
  className,
  showDataType = false,
}) => {
  const displayLabel = label || humanizeColumnName(columnName);

  return (
    <div className={cn('space-y-1.5 font-sans text-left', className)}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isPrimaryKey && (
            <span className="text-amber-500 shrink-0 flex items-center" title="Record Identifier">
              <KeyRound className="w-3.5 h-3.5" />
            </span>
          )}
          <label className="text-xs font-medium text-slate-800 dark:text-[#EDEDED] font-sans select-none truncate">
            {displayLabel}
          </label>
          {required && <span className="text-rose-500 font-sans font-bold" title="Required field">*</span>}
          {badge}
        </div>

        {showDataType && dataType && (
          <span className="font-mono text-[10.5px] text-slate-400 dark:text-[#707070] select-none lowercase">
            {dataType}
          </span>
        )}
      </div>

      <div className="relative">
        {children}
      </div>

      {description && (
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
};

