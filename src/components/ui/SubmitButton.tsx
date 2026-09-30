import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check } from 'lucide-react';

export interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  submitting?: boolean;
  loading?: boolean;
  submittingText?: string;
  loadingText?: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  variant?: 'primary' | 'outline' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  showProgressOnSlow?: boolean;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  children,
  submitting = false,
  loading = false,
  submittingText,
  loadingText,
  icon = Check,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  showProgressOnSlow = true,
  disabled,
  className,
  ...props
}) => {
  const isSubmitting = Boolean(submitting || loading);
  const textOnSubmit = submittingText || loadingText || 'Saving...';
  const [progress, setProgress] = useState(0);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    let timer: any;
    let interval: any;

    if (isSubmitting) {
      setProgress(15);
      // If request takes more than 700ms, mark as slow and animate progress bar
      timer = setTimeout(() => {
        setIsSlow(true);
        interval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 95) {
              clearInterval(interval);
              return 95;
            }
            return prev + Math.floor(Math.random() * 8) + 3;
          });
        }, 300);
      }, 700);
    } else {
      setProgress(0);
      setIsSlow(false);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isSubmitting]);

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-xs',
    lg: 'h-11 px-5 text-sm',
  };

  const variantClasses = {
    primary:
      'bg-[#3ecf8e] hover:bg-[#24b47e] active:bg-[#1fa672] text-[#171717] font-medium border border-transparent shadow-xs',
    outline:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-[#242424] text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-[#2e2e2e]',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-medium border border-transparent shadow-xs',
    amber:
      'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium border border-transparent shadow-xs',
  };

  const isDisabled = Boolean(disabled || isSubmitting);

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === 'function') {
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />;
    }
    return null;
  };

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={cn(
        'relative overflow-hidden rounded-[6px] transition-all duration-150 inline-flex items-center justify-center gap-2 font-sans select-none',
        sizeClasses[size],
        variantClasses[variant],
        fullWidth ? 'w-full' : 'w-auto',
        isDisabled && 'opacity-60 cursor-not-allowed hover:bg-inherit active:scale-100',
        !isDisabled && 'cursor-pointer active:scale-[0.985]',
        className
      )}
      {...props}
    >
      {/* Slow Network Dynamic Progress Bar */}
      {isSubmitting && showProgressOnSlow && isSlow && (
        <div
          className="absolute left-0 bottom-0 top-0 bg-black/15 dark:bg-white/20 transition-all duration-300 pointer-events-none"
          style={{ width: `${progress}%` }}
        />
      )}

      {/* Button Content */}
      <span className="relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap">
        {isSubmitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 stroke-[2.5]" />
            <span>
              {textOnSubmit}
              {isSlow ? ` (${progress}%)` : ''}
            </span>
          </>
        ) : (
          <>
            {renderIcon()}
            <span>{children}</span>
          </>
        )}
      </span>
    </button>
  );
};
