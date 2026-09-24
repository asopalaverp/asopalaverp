import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { TouchSignatureCanvas } from '@/components/advances/TouchSignatureCanvas';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { format } from 'date-fns';
import {
  X,
  HandCoins,
  Check,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Zap,
  RotateCcw,
  Sparkles,
  Calendar,
  Building2,
  Tag,
  PenTool,
  Printer,
  Plus,
} from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DatePicker } from '@/components/ui/DatePicker';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { numberToWordsINR, formatINR, cn, triggerHaptic, normalizeBranchCode } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { useOverrideStore } from '@/store/overrideStore';

interface NewAdvanceDrawerProps {
  onSuccess: () => void;
}

const COMMON_PURPOSES = [
  'Emergency / Medical',
  'Festival / Diwali',
  'Family Need',
  'Travel & Bus Fare',
  'Salary Advance',
  'Shop Material Purchase',
  'Tailoring Work',
];

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

export const NewAdvanceDrawer: React.FC<NewAdvanceDrawerProps> = ({ onSuccess }) => {
  const { isAdvanceModalOpen, setAdvanceModalOpen } = useUIStore();
  const { user } = useAuthStore();
  const { staff } = useVouchers();
  const { isExcessAdvancesAllowed, isNegativeWalletAllowed } = useOverrideStore();

  const [staffCode, setStaffCode] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [advanceDate, setAdvanceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Physical_Cash' | 'Online_UPI'>('Physical_Cash');
  const [purpose, setPurpose] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [cashBalance, setCashBalance] = useState(0);
  const [upiBalance, setUpiBalance] = useState(0);

  const selectedStaff = staff.find((s) => s.staff_code === staffCode);
  const targetBranchId = selectedStaff?.branch_id || 'Aellp-ASI';

  // Check Prior Unsettled Advances
  const [pendingAdvanceInfo, setPendingAdvanceInfo] = useState<{
    hasPending: boolean;
    totalUnsettled: number;
    advances: any[];
  }>({ hasPending: false, totalUnsettled: 0, advances: [] });

  useEffect(() => {
    let isCurrent = true;
    if (staffCode) {
      erpService.getStaffPendingAdvance(staffCode, targetBranchId).then((res) => {
        if (isCurrent) {
          setPendingAdvanceInfo(res);
        }
      });
    } else {
      setPendingAdvanceInfo({ hasPending: false, totalUnsettled: 0, advances: [] });
    }
    return () => {
      isCurrent = false;
    };
  }, [staffCode, targetBranchId]);

  const loadWallet = async () => {
    try {
      const w = await erpService.getBranchWallet(targetBranchId);
      setCashBalance(w.cash_balance);
      setUpiBalance(w.upi_balance);
    } catch (e) {
      console.warn('Error fetching wallet balance for advance:', e);
    }
  };

  useEffect(() => {
    if (isAdvanceModalOpen) {
      loadWallet();
      setError('');
    }
  }, [isAdvanceModalOpen, targetBranchId]);

  // Handle Quick Presets
  const handleAddPreset = (val: number) => {
    triggerHaptic('selection');
    const curr = Number(amount) || 0;
    setAmount(curr + val);
  };

  const handleClose = () => {
    if (submitting) return;
    setAdvanceModalOpen(false);
  };

  // Calculations
  const numAmount = Number(amount) || 0;
  const availableBalance = paymentMethod === 'Physical_Cash' ? cashBalance : upiBalance;
  const isInsufficient = numAmount > 0 && numAmount > availableBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!staffCode) {
      const msg = 'Please select a showroom staff member.';
      setError(msg);
      showToast({ type: 'error', title: 'Staff Required', message: msg });
      triggerHaptic('error');
      return;
    }

    if (!selectedStaff) {
      const msg = 'Staff profile not found.';
      setError(msg);
      showToast({ type: 'error', title: 'Staff Invalid', message: msg });
      triggerHaptic('error');
      return;
    }

    if (!receiptNumber.trim()) {
      const msg = 'Please enter the physical advance receipt slip number.';
      setError(msg);
      showToast({ type: 'error', title: 'Receipt Number Required', message: msg });
      triggerHaptic('error');
      return;
    }

    if (numAmount <= 0) {
      const msg = 'Please enter a valid advance amount greater than ₹0.';
      setError(msg);
      showToast({ type: 'error', title: 'Amount Required', message: msg });
      triggerHaptic('error');
      return;
    }

    if (isInsufficient && !isNegativeWalletAllowed()) {
      const msg = `Insufficient ${paymentMethod === 'Physical_Cash' ? 'Cash Till' : 'UPI'} balance (${formatINR(availableBalance)}) for ₹${numAmount} advance.`;
      setError(msg);
      showToast({ type: 'error', title: 'Insufficient Balance', message: msg });
      triggerHaptic('error');
      return;
    }

    // Check Advance Limit (₹10,000) or Concurrent Advance
    const isExcessAdvance = numAmount > 10000 || pendingAdvanceInfo.hasPending;
    const isExcessRestricted = isExcessAdvance && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer';
    if (isExcessRestricted && !isExcessAdvancesAllowed()) {
      const msg = numAmount > 10000
        ? `Advance Limit Exceeded: Staff advance maximum limit is ₹10,000. For ₹${formatINR(numAmount)}, enable F12 Emergency Excess Advance Override.`
        : `Active Advance Exists: ${selectedStaff.first_name} already has an unsettled advance of ₹${formatINR(pendingAdvanceInfo.totalUnsettled)}. Settle prior advance or enable F12 Excess Advance Override.`;
      setError(msg);
      showToast({ type: 'error', title: 'Excess Advance Restricted', message: msg });
      triggerHaptic('error');
      return;
    }

    if (!purpose.trim()) {
      const msg = 'Please provide a reason or purpose for this advance.';
      setError(msg);
      showToast({ type: 'error', title: 'Purpose Required', message: msg });
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    triggerHaptic('medium');

    try {
      const branchCode = normalizeBranchCode(selectedStaff.branch_code || 'ASI');
      const receiptNo = `${branchCode}-ADV-${receiptNumber.trim().toUpperCase()}`;
      const staffFullName = `${selectedStaff.first_name} ${selectedStaff.last_name}`.trim();
      const userName = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();
      const userRole = user?.role_code || 'Store_Manager';

      let finalSignature = signatureData;
      if (!finalSignature) {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90"><text x="150" y="48" font-family="'Brush Script MT', 'Segoe Script', cursive, sans-serif" font-size="28" font-style="italic" fill="#059669" text-anchor="middle">${staffFullName}</text><text x="150" y="72" font-family="monospace" font-size="9" fill="#64748b" text-anchor="middle">Digital Staff Sign-off • ${advanceDate}</text></svg>`;
        finalSignature = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
      }

      await erpService.disburseStaffAdvance({
        advance: {
          receipt_number: receiptNo,
          advance_date: advanceDate,
          branch_id: selectedStaff.branch_id,
          branch_code: selectedStaff.branch_code,
          staff_code: selectedStaff.staff_code,
          staff_name: staffFullName,
          department_name: selectedStaff.department_name || undefined,
          designation: selectedStaff.designation || 'Showroom Staff',
          payment_method: paymentMethod,
          advance_amount: numAmount,
          purpose: purpose.trim(),
          signature_image_url: finalSignature,
          disbursed_by_name: userName,
        },
        userName,
        userRole,
      });

      triggerHaptic('success');
      showToast({
        type: 'success',
        title: 'Advance Given',
        message: `Advance #${receiptNo} of ₹${numAmount} given to ${staffFullName}.`,
      });

      onSuccess();
      setAdvanceModalOpen(false);
    } catch (err: any) {
      console.error('Error creating staff advance:', err);
      setError(err.message || 'Failed to give advance.');
      triggerHaptic('error');
      showToast({
        type: 'error',
        title: 'Could Not Give Advance',
        message: err.message || 'Failed to give advance.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const staffInitials = selectedStaff
    ? `${selectedStaff.first_name[0] || ''}${selectedStaff.last_name ? selectedStaff.last_name[0] : ''}`.toUpperCase()
    : 'ST';

  const drawerBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] badge-status-emerald text-[11px] font-sans font-medium select-none">
      New Advance
    </span>
  );

  const drawerFooter = (
    <>
      <div className="min-w-0">
        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400">
          Disbursal Total
        </div>
        <div className="font-mono font-medium text-base sm:text-lg text-slate-900 dark:text-white tabular-nums truncate">
          {formatINR(numAmount)}
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
          disabled={submitting || isInsufficient || numAmount <= 0}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-xs font-medium font-sans transition-colors cursor-pointer shadow-xs min-h-[34px] disabled:opacity-50 disabled:cursor-not-allowed',
            isInsufficient
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60'
              : 'bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717]'
          )}
        >
          <Check className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
          <span>{submitting ? 'Giving Advance...' : 'Confirm & Give Advance'}</span>
        </button>
      </div>
    </>
  );

  return (
    <SlideOverDrawer
      isOpen={isAdvanceModalOpen}
      onClose={handleClose}
      title="Give Staff Advance"
      subtitle="Give salary advance or emergency money to staff from cash box or UPI"
      badge={drawerBadge}
      size="xl"
      footer={drawerFooter}
    >
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto w-full space-y-4">
        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-[8px] badge-status-rose flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium font-sans">{error}</span>
          </div>
        )}

        {/* STEP 1: Staff Selection */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#262626]">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              1. Select Showroom Staff <span className="text-rose-500">*</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Step 1 of 4</span>
          </div>

          <SearchableSelect
            label="Staff Recipient"
            value={staffCode}
            onChange={(val) => {
              triggerHaptic('selection');
              setStaffCode(val);
            }}
            options={staff.map((s) => ({
              value: s.staff_code,
              label: `${s.first_name} ${s.last_name}`,
              sublabel: `${s.department_name || 'Floor'} · ${s.designation || 'Staff'} (${s.branch_code || 'ASI'})`,
              badge: s.staff_code,
            }))}
            placeholder="Search staff by name or code..."
          />

          {/* Selected Staff Profile Card */}
          {selectedStaff && (
            <div className="mt-3 p-3 rounded-[6px] bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#282828] flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <Avatar size="md" shape="circle">
                  <AvatarFallback>{staffInitials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-900 dark:text-white">
                      {selectedStaff.first_name} {selectedStaff.last_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono bg-slate-100 dark:bg-[#141414] text-slate-600 dark:text-zinc-400 font-medium border border-slate-200 dark:border-[#2e2e2e]">
                      {selectedStaff.staff_code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-sans mt-0.5">
                    {selectedStaff.department_name || 'Showroom Floor'} · {selectedStaff.designation || 'Sales Executive'}
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-medium text-slate-500 dark:text-zinc-400">
                {selectedStaff.branch_code || 'ASI'}
              </span>
            </div>
          )}

          {/* Existing Unsettled Advance Alert */}
          {pendingAdvanceInfo.hasPending && (
            <div className="p-3 rounded-[6px] badge-status-amber flex items-start gap-2.5 text-xs mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="block font-medium">
                  Existing Unsettled Advance: <span className="font-mono tabular-nums">{formatINR(pendingAdvanceInfo.totalUnsettled)}</span>
                </strong>
                <span className="text-[11px] block mt-0.5 leading-snug opacity-90">
                  {selectedStaff?.first_name} has {pendingAdvanceInfo.advances.length} active advance(s) awaiting bill or cash settlement.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: Advance Date & Amount Fast-Pad */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#262626]">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              2. Advance Amount & Date <span className="text-rose-500">*</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Step 2 of 4</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <DatePicker
              label="Advance Payment Date"
              value={advanceDate}
              onChange={(d) => {
                triggerHaptic('selection');
                setAdvanceDate(d);
              }}
              required
            />

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-800 dark:text-slate-200 font-sans">
                Physical Receipt Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] shadow-xs overflow-hidden min-h-[42px]">
                <span className="px-2.5 py-2 bg-slate-100 dark:bg-[#1f1f1f] text-slate-600 dark:text-[#A1A1A1] font-mono font-bold text-xs select-none shrink-0 border-r border-slate-200 dark:border-[#2e2e2e]">
                  {selectedStaff?.branch_code || 'ASI'}-ADV-
                </span>
                <input
                  type="text"
                  required
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''))}
                  placeholder="e.g. 0124"
                  className="w-full bg-transparent px-3 py-2 text-xs font-mono font-bold tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-800 dark:text-slate-200 font-sans">
                Advance Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] shadow-xs min-h-[42px]">
                <span className="pl-3.5 text-base font-mono text-slate-400">₹</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                  placeholder="0.00"
                  className="w-full bg-transparent pl-2 pr-3 py-2 text-base font-mono font-medium tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Fast Amount Preset Chips */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              Quick Amount Presets (Tap to Add):
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleAddPreset(amt)}
                  className="px-2.5 py-1 rounded-[6px] bg-white dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-800 dark:text-zinc-200 text-xs font-mono font-medium border border-slate-200 dark:border-[#2e2e2e] active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  +₹{amt.toLocaleString('en-IN')}
                </button>
              ))}

              {amount !== '' && Number(amount) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setAmount('');
                  }}
                  className="px-2.5 py-1 rounded-[6px] text-xs font-mono text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {numAmount > 0 && (
            <p className="text-xs font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium pt-1">
              {numberToWordsINR(numAmount)}
            </p>
          )}
        </div>

        {/* STEP 3: Payment Source (Cash vs UPI) */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#262626]">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              3. Pay Money From <span className="text-rose-500">*</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Step 3 of 4</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Physical Cash */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setPaymentMethod('Physical_Cash');
              }}
              className={cn(
                'p-3.5 rounded-[6px] border flex flex-col items-start text-left transition-all cursor-pointer shadow-xs min-h-[64px]',
                paymentMethod === 'Physical_Cash'
                  ? 'border-emerald-500 dark:border-[#3ecf8e] bg-emerald-50/20 dark:bg-[#202020] text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-slate-600 dark:text-zinc-400 hover:border-slate-300'
              )}
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-[10px] uppercase font-mono tracking-wider font-medium text-slate-500 dark:text-zinc-400">
                  Cash Drawer
                </span>
                {paymentMethod === 'Physical_Cash' && (
                  <span className="w-4 h-4 rounded-full bg-[#3ecf8e] flex items-center justify-center text-[#171717]">
                    <Check className="w-2.5 h-2.5 text-[#171717] stroke-[3]" />
                  </span>
                )}
              </div>
              <strong className="text-sm block mt-1 font-medium text-slate-900 dark:text-white">
                Physical Cash in Till
              </strong>
              <span className="text-xs text-emerald-700 dark:text-[#3ecf8e] font-mono font-medium tabular-nums mt-0.5">
                {formatINR(cashBalance)} Available
              </span>
            </button>

            {/* Online UPI */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setPaymentMethod('Online_UPI');
              }}
              className={cn(
                'p-3.5 rounded-[6px] border flex flex-col items-start text-left transition-all cursor-pointer shadow-xs min-h-[64px]',
                paymentMethod === 'Online_UPI'
                  ? 'border-emerald-500 dark:border-[#3ecf8e] bg-emerald-50/20 dark:bg-[#202020] text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-slate-600 dark:text-zinc-400 hover:border-slate-300'
              )}
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-[10px] uppercase font-mono tracking-wider font-medium text-slate-500 dark:text-zinc-400">
                  Bank / UPI
                </span>
                {paymentMethod === 'Online_UPI' && (
                  <span className="w-4 h-4 rounded-full bg-[#3ecf8e] flex items-center justify-center text-[#171717]">
                    <Check className="w-2.5 h-2.5 text-[#171717] stroke-[3]" />
                  </span>
                )}
              </div>
              <strong className="text-sm block mt-1 font-medium text-slate-900 dark:text-white">
                Online QR / Bank Transfer
              </strong>
              <span className="text-xs text-sky-700 dark:text-sky-400 font-mono font-medium tabular-nums mt-0.5">
                {formatINR(upiBalance)} Available
              </span>
            </button>
          </div>

          {isInsufficient && (
            <div className="p-3 rounded-[6px] badge-status-rose flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Insufficient balance: Available {formatINR(availableBalance)}, but advance requires {formatINR(numAmount)}.
              </span>
            </div>
          )}
        </div>

        {/* STEP 4: Purpose & Quick Tags */}
        <div className="space-y-3 p-4 rounded-[8px] bg-slate-50/60 dark:bg-[#161616] border border-slate-200 dark:border-[#262626]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#262626]">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-sans">
              4. Reason / Purpose & Sign-off <span className="text-rose-500">*</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Step 4 of 4</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-800 dark:text-slate-200 font-sans">
              Reason for Advance <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Festival advance / Medical emergency / Travel advance"
              className="w-full bg-white dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] rounded-[6px] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] shadow-xs min-h-[38px]"
            />
          </div>

          {/* Quick Purpose Tag Chips */}
          <div className="space-y-1">
            <label className="block text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              Quick Purpose Tags:
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {COMMON_PURPOSES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setPurpose(tag);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-[6px] text-xs font-sans transition-colors cursor-pointer border',
                    purpose === tag
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-500/30 font-medium'
                      : 'bg-white dark:bg-[#202020] text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-[#2e2e2e] hover:border-slate-300'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Touch Signature Canvas */}
          <div className="pt-2">
            <TouchSignatureCanvas
              onSave={setSignatureData}
              staffName={selectedStaff ? `${selectedStaff.first_name} ${selectedStaff.last_name}` : ''}
            />
          </div>
        </div>
      </form>
    </SlideOverDrawer>
  );
};

export default NewAdvanceDrawer;
