import React from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'activity' | 'default';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id?: string | number;
  type?: ToastType;
  title?: string;
  message?: string;
  description?: string;
  durationMs?: number;
  action?: ToastAction;
}

export type ToastOptions = ToastItem;

interface ToastCardProps {
  id: string | number;
  type: ToastType;
  title?: string;
  description?: string;
  action?: ToastAction;
}

/**
 * Supabase Studio (erpskill.md) Custom Toast Component
 * - Hairline 1px borders (#262626 / #dfdfdf)
 * - Studio Night #141414 dark canvas
 * - Inside top-right subtle dismiss button (no floating badges)
 * - Weight 500 typography & JetBrains Mono tabular numerics
 * - Signature #3ecf8e emerald CTAs with near-black #171717 text
 */
const SupabaseToastCard: React.FC<ToastCardProps> = ({
  id,
  type,
  title,
  description,
  action,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-[#3ecf8e] shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" />;
      case 'info':
      case 'activity':
        return <Info className="w-4 h-4 text-[#3b82f6] dark:text-[#38bdf8] shrink-0 mt-0.5" />;
      case 'loading':
        return <Loader2 className="w-4 h-4 text-[#3ecf8e] animate-spin shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-slate-400 dark:text-[#888888] shrink-0 mt-0.5" />;
    }
  };

  return (
    <div
      data-supabase-toast
      className="w-[360px] max-w-[calc(100vw-32px)] p-3 rounded-[8px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] shadow-xl shadow-black/10 dark:shadow-black/50 flex items-start gap-2.5 select-none transition-all"
    >
      {getIcon()}

      <div className="flex-1 min-w-0 pr-1">
        {title && (
          <div className="text-xs font-sans font-medium text-slate-900 dark:text-[#ededed] tracking-tight leading-snug">
            {title}
          </div>
        )}
        {description && (
          <div className="text-[11.5px] font-sans text-slate-500 dark:text-[#a1a1a1] leading-relaxed mt-0.5 break-words">
            {description}
          </div>
        )}
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              sonnerToast.dismiss(id);
            }}
            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium bg-[#3ecf8e] text-[#171717] rounded-[6px] hover:bg-[#24b47e] active:scale-[0.98] transition-all cursor-pointer"
          >
            {action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => sonnerToast.dismiss(id)}
        className="p-1 -mr-1 -mt-0.5 rounded-[4px] text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-[#ededed] hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors cursor-pointer shrink-0"
        title="Dismiss"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Smart global toast dispatcher adhering to erpskill.md Supabase Design System
 */
export const showToast = (options: ToastOptions): string | number => {
  if (typeof window === 'undefined') return '';

  const { type = 'default', title, message, description, durationMs, action, id } = options;

  try {
    if (type === 'error') {
      triggerHaptic('error');
    } else if (type === 'success') {
      triggerHaptic('success');
    } else {
      triggerHaptic('light');
    }
  } catch {}

  const duration = durationMs ?? (type === 'error' ? 5000 : type === 'loading' ? 6000 : 4000);

  const mainTitle = title || (message && description ? message : undefined);
  const mainDesc = title ? (description || message) : (description || message);

  return sonnerToast.custom(
    (t) => (
      <SupabaseToastCard
        id={t}
        type={type}
        title={mainTitle}
        description={mainDesc}
        action={action}
      />
    ),
    {
      id,
      duration,
    }
  );
};

export const dismissToast = (id?: string | number) => {
  if (typeof window === 'undefined') return;
  if (id !== undefined) {
    sonnerToast.dismiss(id);
  } else {
    sonnerToast.dismiss();
  }
};

/**
 * Smart direct typed helpers (toast.success, toast.error, toast.promise, toast.warning, etc.)
 */
export const toast = Object.assign(
  (message: string, options?: any) => {
    return showToast({
      type: 'default',
      title: options?.title || message,
      description: options?.description || (options?.title ? message : undefined),
      durationMs: options?.duration,
      action: options?.action,
      id: options?.id,
    });
  },
  {
    success: (message: string, options?: any) => {
      const isStr = typeof options === 'string';
      return showToast({
        type: 'success',
        title: isStr ? options : (options?.title || message),
        description: isStr ? message : (options?.title ? message : options?.description),
        durationMs: options?.duration,
        action: options?.action,
        id: options?.id,
      });
    },
    error: (message: string, options?: any) => {
      const isStr = typeof options === 'string';
      return showToast({
        type: 'error',
        title: isStr ? options : (options?.title || message),
        description: isStr ? message : (options?.title ? message : options?.description),
        durationMs: options?.duration,
        action: options?.action,
        id: options?.id,
      });
    },
    warning: (message: string, options?: any) => {
      const isStr = typeof options === 'string';
      return showToast({
        type: 'warning',
        title: isStr ? options : (options?.title || message),
        description: isStr ? message : (options?.title ? message : options?.description),
        durationMs: options?.duration,
        action: options?.action,
        id: options?.id,
      });
    },
    info: (message: string, options?: any) => {
      const isStr = typeof options === 'string';
      return showToast({
        type: 'info',
        title: isStr ? options : (options?.title || message),
        description: isStr ? message : (options?.title ? message : options?.description),
        durationMs: options?.duration,
        action: options?.action,
        id: options?.id,
      });
    },
    loading: (message: string, options?: any) => {
      return showToast({
        type: 'loading',
        title: options?.title || message,
        description: options?.description || (options?.title ? message : undefined),
        durationMs: options?.duration,
        action: options?.action,
        id: options?.id,
      });
    },
    promise: <T,>(
      promise: Promise<T>,
      data: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: any) => string);
      }
    ) => {
      const id = sonnerToast.custom(
        (t) => (
          <SupabaseToastCard
            id={t}
            type="loading"
            title={data.loading}
          />
        ),
        { duration: Infinity }
      );

      promise
        .then((result) => {
          const successMsg = typeof data.success === 'function' ? data.success(result) : data.success;
          sonnerToast.custom(
            (t) => (
              <SupabaseToastCard
                id={t}
                type="success"
                title={successMsg}
              />
            ),
            { id, duration: 4000 }
          );
        })
        .catch((err) => {
          const errorMsg = typeof data.error === 'function' ? data.error(err) : data.error;
          sonnerToast.custom(
            (t) => (
              <SupabaseToastCard
                id={t}
                type="error"
                title={errorMsg}
              />
            ),
            { id, duration: 5000 }
          );
        });

      return id;
    },
    custom: sonnerToast.custom,
    dismiss: dismissToast,
  }
);

/**
 * Master Supabase Design System Toaster Component (erpskill.md specification)
 * - 3D Card Stacking with hover expansion
 * - Hairline 1px borders (#242424 / #dfdfdf)
 * - Emerald #3ecf8e accents and on-primary #171717 action buttons
 * - Weight 500 typography & tabular numeric precision
 */
export const ToastContainer: React.FC = () => {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton={false}
      richColors={false}
      visibleToasts={3}
      offset={20}
      gap={10}
    />
  );
};
