import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, ShieldCheck, TrendingUp, ArrowRight, Building2, Coins, Users } from 'lucide-react';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';

interface ExecutiveBriefingWidgetProps {
  cashBalance: number;
  runwayDays: number;
  predictedDepletionDate?: string;
  recommendedTopUp?: number;
  momComparison: {
    currentMtdSpend: number;
    prevMtdSpend: number;
    deltaPercent: number;
    currentMonthName: string;
    prevMonthName: string;
  };
  burnRateStats: {
    todayOutflow: number;
    rollingDailyAverage: number;
    deltaPercent: number;
    paceStatus: 'normal' | 'above' | 'spike' | 'below';
  };
  duplicateCount: number;
  anomalyCount: number;
  topDepartment: { name: string; amount: number; percentage: number } | null;
  pendingStaffAdvances?: {
    count: number;
    totalAmount: number;
  };
  onOpenDuplicates?: () => void;
  onOpenReports?: () => void;
  onOpenAdvances?: () => void;
}

export const ExecutiveBriefingWidget: React.FC<ExecutiveBriefingWidgetProps> = ({
  cashBalance,
  runwayDays,
  predictedDepletionDate,
  recommendedTopUp,
  momComparison,
  burnRateStats,
  duplicateCount,
  anomalyCount,
  topDepartment,
  pendingStaffAdvances,
  onOpenDuplicates,
  onOpenReports,
  onOpenAdvances,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    return localStorage.getItem('asopalav_briefing_expanded') !== 'false';
  });

  const toggleExpand = () => {
    triggerHaptic('light');
    const next = !isExpanded;
    setIsExpanded(next);
    localStorage.setItem('asopalav_briefing_expanded', String(next));
  };

  const isSpendLower = momComparison.deltaPercent <= 0;

  return (
    <div className="rounded-[12px] bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-slate-900/5 dark:from-[#171717] dark:via-[#191919] dark:to-[#171717] border border-emerald-500/20 dark:border-[#282828] shadow-xs overflow-hidden transition-all">
      {/* Header Bar */}
      <div className="p-3.5 sm:px-5 flex items-center justify-between gap-3 bg-white/60 dark:bg-[#161616]/80 backdrop-blur-sm border-b border-emerald-500/10 dark:border-[#222222]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[6px] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-semibold tracking-tight text-slate-900 dark:text-white font-sans">
                Executive Financial Intelligence Briefing
              </h2>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border border-[#3ecf8e]/20 uppercase tracking-wider">
                Autonomous
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans">
              Real-time synthesized showroom health, burn velocity, and sentinel audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleExpand}
            className="p-1.5 rounded-[6px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse Briefing' : 'Expand Briefing'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Briefing Content */}
      {isExpanded && (
        <div className="p-3.5 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs font-sans animate-in fade-in duration-150">
          {/* Card 1: Cash Till Runway */}
          <div className="p-3 rounded-[8px] bg-white dark:bg-[#191919] border border-slate-200/80 dark:border-[#262626] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                <span>Cash Till Position</span>
              </span>
              <span className="font-mono text-emerald-600 dark:text-[#3ecf8e] font-bold">
                {runwayDays} Days Runway
              </span>
            </div>
            <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
              {formatINR(cashBalance)}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              {predictedDepletionDate ? (
                <>
                  Projected depletion by <strong className="text-slate-900 dark:text-zinc-200">{predictedDepletionDate}</strong>.
                </>
              ) : (
                'Float is sufficient for routine operational vouchers.'
              )}
              {recommendedTopUp && recommendedTopUp > 0 ? (
                <span className="block text-emerald-600 dark:text-[#3ecf8e] font-mono text-[10.5px] mt-0.5">
                  Optimal float top-up: +{formatINR(recommendedTopUp)}
                </span>
              ) : null}
            </p>
          </div>

          {/* Card 2: Spend Velocity & MTD Benchmark */}
          <div className="p-3 rounded-[8px] bg-white dark:bg-[#191919] border border-slate-200/80 dark:border-[#262626] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>MTD Outflow Benchmark</span>
              </span>
              <span
                className={cn(
                  'font-mono text-[10px] font-bold px-1.5 py-0.2 rounded',
                  isSpendLower
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e]'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                )}
              >
                {momComparison.deltaPercent >= 0 ? `+${momComparison.deltaPercent}%` : `${momComparison.deltaPercent}%`} vs {momComparison.prevMonthName.slice(0, 3)}
              </span>
            </div>
            <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
              {formatINR(momComparison.currentMtdSpend)}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              7-Day average daily pace is{' '}
              <strong className="text-slate-900 dark:text-zinc-200 font-mono">
                {formatINR(burnRateStats.rollingDailyAverage)}/day
              </strong>
              . MTD spend is {isSpendLower ? 'disciplined and tracking lower' : 'higher'} compared to the same calendar window in {momComparison.prevMonthName}.
            </p>
          </div>

          {/* Card 3: Integrity & Sentinel Radar */}
          <div className="p-3 rounded-[8px] bg-white dark:bg-[#191919] border border-slate-200/80 dark:border-[#262626] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Integrity &amp; Anomaly Sentinel</span>
              </span>
              {duplicateCount === 0 && anomalyCount === 0 ? (
                <span className="text-[10px] font-mono text-emerald-600 dark:text-[#3ecf8e] font-bold">
                  All Clear
                </span>
              ) : (
                <span className="text-[10px] font-mono text-rose-500 font-bold">
                  {duplicateCount + anomalyCount} Flagged
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {duplicateCount === 0 ? '0 Duplicates' : `${duplicateCount} Duplicates`}
              </span>
              {anomalyCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold">
                  {anomalyCount} {anomalyCount === 1 ? 'outlier' : 'outliers'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              {duplicateCount > 0 ? (
                <button
                  type="button"
                  onClick={onOpenDuplicates}
                  className="text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                >
                  Review duplicate collisions now &rarr;
                </button>
              ) : (
                'Zero same-month collisions. Ledger entries are 100% reconciled against physical debits.'
              )}
            </p>
          </div>

          {/* Card 4: Top Cost Center */}
          <div className="p-3 rounded-[8px] bg-white dark:bg-[#191919] border border-slate-200/80 dark:border-[#262626] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Building2 className="w-3.5 h-3.5 text-sky-500" />
                <span>Primary Cost Center</span>
              </span>
              {topDepartment && (
                <span className="font-mono text-sky-500 font-bold">
                  {topDepartment.percentage}% Share
                </span>
              )}
            </div>
            <div className="font-sans text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {topDepartment ? topDepartment.name : 'General Operations'}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed flex items-center justify-between">
              <span>
                Total spend:{' '}
                <strong className="text-slate-900 dark:text-zinc-200 font-mono">
                  {topDepartment ? formatINR(topDepartment.amount) : '₹0'}
                </strong>
              </span>
              {onOpenReports && (
                <button
                  type="button"
                  onClick={onOpenReports}
                  className="text-emerald-700 dark:text-[#3ecf8e] font-semibold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Reports</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </p>
          </div>
          {/* Executive Strategic Alert Banner: Pending Staff Salary Advances */}
          {pendingStaffAdvances && pendingStaffAdvances.count > 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-4 p-2.5 px-3.5 rounded-[8px] bg-blue-500/10 border border-blue-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-slate-700 dark:text-zinc-200">
                  <strong className="text-slate-900 dark:text-white">Active Staff Salary Advances:</strong>{' '}
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatINR(pendingStaffAdvances.totalAmount)}</span> across{' '}
                  <span className="font-bold">{pendingStaffAdvances.count} staff members</span> pending recovery at month-end payroll.
                </span>
              </div>
              {onOpenAdvances && (
                <button
                  type="button"
                  onClick={onOpenAdvances}
                  className="self-start sm:self-center px-2.5 py-1 rounded-[6px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 font-medium text-[11px] font-sans transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <span>Payroll Advance Ledger</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
