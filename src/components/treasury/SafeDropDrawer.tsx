import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { erpService } from '@/lib/erpService';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { formatINR, numberToWordsINR, cn, triggerHaptic, normalizeBranchCode } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import {
  ShieldCheck,
  Wallet,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  User,
  Building2,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface SafeDropDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  currentCashBalance: number;
  onSuccess: () => void;
}

const PRESET_AMOUNTS = [5000, 10000, 20000, 30000, 50000];

const REASON_PRESETS = [
  'Excess Cash moved to Safe',
  'Shop Safe Deposit',
  'Daily Closing Cash Drop',
  'Mid-Day Cash Skim',
];

export const SafeDropDrawer: React.FC<SafeDropDrawerProps> = ({
  isOpen,
  onClose,
  branchId,
  currentCashBalance,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const { branches, getActiveBranch } = useBranchStore();

  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const targetCode = normalizeBranchCode(branchId);
  const activeBranch = branches.find((b) => b.branch_id === branchId || normalizeBranchCode(b.branch_id) === targetCode || normalizeBranchCode(b.branch_code) === targetCode) || getActiveBranch();
  const excessCash = Math.max(0, currentCashBalance - 40000);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount('');
      setReason('');
    }
  }, [isOpen]);

  const numAmount = Number(amount) || 0;
  const remainingBalance = currentCashBalance - numAmount;
  const isOverBalance = numAmount > currentCashBalance;

  const handleQuickAdd = (increment: number) => {
    triggerHaptic('selection');
    setAmount((prev) => {
      const cur = Number(prev) || 0;
      const next = cur + increment;
      return Math.min(next, currentCashBalance);
    });
  };

  const handleSetExact = (val: number) => {
    triggerHaptic('selection');
    setAmount(Math.min(val, currentCashBalance));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      const msg = 'Please enter an amount to move to safe greater than ₹0.';
      setError(msg);
      showToast({ type: 'error', title: 'Invalid Amount', message: msg });
      return;
    }
    if (isOverBalance) {
      const msg = `Transfer amount cannot exceed available cash in box (${formatINR(currentCashBalance)}).`;
      setError(msg);
      showToast({ type: 'error', title: 'Insufficient Cash', message: msg });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
      const verifiedBy = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();

      await erpService.recordSafeDrop({
        branchId: activeBranch.branch_id,
        branchCode: activeBranch.branch_code,
        amount: numAmount,
        reason: reason.trim() || 'Moved excess cash to shop safe vault',
        transferredByName: userName,
        verifiedByName: verifiedBy,
      });

      triggerHaptic('heavy');
      showToast({
        type: 'success',
        title: 'Cash Moved to Safe',
        message: `${formatINR(numAmount)} moved from cash box to shop safe!`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error executing safe drop:', err);
      setError(err.message || 'Failed to move cash to safe.');
    } finally {
      setSubmitting(false);
    }
  };

  const drawerFooter = (
    <>
      <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
        <span className="text-slate-500 dark:text-zinc-400">Total to Move:</span>
        <span className="text-sm font-mono font-bold text-slate-900 dark:text-white tabular-nums">
          {numAmount > 0 ? formatINR(numAmount) : '₹0'}
        </span>
        {numAmount > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono hidden md:inline truncate max-w-[180px]">
            ({numberToWordsINR(numAmount)})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-3.5 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#282828] text-xs font-medium font-sans cursor-pointer transition-colors min-h-[34px]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || numAmount <= 0 || isOverBalance}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed shadow-xs min-h-[34px]"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
          <span>{submitting ? 'Moving Cash...' : `Confirm & Move Cash`}</span>
        </button>
      </div>
    </>
  );

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Move Cash to Safe"
      subtitle={`${activeBranch.branch_name} (${activeBranch.branch_code}) • Transfer Cash to Shop Safe`}
      badge={
        <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium badge-status-amber">
          Safe Transfer
        </span>
      }
      footer={drawerFooter}
    >
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto w-full space-y-5">
        {/* 1. Live Till Snapshot Card */}
        <div className="p-4 rounded-[12px] bg-slate-50 dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#2a2a2a] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[6px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] border border-emerald-500/20 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold block">
                  Cash in Box
                </span>
                <span className="text-base font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatINR(currentCashBalance)}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
                Safe Ceiling
              </span>
              <span className="text-xs font-mono font-medium text-slate-600 dark:text-zinc-300">
                ₹50,000 max
              </span>
            </div>
          </div>

          {/* Safety Status Callout */}
          {currentCashBalance > 50000 ? (
            <div className="p-2.5 rounded-[8px] badge-status-amber flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="block font-medium">Excess Till Cash Warning</strong>
                <span className="text-[11px] opacity-90">
                  Cash in drawer exceeds the ₹50,000 ceiling. Recommended skim: {formatINR(excessCash)}.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-[#3ecf8e] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Till cash is within safe operational limits.</span>
            </div>
          )}
        </div>

        {/* 2. Transfer Amount Fast-Pad */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
              Amount to Transfer to Safe (₹) *
            </label>
            {numAmount > 0 && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-lg">
              ₹
            </span>
            <input
              type="number"
              min="1"
              max={currentCashBalance}
              value={amount}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                setAmount(val);
                setError(null);
              }}
              placeholder="0"
              className={cn(
                'w-full bg-white dark:bg-[#141414] border rounded-[8px] pl-9 pr-4 py-2.5 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white focus:outline-none min-h-[46px] shadow-xs transition-colors',
                isOverBalance
                  ? 'border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/30'
                  : 'border-slate-300 dark:border-[#2e2e2e] focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30'
              )}
              autoFocus
            />
          </div>

          {/* Words Preview */}
          {numAmount > 0 && (
            <div className="text-[11px] font-mono text-emerald-600 dark:text-[#3ecf8e] flex items-center gap-1.5 px-1">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{numberToWordsINR(numAmount)}</span>
            </div>
          )}

          {/* Quick Preset Buttons */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-semibold block">
              1-Tap Quick Fast-Pads
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {excessCash > 0 && (
                <button
                  type="button"
                  onClick={() => handleSetExact(excessCash)}
                  className="px-2.5 py-1.5 rounded-[6px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-mono font-bold text-amber-700 dark:text-amber-300 transition-colors cursor-pointer active:scale-95 shadow-2xs flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Skim Excess ({formatINR(excessCash)})</span>
                </button>
              )}

              {PRESET_AMOUNTS.map((val) => {
                const disabled = val > currentCashBalance;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAdd(val)}
                    disabled={disabled}
                    className="px-2.5 py-1.5 rounded-[6px] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#2a2a2a] border border-slate-200 dark:border-[#2e2e2e] text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                  >
                    +₹{val >= 1000 ? `${(val / 1000).toLocaleString('en-IN')}k` : val}
                  </button>
                );
              })}

              {numAmount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setAmount('');
                  }}
                  className="px-2.5 py-1.5 rounded-[6px] text-xs font-mono text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Reconciled Remaining Balance Estimator */}
        {numAmount > 0 && (
          <div
            className={cn(
              'p-3.5 rounded-[10px] border flex items-center justify-between text-xs font-mono transition-colors shadow-xs',
              isOverBalance
                ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400'
                : 'bg-slate-50/90 dark:bg-[#181818] border-slate-200 dark:border-[#282828] text-slate-800 dark:text-zinc-200'
            )}
          >
            <div className="space-y-0.5">
              <span className="text-[11px] font-sans text-slate-500 dark:text-zinc-400 block font-medium">
                Cash Left in Box After Moving
              </span>
              <span className="text-xs font-sans text-slate-600 dark:text-zinc-400">
                {isOverBalance ? 'Warning: Amount is more than cash in box' : 'Cash balance remaining in box'}
              </span>
            </div>

            <div className="text-right">
              <span
                className={cn(
                  'text-base font-bold tabular-nums',
                  isOverBalance
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-700 dark:text-[#3ecf8e]'
                )}
              >
                {formatINR(Math.max(0, remainingBalance))}
              </span>
            </div>
          </div>
        )}

        {/* 4. Reason & Justification Presets */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-800 dark:text-slate-200">
            Transfer Justification / Safe Box Ref *
          </label>

          {/* Quick Reason Chips */}
          <div className="flex flex-wrap gap-1.5">
            {REASON_PRESETS.map((p) => {
              const isSelected = reason === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setReason(p);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-[5px] text-xs font-sans transition-colors cursor-pointer font-medium border',
                    isSelected
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white font-semibold'
                      : 'bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-[#2e2e2e] hover:bg-slate-200 dark:hover:bg-[#282828]'
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Evening till skim / Excess cash transfer to Safe Vault #1"
            className="w-full bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] rounded-[6px] px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] min-h-[40px] shadow-xs"
          />
        </div>

        {/* 5. Transfer Verification Sign-off Badges */}
        <div className="p-3 rounded-[10px] bg-slate-50/60 dark:bg-[#171717] border border-slate-200 dark:border-[#262626] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#3ecf8e]/15 text-emerald-700 dark:text-[#3ecf8e] flex items-center justify-center font-mono font-bold text-[10px]">
              {user?.first_name?.[0] || 'C'}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 block font-mono">
                Transferred By
              </span>
              <span className="font-medium text-slate-800 dark:text-zinc-200">
                {user?.first_name} {user?.last_name || ''} ({user?.role_code?.replace('_', ' ') || 'Cashier'})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Showroom Vault #1</span>
          </div>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-3 rounded-[8px] badge-status-rose font-medium text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </SlideOverDrawer>
  );
};
