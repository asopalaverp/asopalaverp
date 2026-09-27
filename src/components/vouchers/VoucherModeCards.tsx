import React from 'react';
import { Store, Users, Package, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VoucherMode = 'Shop_Vendor' | 'Staff_Split' | 'Courier';

interface VoucherModeCardsProps {
  activeMode: VoucherMode;
  onSelectMode: (mode: VoucherMode) => void;
}

export const VoucherModeCards: React.FC<VoucherModeCardsProps> = ({ activeMode, onSelectMode }) => {
  const modes = [
    {
      id: 'Shop_Vendor' as VoucherMode,
      title: 'Showroom & Vendor Spends',
      description: 'Alterations, Bridal Silk Care, Tailor & Store Spends',
      icon: Store,
    },
    {
      id: 'Staff_Split' as VoucherMode,
      title: 'Staff Floor Meals & Tea',
      description: 'Showroom Floor Staff Evening Tea & Lunch Splits',
      icon: Users,
    },
    {
      id: 'Courier' as VoucherMode,
      title: 'Courier & Saree Dispatch',
      description: 'Maruti, DTDC, Bride Outstation Saree Courier',
      icon: Package,
    },
  ];

  return (
    <div className="space-y-3 font-sans select-none">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#242424]">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/25 flex items-center justify-center text-[10px] font-mono font-medium">
            1
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-zinc-100 font-sans">
            Recipient Classification
          </span>
        </div>
        <span className="text-[11px] font-sans text-slate-400 dark:text-zinc-500">Select mode:</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {modes.map((m) => {
          const Icon = m.icon;
          const isSelected = activeMode === m.id;

          return (
            <div
              key={m.id}
              onClick={() => onSelectMode(m.id)}
              className={cn(
                'relative p-3.5 rounded-[12px] border transition-all duration-150 cursor-pointer select-none group flex flex-col justify-between space-y-2.5 min-h-[105px]',
                isSelected
                  ? 'bg-slate-50 dark:bg-[#202020] border-emerald-500/80 dark:border-emerald-500/80 shadow-xs'
                  : 'bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-[#282828] hover:border-slate-300 dark:hover:border-[#383838]'
              )}
            >
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    'w-7 h-7 rounded-[6px] border flex items-center justify-center transition-colors',
                    isSelected
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-50 dark:bg-[#222222] border-slate-200 dark:border-[#2e2e2e] text-slate-500 dark:text-zinc-400'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 stroke-[1.8]" />
                </div>

                <div className="flex items-center gap-1.5">
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-900 dark:text-zinc-100 block font-sans">
                  {m.title}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-snug font-sans">
                  {m.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
