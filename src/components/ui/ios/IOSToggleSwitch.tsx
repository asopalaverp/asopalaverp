import React from 'react';
import { cn, triggerHaptic } from '@/lib/utils';

interface IOSToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
}

export const IOSToggleSwitch: React.FC<IOSToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className,
}) => {
  const handleToggle = () => {
    if (disabled) return;
    triggerHaptic('light');
    onChange(!checked);
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {(label || description) && (
        <div className="flex flex-col cursor-pointer" onClick={handleToggle}>
          {label && (
            <span className="text-xs sm:text-sm font-medium text-[#1c1c1e] dark:text-white">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-[#8e8e93] dark:text-[#98989d]">
              {description}
            </span>
          )}
        </div>
      )}

      {/* iOS 16 Cupertino Pill Switch Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          'relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out touch-manipulation focus:outline-none',
          checked
            ? 'bg-[#3ecf8e] dark:bg-[#3ecf8e]'
            : 'bg-[#e9e9ea] dark:bg-[#39393d]'
        )}
      >
        {/* iOS Sliding Circular Knob */}
        <span
          className={cn(
            'pointer-events-none inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] ring-0 transition-transform duration-250 ease-in-out',
            checked ? 'translate-x-[20px]' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
};
