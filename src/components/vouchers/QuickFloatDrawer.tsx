import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { erpService } from '@/lib/erpService';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { formatINR, numberToWordsINR, cn, triggerHaptic, normalizeBranchCode } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import {
  Coins,
  Wallet,
  Building2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  X,
  Check,
} from 'lucide-react';

interface QuickFloatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  currentCashBalance: number;
  currentUpiBalance: number;
  onSuccess: () => void;
}

const SOURCE_OPTIONS = [
  'Main Showroom Safe',
  'Shop Owner / Partner',
  'Bank Cash Withdrawal',
  'Transfer from Another Branch',
];

export const QuickFloatDrawer: React.FC<QuickFloatDrawerProps> = ({
  isOpen,
  onClose,
  branchId,
  currentCashBalance,
  currentUpiBalance,
  onSuccess,
  }) => {
  const { user, can } = useAuthStore();
  const { branches, getActiveBranch } = useBranchStore();

  const isFloatAllowed = can('can_inject_float') && user?.role_code !== 'Cashier';

  const [walletType, setWalletType] = useState<'Cash' | 'UPI'>('Cash');
  const [amount, setAmount] = useState<number | ''>('');
  const [source, setSource] = useState<string>('Main Showroom Safe');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  const targetCode = normalizeBranchCode(branchId);
  const activeBranch = branches.find((b) => b.branch_id === branchId || normalizeBranchCode(b.branch_id) === targetCode || normalizeBranchCode(b.branch_code) === targetCode) || getActiveBranch();
  const currentTargetBalance = walletType === 'Cash' ? currentCashBalance : currentUpiBalance;
  const numAmount = Number(amount) || 0;
  const newProjectedBalance = currentTargetBalance + numAmount;

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError(null);
      setWalletType('Cash');
      setSource('Main Showroom Safe');
      setNotes('');
      setIsPreviewOpen(false);
    }
  }, [isOpen]);

  const handleOpenPreview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!isFloatAllowed) {
      const msg = 'Store Manager authorization required. Cashiers cannot add cash to the till.';
      setError(msg);
      showToast({ type: 'error', title: 'Action Not Authorized', message: msg });
      triggerHaptic('error');
      return;
    }

    if (numAmount <= 0) {
      const msg = 'Please enter an amount greater than ₹0.';
      setError(msg);
      showToast({ type: 'error', title: 'Invalid Amount', message: msg });
      return;
    }

    setIsPreviewOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (numAmount <= 0 || !isFloatAllowed) return;

    setSubmitting(true);
    setIsPreviewOpen(false);
    setError(null);

    try {
      const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
      const verifiedBy = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();

      const fullNotes = `[Source: ${source}] ${notes.trim() || 'Added cash to box'}`;

      await erpService.createFloatTopup({
        branchId: activeBranch.branch_id,
        branchCode: activeBranch.branch_code,
        walletType: walletType,
        amount: numAmount,
        referenceNotes: fullNotes,
        authorizedByName: verifiedBy,
        receivedByName: userName,
      });

      triggerHaptic('heavy');
      showToast({
        type: 'success',
        title: 'Money Added Successfully',
        message: `${formatINR(numAmount)} added to ${walletType === 'Cash' ? 'Cash Box' : 'Bank UPI'}.`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error adding money:', err);
      setError(err.message || 'Failed to add money.');
    } finally {
      setSubmitting(false);
    }
  };

  const drawerFooter = (
    <>
      <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
        <span className="text-slate-500 dark:text-zinc-400">Amount to Add:</span>
        <span className="text-sm font-mono font-bold text-slate-900 dark:text-white tabular-nums">
          {numAmount > 0 ? formatINR(numAmount) : '₹0'}
        </span>
        {numAmount > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono hidden md:inline truncate max-w-[160px]">
            ({numberToWordsINR(numAmount)})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="h-10 min-h-[40px] px-4 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#282828] text-xs font-medium font-sans cursor-pointer transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleOpenPreview()}
          disabled={submitting || numAmount <= 0 || !isFloatAllowed}
          className="inline-flex items-center gap-1.5 h-10 min-h-[40px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
        >
          <Coins className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
          <span>
            {submitting
              ? 'Adding...'
              : !isFloatAllowed
              ? 'Manager Access Required'
              : `Review & Add ${numAmount > 0 ? formatINR(numAmount) : ''}`}
          </span>
        </button>
      </div>
    </>
  );

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Add Cash into Cash Box"
      subtitle={`${activeBranch.branch_name} (${activeBranch.branch_code}) • Add Money to Cash Box or Bank`}
      badge={
        <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium badge-status-emerald">
          Add Cash
        </span>
      }
      footer={drawerFooter}
    >
      <form onSubmit={handleOpenPreview} className="max-w-3xl mx-auto w-full space-y-5 font-sans">
        {!isFloatAllowed && (
          <div className="p-3.5 rounded-[8px] bg-rose-500/10 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-rose-800 dark:text-rose-300">
                Store Manager Authorization Required
              </p>
              <p className="text-rose-700 dark:text-rose-400/90 mt-0.5 leading-relaxed">
                Cashiers cannot add money or inject cash floats into the drawer till. This action must be performed by a Store Manager or Super Admin.
              </p>
            </div>
          </div>
        )}
        {/* 1. Wallet Type Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-800 dark:text-slate-200">
            Where to Add Money? *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setWalletType('Cash');
              }}
              className={cn(
                'p-2.5 rounded-[6px] border text-left flex items-center gap-3 transition-all cursor-pointer shadow-2xs h-12',
                walletType === 'Cash'
                  ? 'border-emerald-500 dark:border-[#3ecf8e] bg-emerald-50/60 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30'
                  : 'border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] hover:border-slate-300 dark:hover:border-[#383838]'
              )}
            >
              <div className="w-8 h-8 rounded-[6px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-slate-900 dark:text-white block truncate">
                  Cash in Box
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 block tabular-nums">
                  Live: {formatINR(currentCashBalance)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setWalletType('UPI');
              }}
              className={cn(
                'p-2.5 rounded-[6px] border text-left flex items-center gap-3 transition-all cursor-pointer shadow-2xs h-12',
                walletType === 'UPI'
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50/60 dark:bg-blue-950/20 ring-1 ring-blue-500/30'
                  : 'border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] hover:border-slate-300 dark:hover:border-[#383838]'
              )}
            >
              <div className="w-8 h-8 rounded-[6px] bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-slate-900 dark:text-white block truncate">
                  Bank / UPI Float
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 block tabular-nums">
                  Live: {formatINR(currentUpiBalance)}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Amount Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
              Amount to Add (₹) *
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
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-medium text-slate-400 text-sm">
              ₹
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={amount}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                setAmount(val);
                setError(null);
              }}
              placeholder="0.00"
              className="w-full bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 rounded-[6px] pl-8 pr-4 py-2 text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-white focus:outline-none h-10 min-h-[40px] shadow-2xs transition-colors"
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
        </div>

        {/* 3. Before -> After Projected Balance Card */}
        {numAmount > 0 && (
          <div className="p-3.5 rounded-[8px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#282828] space-y-2 shadow-2xs">
            <span className="text-[11px] font-sans text-slate-500 dark:text-zinc-400 block font-medium">
              New {walletType === 'Cash' ? 'Cash Box' : 'Bank UPI'} Balance:
            </span>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="text-slate-500 dark:text-zinc-400">
                <span>Current: </span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                  {formatINR(currentTargetBalance)}
                </span>
              </div>
              <div className="text-slate-400">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <div className="text-emerald-700 dark:text-[#3ecf8e]">
                <span>After Adding: </span>
                <span className="font-bold text-sm tabular-nums">{formatINR(newProjectedBalance)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Fund Source Chips */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-800 dark:text-slate-200">
            Where Did This Cash Come From? *
          </label>
          <div className="flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((opt) => {
              const isSelected = source === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setSource(opt);
                  }}
                  className={cn(
                    'h-10 min-h-[40px] px-3.5 rounded-[6px] text-xs font-sans transition-colors cursor-pointer font-medium border flex items-center justify-center shadow-2xs',
                    isSelected
                      ? 'bg-[#3ecf8e] text-[#171717] border-[#3ecf8e] font-semibold'
                      : 'bg-white dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-[#282828] hover:bg-slate-50 dark:hover:bg-[#202020]'
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Reference Notes */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-800 dark:text-slate-200">
            Reason / Note
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Added morning cash float for busy counter"
            className="w-full bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] rounded-[6px] px-3.5 py-2 text-xs font-sans text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 h-10 min-h-[40px] shadow-2xs"
          />
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-3 rounded-[8px] badge-status-rose font-medium text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {/* Pre-Commit Confirmation Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl p-5 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#242424]">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Confirm Float Top-up
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Verification Slip */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Branch</span>
                <span className="font-semibold text-slate-900 dark:text-white">{activeBranch.branch_name} ({activeBranch.branch_code})</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Where to Add</span>
                <span className="font-semibold text-slate-900 dark:text-white">{walletType === 'Cash' ? 'Cash Box' : 'Bank UPI'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Source</span>
                <span className="font-semibold text-slate-900 dark:text-white">{source}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Reason</span>
                <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{notes || 'Float added to drawer'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Balance After Float</span>
                <span className="font-semibold text-emerald-600 dark:text-[#3ecf8e]">{formatINR(newProjectedBalance)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-[#242424] flex justify-between items-baseline">
                <span className="text-xs uppercase font-sans text-slate-500">Amount to Add</span>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-600 dark:text-[#3ecf8e]">
                    {formatINR(numAmount)}
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-[#3ecf8e] font-sans">
                    {numberToWordsINR(numAmount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-3.5 py-2 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-zinc-300 text-xs font-medium cursor-pointer"
              >
                Back & Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className="px-4 py-2 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-medium cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{submitting ? 'Adding...' : 'Confirm & Add'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </SlideOverDrawer>
  );
};
