import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { erpService } from '@/lib/erpService';
import { formatINR, cn, triggerHaptic, numberToWordsINR } from '@/lib/utils';
import { BillUploader } from '@/components/vouchers/BillUploader';
import { TouchSignatureCanvas } from '@/components/advances/TouchSignatureCanvas';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import {
  X,
  ArrowDownLeft,
  Check,
  AlertCircle,
  Receipt,
  Banknote,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Building2,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { showToast } from '@/components/ui/ToastContainer';

interface SettleAdvanceDrawerProps {
  onSuccess: () => void;
}

const BILL_PRESETS = [500, 1000, 2000, 5000];
const CASH_PRESETS = [500, 1000, 2000, 5000];

export const SettleAdvanceDrawer: React.FC<SettleAdvanceDrawerProps> = ({ onSuccess }) => {
  const { settleTargetAdvance, setSettleTargetAdvance } = useUIStore();
  const { user } = useAuthStore();

  const [billsAmount, setBillsAmount] = useState<number | ''>('');
  const [cashReturnAmount, setCashReturnAmount] = useState<number | ''>('');
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset state on open
  useEffect(() => {
    if (settleTargetAdvance) {
      setBillsAmount('');
      setCashReturnAmount('');
      setProofPhotos([]);
      setSignatureDataUrl('');
      setError('');
    }
  }, [settleTargetAdvance]);

  if (!settleTargetAdvance) return null;

  const adv = settleTargetAdvance;
  const remainingToSettle = Number(adv.unsettled_balance) || 0;
  const bAmount = Number(billsAmount) || 0;
  const cAmount = Number(cashReturnAmount) || 0;
  const totalSettle = bAmount + cAmount;
  const isOverSettled = totalSettle > remainingToSettle;
  const newBalance = Math.max(0, remainingToSettle - totalSettle);
  const isFullySettled = totalSettle === remainingToSettle && remainingToSettle > 0;

  const handleClose = () => {
    triggerHaptic('light');
    setSettleTargetAdvance(null);
  };

  const handleQuickSettleAllBills = () => {
    triggerHaptic('selection');
    setBillsAmount(remainingToSettle);
    setCashReturnAmount('');
    setError('');
  };

  const handleQuickSettleAllCash = () => {
    triggerHaptic('selection');
    setCashReturnAmount(remainingToSettle);
    setBillsAmount('');
    setError('');
  };

  const handleQuickSplitEqual = () => {
    triggerHaptic('selection');
    const half = Math.floor(remainingToSettle / 2);
    setBillsAmount(half);
    setCashReturnAmount(remainingToSettle - half);
    setError('');
  };

  const handleAddBillPreset = (val: number) => {
    triggerHaptic('selection');
    const curr = Number(billsAmount) || 0;
    setBillsAmount(Math.min(remainingToSettle, curr + val));
  };

  const handleAddCashPreset = (val: number) => {
    triggerHaptic('selection');
    const curr = Number(cashReturnAmount) || 0;
    setCashReturnAmount(Math.min(remainingToSettle, curr + val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (totalSettle <= 0) {
      const msg = 'Please enter either a Bills Amount or Cash Return Amount.';
      setError(msg);
      showToast({
        type: 'error',
        title: 'Settlement Amount Required',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    if (isOverSettled) {
      const msg = `Total settlement (${formatINR(totalSettle)}) cannot exceed the remaining unsettled balance of ${formatINR(remainingToSettle)}.`;
      setError(msg);
      showToast({
        type: 'error',
        title: 'Over-Settlement Error',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    const allProofs = [...proofPhotos];
    if (signatureDataUrl) {
      allProofs.push(signatureDataUrl);
    }

    setSubmitting(true);
    triggerHaptic('medium');
    try {
      const userName = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();
      const userRole = user?.role_code || 'Store_Manager';

      await erpService.settleStaffAdvance({
        advanceId: adv.id,
        receiptNumber: adv.receipt_number,
        staffCode: adv.staff_code,
        branchId: adv.branch_id,
        branchCode: adv.branch_code,
        billsSubmittedAmount: bAmount,
        cashReturnedAmount: cAmount,
        settlementProofs: allProofs,
        userName,
        userRole,
      });

      triggerHaptic('success');
      showToast({
        type: 'success',
        title: 'Settlement Saved',
        message: `₹${totalSettle} settlement recorded for ${adv.staff_name}.`,
      });

      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error settling staff advance:', err);
      setError(err.message || 'Failed to record settlement.');
      triggerHaptic('error');
      showToast({
        type: 'error',
        title: 'Settlement Failed',
        message: err.message || 'Failed to record settlement.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const staffInitials = adv.staff_name
    ? adv.staff_name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'ST';

  const drawerBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] badge-status-amber text-[11px] font-sans font-medium select-none">
      SETTLE
    </span>
  );

  const drawerFooter = (
    <>
      <div className="min-w-0">
        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400">
          Total Settlement
        </div>
        <div className="font-mono font-medium text-base sm:text-lg text-slate-900 dark:text-white tabular-nums truncate">
          {formatINR(totalSettle)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="px-3.5 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#282828] text-xs font-medium font-sans cursor-pointer transition-colors min-h-[34px]"
        >
          Cancel (ESC)
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || isOverSettled || totalSettle <= 0}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-xs font-medium font-sans transition-colors cursor-pointer shadow-xs min-h-[34px] disabled:opacity-50 disabled:cursor-not-allowed',
            isOverSettled || totalSettle <= 0
              ? 'bg-slate-200 dark:bg-[#2a2a2a] text-slate-400 dark:text-zinc-500 shadow-none'
              : 'bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717]'
          )}
        >
          <Check className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
          <span>{submitting ? 'Clearing Advance...' : 'Confirm & Clear Advance'}</span>
        </button>
      </div>
    </>
  );

  return (
    <SlideOverDrawer
      isOpen={Boolean(settleTargetAdvance)}
      onClose={handleClose}
      title={`Settle Staff Advance #${adv.receipt_number}`}
      subtitle={`Staff: ${adv.staff_name} (${adv.staff_code}) • Advance Given: ${formatINR(adv.advance_amount)}`}
      badge={drawerBadge}
      copyId={adv.receipt_number}
      size="lg"
      footer={drawerFooter}
    >
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto w-full space-y-4">
        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-[8px] badge-status-rose flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium font-sans">{error}</span>
          </div>
        )}

        {/* Staff & Advance Summary Card */}
        <div className="p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar size="md" shape="circle">
                <AvatarFallback>{staffInitials}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-900 dark:text-white">
                    {adv.staff_name}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono bg-slate-100 dark:bg-[#141414] text-slate-600 dark:text-zinc-400 font-medium border border-slate-200 dark:border-[#2e2e2e]">
                    {adv.staff_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-sans mt-0.5">
                  {adv.department_name || 'Showroom'} · {adv.designation || 'Staff'} ({adv.branch_code})
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Original Advance</span>
              <span className="font-mono text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                {formatINR(adv.advance_amount)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-[#262626]">
            <div className="p-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626]">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Already Settled</span>
              <span className="text-xs font-mono font-medium text-emerald-600 dark:text-[#3ecf8e] tabular-nums">
                {formatINR(Number(adv.advance_amount) - Number(adv.unsettled_balance))}
              </span>
            </div>
            <div className="p-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626]">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Outstanding Due</span>
              <span className="text-xs font-mono font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                {formatINR(remainingToSettle)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick 1-Tap Preset Strip */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            Quick 1-Tap Settlement Presets:
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleQuickSettleAllBills}
              className="py-1.5 px-2 rounded-[6px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 text-xs font-medium font-sans transition-colors cursor-pointer text-center truncate"
            >
              100% Bills ({formatINR(remainingToSettle)})
            </button>
            <button
              type="button"
              onClick={handleQuickSettleAllCash}
              className="py-1.5 px-2 rounded-[6px] bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/20 text-xs font-medium font-sans transition-colors cursor-pointer text-center truncate"
            >
              100% Cash Return
            </button>
            <button
              type="button"
              onClick={handleQuickSplitEqual}
              className="py-1.5 px-2 rounded-[6px] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#2e2e2e] text-xs font-medium font-sans transition-colors cursor-pointer text-center truncate"
            >
              50 / 50 Split
            </button>
          </div>
        </div>

        {/* Settlement Inputs: Bills vs Cash */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                <span>A. Expense Bills Submitted (₹)</span>
              </label>
              {billsAmount !== '' && (
                <button
                  type="button"
                  onClick={() => setBillsAmount('')}
                  className="text-[11px] font-mono text-rose-500 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] shadow-xs">
              <span className="pl-3.5 text-base font-mono text-slate-400">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={billsAmount}
                onChange={(e) => setBillsAmount(parseFloat(e.target.value) || '')}
                placeholder="0.00"
                className="w-full bg-transparent pl-2 pr-3 py-2 text-base font-mono font-medium tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none min-h-[42px]"
              />
            </div>

            {/* Preset Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {BILL_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleAddBillPreset(amt)}
                  className="px-2.5 py-1 rounded-[6px] bg-white dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-700 dark:text-zinc-300 text-xs font-mono font-medium border border-slate-200 dark:border-[#2e2e2e] active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  +₹{amt.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#262626]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>B. Cash Returned to Counter Drawer (₹)</span>
              </label>
              {cashReturnAmount !== '' && (
                <button
                  type="button"
                  onClick={() => setCashReturnAmount('')}
                  className="text-[11px] font-mono text-rose-500 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] shadow-xs">
              <span className="pl-3.5 text-base font-mono text-slate-400">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={cashReturnAmount}
                onChange={(e) => setCashReturnAmount(parseFloat(e.target.value) || '')}
                placeholder="0.00"
                className="w-full bg-transparent pl-2 pr-3 py-2 text-base font-mono font-medium tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none min-h-[42px]"
              />
            </div>

            {/* Preset Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {CASH_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleAddCashPreset(amt)}
                  className="px-2.5 py-1 rounded-[6px] bg-white dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-700 dark:text-zinc-300 text-xs font-mono font-medium border border-slate-200 dark:border-[#2e2e2e] active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  +₹{amt.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Realtime Reconciliation Card */}
        <div
          className={cn(
            'p-4 rounded-[8px] border transition-all',
            isOverSettled
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
              : isFullySettled
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-[#3ecf8e]'
              : 'bg-slate-50 dark:bg-[#161616] border-slate-200 dark:border-[#262626] text-slate-800 dark:text-zinc-200'
          )}
        >
          <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
            <span className="text-xs font-medium font-sans">Total Settlement Recorded:</span>
            <span className="text-base font-mono font-medium tabular-nums">
              {formatINR(totalSettle)}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-medium font-sans flex items-center gap-1.5">
              {isFullySettled ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
                  <span>Remaining Balance: Fully Cleared!</span>
                </>
              ) : (
                <span>Remaining Balance:</span>
              )}
            </span>
            <span
              className={cn(
                'text-base font-mono font-medium tabular-nums',
                isFullySettled ? 'text-emerald-600 dark:text-[#3ecf8e]' : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {formatINR(newBalance)}
            </span>
          </div>

          {isOverSettled && (
            <div className="mt-2.5 pt-2 border-t border-rose-500/20 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Settlement exceeds outstanding balance by {formatINR(totalSettle - remainingToSettle)}.
              </span>
            </div>
          )}
        </div>

        {/* Touch Digital Signature */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[#262626]">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              Staff Settlement Sign-off <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] font-mono text-slate-400">Step 3 of 4</span>
          </div>
          <TouchSignatureCanvas
            onSave={setSignatureDataUrl}
            staffName={adv.staff_name}
          />
        </div>

        {/* Bill / Slip Uploads */}
        <div className="space-y-2 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[#262626]">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              Bill / Voucher Receipts (Camera or Upload)
            </label>
            <span className="text-[11px] font-mono text-slate-400">Step 4 of 4</span>
          </div>
          <BillUploader photoUrls={proofPhotos} onChange={setProofPhotos} maxPhotos={3} />
        </div>
      </form>
    </SlideOverDrawer>
  );
};

export default SettleAdvanceDrawer;
