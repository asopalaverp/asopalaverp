import React, { useState, useMemo } from 'react';
import { format, subMinutes, addMinutes } from 'date-fns';
import { ExpenseVoucher } from '@/types/database';
import { cn, formatINR } from '@/lib/utils';
import { Radio, Receipt, Wallet, HandCoins, ShieldCheck } from 'lucide-react';

export interface TelemetryMetrics {
  totalSpend: number;
  cashPaid: number;
  upiPaid: number;
  totalBills: number;
  cashBills: number;
  upiBills: number;
}

export interface LogsBarChartProps {
  metrics: TelemetryMetrics;
  vouchers?: ExpenseVoucher[];
  className?: string;
  selectedMode?: 'ALL' | 'Physical_Cash' | 'Online_UPI';
}

interface BarSlot {
  timeStr: string;
  infos: number;
  warnings: number;
  errors: number;
  total: number;
  amount: number;
}

interface TelemetryCardData {
  id: string;
  serviceName: string;
  subLabel: string;
  value: string | number;
  warningCount: number;
  errorCount: number;
  slots: BarSlot[];
  maxSlotValue: number;
  icon: React.ComponentType<{ className?: string }>;
}

export const LogsBarChart: React.FC<LogsBarChartProps> = ({ metrics, vouchers = [], className, selectedMode = 'ALL' }) => {
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);

  // 26 Time slots spanning the active showroom trading session
  const now = useMemo(() => new Date(), []);
  const startTime = useMemo(() => subMinutes(now, 52), [now]);
  const startTimeStr = useMemo(() => format(startTime, 'MMM dd, h:mmaaa'), [startTime]);
  const endTimeStr = useMemo(() => format(now, 'MMM dd, h:mmaaa'), [now]);

  const numSlots = 26;

  // Asopalav ERP Operational Telemetry Streams (Styled in Supabase Studio Aesthetics)
  const cards = useMemo<TelemetryCardData[]>(() => {
    // Generate 26-slot run-rate solely with real voucher overlays (pure 0 if empty)
    const makeRunRateSlots = (methodFilter?: 'Physical_Cash' | 'Online_UPI', highValueOnly = false) => {
      const slots: BarSlot[] = [];

      for (let i = 0; i < numSlots; i++) {
        const slotTime = addMinutes(startTime, i * 2);
        slots.push({
          timeStr: format(slotTime, 'MMM dd, h:mmaaa'),
          infos: 0,
          warnings: 0,
          errors: 0,
          total: 0,
          amount: 0,
        });
      }

      // Layer real vouchers onto slots
      vouchers.forEach((v) => {
        if (methodFilter && v.payment_method !== methodFilter) return;
        const amt = Number(v.total_amount) || 0;
        if (highValueOnly && amt <= 10000) return;

        const dt = new Date(v.created_at || v.payment_date);
        const slotIdx = Math.abs(dt.getMinutes() + dt.getHours() * 2) % numSlots;

        if (v.status === 'Voided') {
          slots[slotIdx].errors += 1;
        } else if (amt > 10000) {
          slots[slotIdx].warnings += 1;
          slots[slotIdx].infos += 1;
          slots[slotIdx].amount += amt;
        } else {
          slots[slotIdx].infos += 1;
          slots[slotIdx].amount += amt;
        }
      });

      slots.forEach((s) => {
        s.total = s.infos + s.warnings + s.errors;
      });

      return slots;
    };

    if (selectedMode === 'Physical_Cash') {
      const cashSlots = makeRunRateSlots('Physical_Cash');
      const highCashSlots = makeRunRateSlots('Physical_Cash', true);
      const cashVouchers = vouchers.filter((v) => v.payment_method === 'Physical_Cash');
      const cashErrors = cashVouchers.filter((v) => v.status === 'Voided').length;
      const highCashVouchers = cashVouchers.filter((v) => Number(v.total_amount) > 10000 && v.status !== 'Voided');
      const highCashTotal = highCashVouchers.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);

      return [
        {
          id: 'cash-drawer',
          serviceName: 'CASH BOX SPENT',
          subLabel: 'Cash Paid from Drawer',
          value: formatINR(metrics.cashPaid),
          warningCount: highCashVouchers.length,
          errorCount: cashErrors,
          slots: cashSlots,
          maxSlotValue: Math.max(...cashSlots.map((s) => s.total), 1),
          icon: Wallet,
        },
        {
          id: 'cash-high-value',
          serviceName: 'HIGH CASH VOUCHERS (>₹10K)',
          subLabel: 'Store Manager Audit Required',
          value: formatINR(highCashTotal),
          warningCount: highCashVouchers.length,
          errorCount: 0,
          slots: highCashSlots,
          maxSlotValue: Math.max(...highCashSlots.map((s) => s.total), 1),
          icon: ShieldCheck,
        },
        {
          id: 'cash-audit',
          serviceName: 'VOIDED CASH TRANSACTIONS',
          subLabel: 'Zero Tolerance Audit Flags',
          value: `${cashErrors} voided`,
          warningCount: 0,
          errorCount: cashErrors,
          slots: cashSlots,
          maxSlotValue: Math.max(...cashSlots.map((s) => s.total), 1),
          icon: Receipt,
        },
      ];
    }

    if (selectedMode === 'Online_UPI') {
      const upiSlots = makeRunRateSlots('Online_UPI');
      const highUpiSlots = makeRunRateSlots('Online_UPI', true);
      const upiVouchers = vouchers.filter((v) => v.payment_method === 'Online_UPI');
      const upiErrors = upiVouchers.filter((v) => v.status === 'Voided').length;
      const highUpiVouchers = upiVouchers.filter((v) => Number(v.total_amount) > 10000 && v.status !== 'Voided');
      const highUpiTotal = highUpiVouchers.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);

      return [
        {
          id: 'upi-bank',
          serviceName: 'UPI & BANK SPENT',
          subLabel: 'Online QR & Bank Transfers',
          value: formatINR(metrics.upiPaid),
          warningCount: highUpiVouchers.length,
          errorCount: upiErrors,
          slots: upiSlots,
          maxSlotValue: Math.max(...upiSlots.map((s) => s.total), 1),
          icon: HandCoins,
        },
        {
          id: 'upi-high-value',
          serviceName: 'HIGH BANK VOUCHERS (>₹10K)',
          subLabel: 'NEFT / RTGS / Bank Disbursals',
          value: formatINR(highUpiTotal),
          warningCount: highUpiVouchers.length,
          errorCount: 0,
          slots: highUpiSlots,
          maxSlotValue: Math.max(...highUpiSlots.map((s) => s.total), 1),
          icon: ShieldCheck,
        },
        {
          id: 'upi-audit',
          serviceName: 'VOIDED ONLINE TRANSACTIONS',
          subLabel: 'Disputed or Cancelled QR',
          value: `${upiErrors} voided`,
          warningCount: 0,
          errorCount: upiErrors,
          slots: upiSlots,
          maxSlotValue: Math.max(...upiSlots.map((s) => s.total), 1),
          icon: Receipt,
        },
      ];
    }

    const totalSpendSlots = makeRunRateSlots();
    const cashDrawerSlots = makeRunRateSlots('Physical_Cash');
    const upiOnlineSlots = makeRunRateSlots('Online_UPI');

    const totalErrors = vouchers.filter((v) => v.status === 'Voided').length;
    const totalWarnings = vouchers.filter((v) => Number(v.total_amount) > 10000).length;

    return [
      {
        id: 'total-spend',
        serviceName: 'ALL MONEY SPENT',
        subLabel: 'Cash + Online UPI Payments',
        value: formatINR(metrics.totalSpend),
        warningCount: totalWarnings,
        errorCount: totalErrors,
        slots: totalSpendSlots,
        maxSlotValue: Math.max(...totalSpendSlots.map((s) => s.total), 1),
        icon: Receipt,
      },
      {
        id: 'cash-drawer',
        serviceName: 'CASH BOX SPENT',
        subLabel: 'Cash Paid from Cash Box',
        value: formatINR(metrics.cashPaid),
        warningCount: vouchers.filter((v) => v.payment_method === 'Physical_Cash' && Number(v.total_amount) > 10000).length,
        errorCount: vouchers.filter((v) => v.payment_method === 'Physical_Cash' && v.status === 'Voided').length,
        slots: cashDrawerSlots,
        maxSlotValue: Math.max(...cashDrawerSlots.map((s) => s.total), 1),
        icon: Wallet,
      },
      {
        id: 'upi-bank',
        serviceName: 'UPI & BANK PAYMENTS',
        subLabel: 'Online QR & Bank Transfers',
        value: formatINR(metrics.upiPaid),
        warningCount: vouchers.filter((v) => v.payment_method === 'Online_UPI' && Number(v.total_amount) > 10000).length,
        errorCount: vouchers.filter((v) => v.payment_method === 'Online_UPI' && v.status === 'Voided').length,
        slots: upiOnlineSlots,
        maxSlotValue: Math.max(...upiOnlineSlots.map((s) => s.total), 1),
        icon: HandCoins,
      },
    ];
  }, [startTime, numSlots, vouchers, metrics, selectedMode]);

  return (
    <div className={cn('select-none font-sans', className)}>
      {/* 3-Column Enterprise Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {cards.map((card) => {
          return (
            <div
              key={card.id}
              className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] space-y-3.5 shadow-xs transition-all hover:border-slate-300 dark:hover:border-[#333333] relative group"
            >
              {/* TOP HEADER: SERVICE NAME + WARNINGS & ERRORS */}
              <div className="flex items-start justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-medium truncate pr-2">
                  {card.serviceName}
                </div>

                <div className="flex items-center gap-4 text-xs font-mono tracking-wider shrink-0">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                    <span>WARNINGS</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                    <span>ERRORS</span>
                  </div>
                </div>
              </div>

              {/* SECOND ROW: BIG MONOSPACE TABULAR NUMBER + ALIGNED COUNTS */}
              <div className="flex items-baseline justify-between">
                <div className="text-3xl font-mono font-medium tabular-nums text-slate-900 dark:text-white tracking-tight">
                  {card.value}
                </div>

                <div className="flex items-center gap-4 text-base font-mono tabular-nums text-slate-700 dark:text-zinc-300 font-medium shrink-0">
                  <span className="w-16 text-right">{card.warningCount}</span>
                  <span className="w-12 text-right">{card.errorCount}</span>
                </div>
              </div>

              {/* HISTOGRAM BAR CHART CONTAINER WITH FLOATING TOOLTIP */}
              <div className="relative pt-4 pb-1">
                {/* 26 SLENDER VERTICAL BARS */}
                <div className="h-24 flex items-end gap-[3px] sm:gap-1">
                  {card.slots.map((slot, sIdx) => {
                    const isHovered = hoveredCardId === card.id && hoveredSlotIndex === sIdx;
                    // Scale height between 10% and 100%
                    const totalHeightPct =
                      slot.total > 0
                        ? Math.max(12, Math.min(100, Math.round((slot.total / card.maxSlotValue) * 100)))
                        : 0;

                    // Proportions for stacked segments
                    const errorPct = slot.total > 0 ? (slot.errors / slot.total) * totalHeightPct : 0;
                    const warningPct = slot.total > 0 ? (slot.warnings / slot.total) * totalHeightPct : 0;
                    const infoPct = slot.total > 0 ? (slot.infos / slot.total) * totalHeightPct : 0;

                    return (
                      <div
                        key={sIdx}
                        onMouseEnter={() => {
                          setHoveredCardId(card.id);
                          setHoveredSlotIndex(sIdx);
                        }}
                        onMouseLeave={() => {
                          setHoveredCardId(null);
                          setHoveredSlotIndex(null);
                        }}
                        className="flex-1 h-full flex flex-col justify-end cursor-pointer group/bar relative py-0.5"
                      >
                        {slot.total > 0 ? (
                          <div
                            className="w-full flex flex-col justify-end rounded-t-[1px] overflow-hidden transition-all duration-150"
                            style={{ height: `${totalHeightPct}%` }}
                          >
                            {/* Emerald Info Segment (Top) */}
                            {infoPct > 0 && (
                              <div
                                style={{ height: `${(infoPct / totalHeightPct) * 100}%` }}
                                className={cn(
                                  'w-full transition-colors',
                                  isHovered
                                    ? 'bg-[#3ecf8e]'
                                    : 'bg-[#00623e] dark:bg-[#08633f] hover:bg-[#3ecf8e]'
                                )}
                              />
                            )}

                            {/* Amber Warning Segment (Middle) */}
                            {warningPct > 0 && (
                              <div
                                style={{ height: `${(warningPct / totalHeightPct) * 100}%` }}
                                className={cn(
                                  'w-full transition-colors',
                                  isHovered ? 'bg-[#fbbf24]' : 'bg-[#b45309]'
                                )}
                              />
                            )}

                            {/* Red Error Segment (Bottom) */}
                            {errorPct > 0 && (
                              <div
                                style={{ height: `${(errorPct / totalHeightPct) * 100}%` }}
                                className={cn(
                                  'w-full transition-colors',
                                  isHovered ? 'bg-[#f87171]' : 'bg-[#ef4444]'
                                )}
                              />
                            )}
                          </div>
                        ) : (
                          // Grounding subtle baseline dot for empty slots
                          <div className="w-full h-0.5 bg-slate-200 dark:bg-[#202020] rounded-[1px] group-hover/bar:bg-zinc-600 transition-colors" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* SUPABASE STUDIO FLOATING POPOVER TOOLTIP */}
                {hoveredCardId === card.id && hoveredSlotIndex !== null && card.slots[hoveredSlotIndex] && (
                  <div
                    style={{
                      left: `${Math.max(8, Math.min(92, ((hoveredSlotIndex + 0.5) / card.slots.length) * 100))}%`,
                      bottom: '102%',
                    }}
                    className="absolute -translate-x-1/2 z-30 pointer-events-none p-2.5 rounded-[6px] bg-[#1c1c1c] border border-[#333333] shadow-2xl space-y-1.5 min-w-[140px]"
                  >
                    <div className="text-[10px] font-mono text-zinc-400 font-medium pb-1 border-b border-[#2e2e2e]">
                      {card.slots[hoveredSlotIndex].timeStr}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-[1px] bg-[#3ecf8e] shrink-0" />
                          <span className="text-[11px] font-sans text-zinc-300">Settled</span>
                        </div>
                        <span className="text-[11px] font-mono font-medium text-white tabular-nums">
                          {card.slots[hoveredSlotIndex].infos} bills
                        </span>
                      </div>

                      {card.slots[hoveredSlotIndex].warnings > 0 && (
                        <div className="flex items-center justify-between text-xs gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-[1px] bg-[#f59e0b] shrink-0" />
                            <span className="text-[11px] font-sans text-zinc-300">High-Ticket</span>
                          </div>
                          <span className="text-[11px] font-mono font-medium text-white tabular-nums">
                            {card.slots[hoveredSlotIndex].warnings}
                          </span>
                        </div>
                      )}

                      {card.slots[hoveredSlotIndex].errors > 0 && (
                        <div className="flex items-center justify-between text-xs gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-[1px] bg-[#ef4444] shrink-0" />
                            <span className="text-[11px] font-sans text-zinc-300">Voided</span>
                          </div>
                          <span className="text-[11px] font-mono font-medium text-white tabular-nums">
                            {card.slots[hoveredSlotIndex].errors}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* BOTTOM TIME AXIS LABELS */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-[#222222]">
                  <span>{startTimeStr}</span>
                  <span>{endTimeStr}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LogsBarChart;
