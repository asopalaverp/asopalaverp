import React, { useEffect } from 'react';
import { cn, triggerHaptic } from '@/lib/utils';
import { useScrollLock } from '@/hooks/useScrollLock';

export interface IOSActionItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}

interface IOSActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: IOSActionItem[];
  cancelText?: string;
}

export const IOSActionSheet: React.FC<IOSActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  actions,
  cancelText = 'Cancel',
}) => {
  useScrollLock(isOpen);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end p-2.5 sm:p-4 select-none touch-manipulation">
      {/* Backdrop */}
      <div
        onClick={() => {
          triggerHaptic('light');
          onClose();
        }}
        className="fixed inset-0 bg-black/40 dark:bg-black/65 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />

      {/* Sheet Container */}
      <div className="relative w-full max-w-md mx-auto space-y-2 z-10 animate-in slide-in-from-bottom duration-250 ease-out">
        {/* Actions Card */}
        <div className="rounded-[20px] ios18-glass-card shadow-2xl overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.08]">
          {/* Header */}
          {(title || subtitle) && (
            <div className="px-4 py-3 text-center space-y-0.5">
              {title && (
                <div className="text-xs font-semibold text-[#1c1c1e] dark:text-white font-sans">
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="text-[11px] text-[#8e8e93] dark:text-[#98989d] font-sans">
                  {subtitle}
                </div>
              )}
            </div>
          )}

          {/* Action List */}
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                triggerHaptic(action.destructive ? 'error' : 'selection');
                action.onClick();
                onClose();
              }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 text-left text-sm font-medium transition-colors cursor-pointer',
                'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.08] dark:active:bg-white/[0.1]',
                action.destructive
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[#007aff] dark:text-[#3ecf8e]'
              )}
            >
              <div className="flex items-center gap-3">
                {action.icon && <span className="shrink-0">{action.icon}</span>}
                <div>
                  <div className="font-medium text-xs sm:text-sm text-[#1c1c1e] dark:text-white">
                    {action.label}
                  </div>
                  {action.description && (
                    <div className="text-[11px] text-[#8e8e93] dark:text-[#98989d]">
                      {action.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Separate iOS Cancel Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="w-full h-12 rounded-[20px] ios18-glass-card text-[#007aff] dark:text-[#3ecf8e] font-semibold text-sm shadow-lg flex items-center justify-center cursor-pointer ios18-press"
        >
          {cancelText}
        </button>
      </div>
    </div>
  );
};
