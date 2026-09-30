import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { CurrencyDenomination } from '@/types/database';
import { formatINR, numberToWordsINR, printThermalClosingSlip, cn, triggerHaptic } from '@/lib/utils';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Coins,
  CheckCircle2,
  Lock,
  Unlock,
  RotateCcw,
  Printer,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  Wallet,
  Receipt,
  Plus,
  Minus,
  Check,
  X,
} from 'lucide-react';
import { useGsapContext } from '@/hooks/useGsap';
import { animateStaggerCards, animateErrorBanner } from '@/lib/animations';
import { MetricCard } from '@/components/ui/MetricCard';
import { showToast } from '@/components/ui/ToastContainer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { useOverrideStore } from '@/store/overrideStore';

export const DailyCashClosingPage: React.FC = () => {
  const { user, can, availableCashiers } = useAuthStore();
  const { branches, selectedBranchId, getActiveBranch } = useBranchStore();
  const { vouchers, staff } = useVouchers();
  const { isCashierClosingReopenAllowed } = useOverrideStore();

  const activeBranch = getActiveBranch();
  const allowCashierReopen = isCashierClosingReopenAllowed();
  const isSupervisor =
    user?.role_code === 'Super_Admin' ||
    user?.role_code === 'Developer' ||
    user?.role_code === 'Store_Manager' ||
    can('can_verify_f9_closing') ||
    allowCashierReopen;

  const [selectedBranch, setSelectedBranch] = useState(selectedBranchId || activeBranch.branch_id);
  const [closingDate, setClosingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const [currentWalletCash, setCurrentWalletCash] = useState(0);
  const [cashInflowToday, setCashInflowToday] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [varianceDisposition, setVarianceDisposition] = useState<'Cashier_Charge' | 'Expense_Writeoff' | 'Excess_Income'>('Cashier_Charge');
  const [chargeStaffName, setChargeStaffName] = useState(user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : '');
  const [chargeStaffCode, setChargeStaffCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const containerRef = useGsapContext(() => {
    animateStaggerCards(containerRef.current, '.stagger-card', 0.03);
  }, [selectedBranchId, closingDate]);

  const loadBranchData = async () => {
    try {
      const branchToQuery = selectedBranchId && selectedBranchId !== 'ALL' ? selectedBranchId : activeBranch.branch_id;
      const [w, l, existingClosing] = await Promise.all([
        erpService.getBranchWallet(branchToQuery),
        erpService.getWalletLedger(branchToQuery),
        erpService.getCashClosing(branchToQuery, closingDate),
      ]);
      setCurrentWalletCash(w.cash_balance || 0);

      if (existingClosing) {
        setLocked(true);
        if (existingClosing.denominations_breakdown) {
          const loadedCounts: Record<number, number> = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 };
          Object.entries(existingClosing.denominations_breakdown).forEach(([k, v]) => {
            loadedCounts[Number(k)] = Number(v) || 0;
          });
          setCounts(loadedCounts);
        } else if (existingClosing.denominations_detail) {
          try {
            const parsed = JSON.parse(existingClosing.denominations_detail);
            setCounts(parsed);
          } catch {
            // ignore
          }
        }
        if (existingClosing.closing_notes) {
          setClosingNotes(existingClosing.closing_notes);
        }
        if (existingClosing.variance_disposition) {
          setVarianceDisposition(existingClosing.variance_disposition as any);
        }
        if (existingClosing.charge_staff_name) {
          setChargeStaffName(existingClosing.charge_staff_name);
        }
        if (existingClosing.charge_staff_code) {
          setChargeStaffCode(existingClosing.charge_staff_code);
        }
      } else {
        setLocked(false);
      }

      // Compute cash inflows today (Float top-ups and cash advance returns)
      const inflows = (l || [])
        .filter((entry) => {
          const entryDate = (entry.created_at || '').slice(0, 10);
          return (
            entryDate === closingDate &&
            entry.wallet_type === 'Cash' &&
            entry.credit_amount > 0 &&
            (entry.transaction_type === 'Float_Topup' || entry.transaction_type === 'Advance_Return_In')
          );
        })
        .reduce((sum, entry) => sum + Number(entry.credit_amount || 0), 0);

      setCashInflowToday(inflows);
    } catch (err) {
      console.warn('Error loading opening cash or ledger:', err);
    }
  };

  useEffect(() => {
    setSelectedBranch(selectedBranchId || activeBranch.branch_id);
    loadBranchData();
    const handleUpdates = () => {
      loadBranchData();
    };
    window.addEventListener('asopalav:wallet-updated', handleUpdates);
    window.addEventListener('asopalav:ledger-updated', handleUpdates);
    window.addEventListener('asopalav:vouchers-updated', handleUpdates);
    return () => {
      window.removeEventListener('asopalav:wallet-updated', handleUpdates);
      window.removeEventListener('asopalav:ledger-updated', handleUpdates);
      window.removeEventListener('asopalav:vouchers-updated', handleUpdates);
    };
  }, [selectedBranchId, activeBranch.branch_id, closingDate]);

  useEffect(() => {
    async function loadDenoms() {
      const data = await erpService.getCurrencyDenominations();
      setDenominations(data);
    }
    loadDenoms();
  }, []);

  // Calculate physical total
  const physicalTotal = useMemo(() => {
    return Object.entries(counts).reduce((acc, [denom, cnt]) => {
      return acc + Number(denom) * (cnt || 0);
    }, 0);
  }, [counts]);

  // Daily Vouchers for Selected Date (Only count Approved vouchers; ignore Voided / Pending)
  const dayVouchers = useMemo(() => {
    return vouchers.filter(
      (v) =>
        (v.payment_date || '').startsWith(closingDate) &&
        (selectedBranchId === 'ALL' || v.branch_id === selectedBranchId) &&
        v.status === 'Approved'
    );
  }, [vouchers, closingDate, selectedBranchId]);

  const cashDisbursedToday = useMemo(() => {
    return dayVouchers
      .filter((v) => v.payment_method === 'Physical_Cash')
      .reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
  }, [dayVouchers]);

  const upiDisbursedToday = useMemo(() => {
    return dayVouchers
      .filter((v) => v.payment_method === 'Online_UPI')
      .reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
  }, [dayVouchers]);

  // Computed Morning Opening Cash = Current Live Wallet + Disbursed - Inflows
  const openingCash = useMemo(() => {
    return Math.max(0, currentWalletCash + cashDisbursedToday - cashInflowToday);
  }, [currentWalletCash, cashDisbursedToday, cashInflowToday]);

  // Expected Book Cash in Drawer = Current live cash in counter till
  const expectedBookCash = useMemo(() => {
    return currentWalletCash;
  }, [currentWalletCash]);

  const varianceAmount = physicalTotal - expectedBookCash;

  const handleStepCount = (denom: number, delta: number) => {
    if (locked) return;
    triggerHaptic(Math.abs(delta) > 1 ? 'medium' : 'selection');
    setCounts((prev) => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + delta),
    }));
  };

  const handleCountChange = (denom: number, val: string) => {
    if (locked) return;
    const num = parseInt(val, 10);
    setCounts((prev) => ({
      ...prev,
      [denom]: isNaN(num) || num < 0 ? 0 : num,
    }));
  };

  const handleReset = () => {
    if (locked) return;
    triggerHaptic('warning');
    setCounts({
      500: 0,
      200: 0,
      100: 0,
      50: 0,
      20: 0,
      10: 0,
      5: 0,
      2: 0,
      1: 0,
    });
    setClosingNotes('');
  };

  const handlePrintSlip = () => {
    printThermalClosingSlip({
      branchCode: activeBranch.branch_code,
      closingDate: closingDate,
      openingCash: openingCash,
      cashInflow: cashInflowToday,
      cashOutflow: cashDisbursedToday,
      expectedCash: expectedBookCash,
      actualCash: physicalTotal,
      variance: varianceAmount,
      denominationsBreakdown: counts,
      cashierName: `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim(),
      verifiedByName: `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim(),
      notes: closingNotes || undefined,
    });
    showToast({
      type: 'activity',
      title: 'Printing Closing Slip',
      message: `Thermal 80mm cash closing slip for ${closingDate} sent to printer.`,
    });
  };

  const handleSaveClosing = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setFeedback(null);
    setIsPreviewOpen(true);
  };

  const handleConfirmFinalSave = async () => {
    if (locked) return;
    setSubmitting(true);
    try {
      const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
      const denomBreakdown: Record<string, number> = {};
      Object.entries(counts).forEach(([k, v]) => {
        denomBreakdown[k] = v;
      });

      await erpService.saveCashClosing({
        branchId: selectedBranch,
        branchCode: activeBranch.branch_code,
        closingDate: closingDate,
        openingCash: openingCash,
        cashInflow: cashInflowToday,
        cashOutflow: cashDisbursedToday,
        expectedCash: expectedBookCash,
        actualCash: physicalTotal,
        variance: varianceAmount,
        varianceDisposition: varianceAmount !== 0 ? varianceDisposition : undefined,
        chargeStaffCode: chargeStaffCode || undefined,
        chargeStaffName: chargeStaffName || undefined,
        denominationsDetail: JSON.stringify(counts),
        denominationsBreakdown: denomBreakdown,
        closingNotes: closingNotes.trim() || undefined,
        cashierName: userName,
        verifiedByName: userName,
      });

      const successMsg = `Daily Closing for ${closingDate} successfully locked and verified.`;
      setFeedback({
        type: 'success',
        message: successMsg,
      });
      showToast({
        type: 'success',
        title: 'Daily Closing Locked',
        message: successMsg,
      });
      setLocked(true);
      setIsPreviewOpen(false);
    } catch (err: any) {
      console.error('Error recording closing:', err);
      const errMsg = err.message || 'Failed to record closing.';
      setFeedback({ type: 'error', message: errMsg });
      showToast({
        type: 'error',
        title: 'Closing Failed',
        message: errMsg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenClosing = async () => {
    if (!isSupervisor) return;
    setReopening(true);
    setFeedback(null);
    try {
      const userName = `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim();
      await erpService.reopenCashClosing(
        closingDate,
        selectedBranch,
        activeBranch.branch_code,
        userName,
        user?.role_code || 'Super_Admin',
        'Supervisor audit recount'
      );
      setLocked(false);
      const reopenMsg = `Daily Closing for ${closingDate} has been reopened for adjustment.`;
      setFeedback({
        type: 'success',
        message: reopenMsg,
      });
      showToast({
        type: 'info',
        title: 'Closing Reopened',
        message: reopenMsg,
      });
      triggerHaptic('selection');
    } catch (err: any) {
      console.error('Failed to reopen closing:', err);
      const errMsg = err.message || 'Failed to reopen closing.';
      setFeedback({ type: 'error', message: errMsg });
      showToast({
        type: 'error',
        title: 'Reopen Failed',
        message: errMsg,
      });
      triggerHaptic('error');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Daily Cash Closing Header */}
      <div className="px-4 lg:px-6 py-4 border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title, Status Badges & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#3ecf8e]" />
                <span>Daily Cash Closing</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8e8e93] font-sans mt-0.5">
              Count night cash notes, match today's money with records, and close today's accounts.
            </p>
          </div>

          {/* Right Layer: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintSlip}
              className="h-9 px-3.5 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-xs font-semibold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ios-press"
              title="Print cash closing receipt slip"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>

            {!locked && (
              <button
                type="button"
                onClick={handleReset}
                className="h-9 px-3.5 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-xs font-semibold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ios-press"
                title="Reset note counters to zero"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Counts</span>
              </button>
            )}

            {locked && isSupervisor && (
              <button
                type="button"
                onClick={handleReopenClosing}
                disabled={reopening}
                className="h-9 px-3.5 py-1.5 rounded-[6px] border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-semibold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ios-press"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>{reopening ? 'Reopening...' : 'Reopen Closing'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Studio Content */}
      <main className="px-4 lg:px-6 py-4 space-y-4">
        {/* 2. Top Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="stagger-card rounded-[12px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#141414] p-4 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#8e8e93] font-semibold">Expected Cash in Box</div>
            <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-white">{formatINR(openingCash)}</div>
            <div className="text-xs font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium">
              Shop Record Balance
            </div>
          </div>

          <div className="stagger-card rounded-[12px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#141414] p-4 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#8e8e93] font-semibold">Cash Spent Today</div>
            <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-white">{formatINR(cashDisbursedToday)}</div>
            <div className="text-xs font-mono text-amber-600 dark:text-[#f59e0b] font-medium">
              {dayVouchers.filter((v) => v.payment_method === 'Physical_Cash').length} Cash Expenses
            </div>
          </div>

          <div className="stagger-card rounded-[12px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#141414] p-4 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#8e8e93] font-semibold">Actual Counted Cash</div>
            <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-white">{formatINR(physicalTotal)}</div>
            <div className="text-xs font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium">
              Counted Notes &amp; Coins
            </div>
          </div>

          <div className="stagger-card rounded-[12px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#141414] p-4 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#8e8e93] font-semibold">Cash Difference</div>
            <div className={cn("text-2xl font-mono tabular-nums font-bold", varianceAmount === 0 ? "text-emerald-600 dark:text-[#3ecf8e]" : varianceAmount > 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400")}>
              {varianceAmount === 0 ? 'Matched ₹0' : formatINR(varianceAmount)}
            </div>
            <div className="text-xs font-mono text-slate-500 dark:text-[#8e8e93] font-medium">
              {varianceAmount === 0 ? 'Perfect match' : varianceAmount > 0 ? 'Excess in cash box' : 'Shortage in cash box'}
            </div>
          </div>
        </div>

        {/* 3. Main Form Content */}
        <form onSubmit={handleSaveClosing} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Denomination Table (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="stagger-card rounded-[16px] bg-white dark:bg-[#18181a] border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-xs ios-card">
              <div className="flex items-center justify-between p-4 border-b border-slate-200/70 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[#3ecf8e]" />
                  <h2 className="text-sm font-semibold font-sans text-slate-900 dark:text-white tracking-tight">
                    1. Count Cash Notes &amp; Coins
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-8 px-3 rounded-[8px] text-xs font-semibold font-sans text-slate-500 dark:text-[#8e8e93] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer inline-flex items-center gap-1.5 ios-press"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Reset Counts</span>
                </button>
              </div>

              {/* 1. Mobile Fast Steppers (< lg) */}
              <div className="lg:hidden p-3 space-y-2.5">
                {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((denom) => {
                  const count = counts[denom] || 0;
                  const subtotal = denom * count;

                  return (
                    <div
                      key={denom}
                      className="p-3.5 rounded-[14px] bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-[8px] text-xs font-mono font-semibold bg-white dark:bg-white/10 text-slate-900 dark:text-[#EDEDED] border border-black/[0.06] dark:border-white/[0.08] shadow-2xs">
                            ₹{denom} {denom >= 10 ? 'Note' : 'Coin'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-[#8e8e93]">
                            {count} pcs
                          </span>
                        </div>

                        <div className="text-right font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                          {formatINR(subtotal)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-0.5 font-mono">
                        <button
                          type="button"
                          onClick={() => handleStepCount(denom, -10)}
                          disabled={locked || count < 10}
                          className="flex-1 min-h-[40px] rounded-[6px] bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-[#EDEDED] text-xs font-mono font-semibold disabled:opacity-30 cursor-pointer active:scale-95 transition-all flex items-center justify-center shadow-2xs ios-press"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStepCount(denom, -1)}
                          disabled={locked || count <= 0}
                          className="flex-1 min-h-[40px] rounded-[6px] bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-[#EDEDED] text-xs font-mono font-semibold disabled:opacity-30 cursor-pointer active:scale-95 transition-all flex items-center justify-center shadow-2xs ios-press"
                        >
                          -1
                        </button>

                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={count || ''}
                          onChange={(e) => handleCountChange(denom, e.target.value)}
                          placeholder="0"
                          className="w-16 min-h-[40px] bg-white dark:bg-black/30 border border-black/[0.08] dark:border-white/10 rounded-[6px] text-center text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e] tabular-nums shadow-inner"
                        />

                        <button
                          type="button"
                          onClick={() => handleStepCount(denom, 1)}
                          disabled={locked}
                          className="flex-1 min-h-[40px] rounded-[6px] bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-[#EDEDED] text-xs font-mono font-semibold cursor-pointer active:scale-95 transition-all flex items-center justify-center shadow-2xs ios-press"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStepCount(denom, 10)}
                          disabled={locked}
                          className="flex-1 min-h-[40px] rounded-[6px] bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-[#EDEDED] text-xs font-mono font-semibold cursor-pointer active:scale-95 transition-all flex items-center justify-center shadow-2xs ios-press"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. Desktop Denomination Table (lg+) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full border-collapse text-left font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50 dark:bg-[#171717] text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#707070] font-mono font-medium">
                      <th className="py-2.5 px-4">Note / Coin Type</th>
                      <th className="py-2.5 px-4 text-center">Number of Notes / Coins</th>
                      <th className="py-2.5 px-4 text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1f1f1f] text-xs">
                    {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((denom, idx) => {
                      const count = counts[denom] || 0;
                      const subtotal = denom * count;

                      return (
                        <tr
                          key={denom}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] transition-colors"
                        >
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#2e2e2e] flex items-center justify-center text-xs font-mono font-medium text-slate-900 dark:text-white">
                                ₹{denom}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-[#707070] font-mono hidden sm:inline">
                                {denom >= 10 ? 'note' : 'coin'}
                              </span>
                            </div>
                          </td>

                          <td className="py-2 px-4">
                            <div className="flex items-center justify-center max-w-[140px] mx-auto font-mono">
                              <input
                                id={`denom-input-${idx}`}
                                type="number"
                                inputMode="numeric"
                                min="0"
                                value={count || ''}
                                onChange={(e) => handleCountChange(denom, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const nextInput = document.getElementById(`denom-input-${idx + 1}`);
                                    if (nextInput) {
                                      nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder="0"
                                className="w-28 h-9 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] rounded-[6px] text-center text-xs font-mono font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 tabular-nums shadow-2xs transition-colors"
                              />
                            </div>
                          </td>

                          <td className="py-2 px-4 text-right">
                            <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                              {formatINR(subtotal)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-[#242424] bg-slate-50 dark:bg-[#171717] font-medium text-xs">
                      <td className="py-3 px-4 font-mono text-slate-900 dark:text-[#EDEDED]">
                        Total Cash Counted
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 dark:text-[#707070] font-mono text-[11px]">
                        {Object.values(counts).reduce((a, b) => a + (b || 0), 0)} Pieces Counted
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-emerald-600 dark:text-[#3ecf8e] font-mono tabular-nums">
                        {formatINR(physicalTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Sign-off & Confirmation (5 cols) */}
          <div className="lg:col-span-5 space-y-4 font-sans text-xs">
            <div className="stagger-card p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#242424]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <h2 className="text-sm font-semibold font-sans text-slate-900 dark:text-white tracking-tight">
                    Closing Notes & Sign-off
                  </h2>
                </div>
                <span className="text-xs font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium">● Verified</span>
              </div>

              <div className="space-y-1">
                <DatePicker
                  label="Closing Date"
                  value={closingDate}
                  onChange={setClosingDate}
                  required
                />
              </div>

              {varianceAmount !== 0 && (
                <div className="space-y-2 p-3 rounded-[8px] bg-amber-500/10 border border-amber-500/25 font-sans text-xs">
                  <label className="block text-amber-700 dark:text-amber-400 font-medium">
                    Reason for Cash Difference *
                  </label>
                  <SearchableSelect
                    disabled={locked}
                    options={[
                      { value: 'Cashier_Charge', label: 'Cashier will pay difference' },
                      { value: 'Expense_Writeoff', label: 'Showroom expense adjustment' },
                      { value: 'Excess_Income', label: 'Extra cash deposited to drawer' },
                    ]}
                    value={varianceDisposition}
                    onChange={(val) => setVarianceDisposition(val as any)}
                    allowCustom={false}
                  />

                  {varianceDisposition === 'Cashier_Charge' && (
                    <div className="space-y-1 pt-1.5 border-t border-amber-500/20">
                      <label className="block text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Assign Charge to Cashier / Staff *
                      </label>
                      <SearchableSelect
                        disabled={locked}
                        options={[
                          ...availableCashiers.map((c) => ({
                            value: c.id,
                            label: `${c.first_name} ${c.last_name || ''}`.trim(),
                            sublabel: `@${c.username}`,
                            badge: 'Cashier',
                          })),
                          ...staff.map((s) => ({
                            value: s.staff_code,
                            label: `${s.first_name} ${s.last_name || ''}`.trim(),
                            sublabel: s.staff_code,
                            badge: s.department_name || 'Staff',
                          })),
                        ]}
                        value={chargeStaffCode}
                        onChange={(selectedCode) => {
                          setChargeStaffCode(selectedCode);
                          const matchedStaff = staff.find((s) => s.staff_code === selectedCode);
                          const matchedCashier = availableCashiers.find(
                            (c) => c.id === selectedCode || c.username === selectedCode
                          );
                          if (matchedStaff) {
                            setChargeStaffName(
                              `${matchedStaff.first_name} ${matchedStaff.last_name || ''}`.trim()
                            );
                          } else if (matchedCashier) {
                            setChargeStaffName(
                              `${matchedCashier.first_name} ${matchedCashier.last_name || ''}`.trim()
                            );
                          } else {
                            setChargeStaffName(selectedCode);
                          }
                        }}
                        placeholder="Search cashier or staff member..."
                        searchPlaceholder="Type name or code to search..."
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-mono text-slate-600 dark:text-[#A1A1A1]">
                  Notes / Remarks
                </label>
                <textarea
                  disabled={locked}
                  rows={3}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. Day-end cash verified with all bills by cashier."
                  className="w-full bg-black/[0.03] dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-[6px] p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e] resize-none font-sans disabled:opacity-60 shadow-xs"
                />
              </div>

              {feedback && (
                <div
                  ref={(el) => {
                    if (el && feedback.type === 'error') {
                      animateErrorBanner(el);
                    }
                  }}
                  className={cn(
                    'p-3.5 rounded-[12px] border font-sans text-xs font-semibold',
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30'
                  )}
                >
                  {feedback.message}
                </div>
              )}

              {/* Action Buttons: Print Slip + Complete CTA */}
              <div className="pt-2 space-y-2">
                {locked ? (
                  <div className="space-y-2">
                    <div className="p-3.5 rounded-[12px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 dark:text-[#EDEDED] text-xs font-medium">
                        <Lock className="w-4 h-4 text-[#3ecf8e]" />
                        <span>Today's Cash Closed &amp; Locked</span>
                      </div>
                      <button
                        type="button"
                        onClick={handlePrintSlip}
                        className="h-8 px-3 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/10 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white text-xs font-semibold font-sans transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ios-press"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Slip</span>
                      </button>
                    </div>

                    {!isSupervisor && (
                      <div className="p-3.5 rounded-[12px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] text-[11px] font-sans text-slate-600 dark:text-zinc-400 space-y-1">
                        <p className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                          <span>Closing Submitted &amp; Finalized</span>
                        </p>
                        <p className="leading-relaxed">
                          Your evening cash closing for this date is recorded and permanently locked. Cashiers cannot edit, change note counts, or reopen closed accounts. If an adjustment is needed, contact your Store Manager or Super Admin.
                        </p>
                      </div>
                    )}

                    {isSupervisor && (
                      <button
                        type="button"
                        onClick={handleReopenClosing}
                        disabled={reopening}
                        className="h-10 w-full flex items-center justify-center gap-2 px-4 rounded-[6px] border border-black/[0.08] dark:border-white/10 bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white font-sans text-xs font-semibold cursor-pointer transition-all ios-press"
                      >
                        <Unlock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                        <span>{reopening ? 'Unlocking...' : 'Reopen / Unlock Closing (Supervisor)'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintSlip}
                      className="h-11 px-4 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-xs font-semibold font-sans transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs shrink-0 ios-press"
                      title="Print Closing Slip preview"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Slip</span>
                    </button>

                    {/* Single Primary Emerald CTA */}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 flex-1 flex items-center justify-center gap-2 px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-semibold text-xs font-sans cursor-pointer transition-all select-none shadow-md ios-press"
                    >
                      <Check className="w-4 h-4 text-[#171717] stroke-[3]" />
                      <span>{submitting ? 'Saving Closing...' : 'Complete & Close Day'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Sticky Reconciliation & Submit Bar (< lg) */}
          <div className="lg:hidden fixed bottom-[68px] left-0 right-0 z-30 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-2xl border-t border-slate-200/80 dark:border-white/10 p-3 pb-safe shadow-2xl flex items-center justify-between gap-3 font-sans">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 dark:text-[#8e8e93] uppercase font-mono">Physical:</span>
                <strong className="font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                  {formatINR(physicalTotal)}
                </strong>
              </div>
              <div className="text-xs font-mono font-semibold">
                <span className="text-slate-500 dark:text-[#8e8e93]">Diff: </span>
                <span
                  className={cn(
                    varianceAmount === 0
                      ? 'text-emerald-600 dark:text-[#3ecf8e]'
                      : varianceAmount > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-rose-600 dark:text-rose-400 font-bold'
                  )}
                >
                  {varianceAmount === 0 ? '₹0 (Matched)' : formatINR(varianceAmount)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!locked && (
                <button
                  type="submit"
                  disabled={submitting}
                  onClick={() => triggerHaptic()}
                  className="h-11 px-5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-semibold text-xs tracking-tight transition-all cursor-pointer flex items-center gap-1.5 shadow-md select-none ios-press"
                >
                  <Check className="w-4 h-4 text-[#171717] stroke-[3]" />
                  <span>{submitting ? 'Closing...' : 'Close Day'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </main>

      {/* Pre-Commit Daily Closing Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e] rounded-[12px] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                  Confirm Daily Closing
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 rounded-[4px] text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 font-sans text-xs">
              <div className="p-3.5 rounded-[8px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] space-y-2 font-mono">
                <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                  <span>Closing Date</span>
                  <span className="font-medium text-slate-900 dark:text-white">{closingDate}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                  <span>Branch</span>
                  <span className="font-medium text-slate-900 dark:text-white">{activeBranch.branch_code}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                  <span>Cashier / User</span>
                  <span className="font-medium text-slate-900 dark:text-white">{user?.first_name || 'Cashier'} {user?.last_name || ''}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-[8px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] space-y-2 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-zinc-300">Expected Cash in Box</span>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatINR(expectedBookCash)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-zinc-300">Actual Counted Cash</span>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatINR(physicalTotal)}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-[#262626] flex justify-between items-center">
                  <span className="text-slate-900 dark:text-white font-semibold">Difference / Variance</span>
                  <span className={cn('text-sm font-bold tabular-nums', varianceAmount === 0 ? 'text-emerald-600 dark:text-[#3ecf8e]' : varianceAmount > 0 ? 'text-blue-500' : 'text-rose-500')}>
                    {varianceAmount === 0 ? 'Matched (₹0)' : formatINR(varianceAmount)}
                  </span>
                </div>
              </div>

              {closingNotes && (
                <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626]">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Notes:</span>
                  <p className="text-slate-700 dark:text-zinc-300 font-sans text-xs">{closingNotes}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-slate-50/50 dark:bg-[#181818] border-t border-slate-200 dark:border-[#242424] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-3.5 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-700 dark:text-zinc-300 text-xs font-medium cursor-pointer"
              >
                Back & Edit
              </button>
              <SubmitButton
                type="button"
                loading={submitting}
                onClick={handleConfirmFinalSave}
                loadingText="Locking Closing..."
                icon={<Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                className="px-4 py-1.5 text-xs font-semibold"
              >
                Confirm & Lock Closing
              </SubmitButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

