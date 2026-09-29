import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { useOverrideStore } from '@/store/overrideStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { StaffSplitTable, SplitItem } from '@/components/vouchers/StaffSplitTable';
import { VendorSplitTable } from '@/components/vouchers/VendorSplitTable';
import { BillUploader } from '@/components/vouchers/BillUploader';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DatePicker } from '@/components/ui/DatePicker';
import { SegmentedControl } from '@/components/ui';
import { QuickFloatDrawer } from '@/components/vouchers/QuickFloatDrawer';
import { cn, formatINR, numberToWordsINR, printThermalVoucherSlip, triggerHaptic, normalizeBranchCode, DEFAULT_BRANCHES } from '@/lib/utils';
import { format } from 'date-fns';
import { animateErrorBanner } from '@/lib/animations';
import { showToast } from '@/components/ui/ToastContainer';
import { VendorSplitItem, VoucherMode } from '@/types/database';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Check,
  Building2,
  Calendar,
  Wallet,
  RotateCcw,
  Sparkles,
  Plus,
  Zap,
  Printer,
  FileText,
  Users,
  Package,
  Receipt,
  Camera,
  ShieldAlert,
  Store,
  Truck,
  HelpCircle,
  X,
  CreditCard,
  Banknote,
  UserCheck,
  Eye,
} from 'lucide-react';

export const NewVoucherPage: React.FC = () => {
  const { setActivePage } = useUIStore();
  const { user, can, getAllowedBranches, isBranchAllowed } = useAuthStore();
  const { branches, selectedBranchId, setSelectedBranchId, getActiveBranch } = useBranchStore();
  const { categories, departments, couriers, staff, refresh } = useVouchers();

  const allowedBranches = getAllowedBranches(branches);
  const activeBranch = getActiveBranch();
  const initialBranch = (selectedBranchId && selectedBranchId !== 'ALL' && isBranchAllowed(selectedBranchId))
    ? selectedBranchId
    : (allowedBranches[0]?.branch_id || activeBranch.branch_id || 'Aellp-ASI');

  // Permissions: Cashiers cannot inject cash float
  const canAddCash = can('can_inject_float') && user?.role_code !== 'Cashier';

  // Mode Selection: Shop_Vendor (Default), Staff_Split, Courier
  const [mode, setMode] = useState<VoucherMode>('Shop_Vendor');
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [voucherDigits, setVoucherDigits] = useState<string>('');
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [upiBalance, setUpiBalance] = useState<number>(0);
  const [isPeriodLocked, setIsPeriodLocked] = useState<boolean>(false);
  const isSubmittingRef = useRef(false);

  // Sync selected branch when store changes
  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== 'ALL' && isBranchAllowed(selectedBranchId)) {
      setSelectedBranch(selectedBranchId);
    }
  }, [selectedBranchId]);

  const targetCode = normalizeBranchCode(selectedBranch);
  const branchList = allowedBranches && allowedBranches.length > 0 ? allowedBranches : DEFAULT_BRANCHES;
  const currBranch = branchList.find(
    (b) =>
      b.branch_id === selectedBranch ||
      normalizeBranchCode(b.branch_id) === targetCode ||
      normalizeBranchCode(b.branch_code) === targetCode
  ) || branchList[0] || DEFAULT_BRANCHES[0];

  // Scroll to top on mount
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  // Load Live Wallet Balances
  const loadBalances = async () => {
    try {
      const w = await erpService.getBranchWallet(selectedBranch);
      setCashBalance(w.cash_balance);
      setUpiBalance(w.upi_balance);
    } catch (err) {
      console.warn('Error fetching wallet balance:', err);
    }
  };

  useEffect(() => {
    loadBalances();
    const handleWalletUpdate = () => loadBalances();
    window.addEventListener('asopalav:wallet-updated', handleWalletUpdate);
    return () => window.removeEventListener('asopalav:wallet-updated', handleWalletUpdate);
  }, [selectedBranch]);

  // Check Accounting Period Lock
  useEffect(() => {
    async function checkPeriod() {
      try {
        const locked = await erpService.checkIsPeriodLocked(paymentDate);
        setIsPeriodLocked(locked);
      } catch (err) {
        setIsPeriodLocked(false);
      }
    }
    checkPeriod();
  }, [paymentDate]);

  // Listen for Global Voucher Mode Change (Alt+1 / Alt+2 / Alt+3)
  useEffect(() => {
    const handleSetMode = (e: any) => {
      if (e.detail?.mode) {
        triggerHaptic('selection');
        setMode(e.detail.mode);
      }
    };
    window.addEventListener('asopalav:set-voucher-mode', handleSetMode);
    return () => window.removeEventListener('asopalav:set-voucher-mode', handleSetMode);
  }, []);

  // Form Fields State
  const [categoryName, setCategoryName] = useState<string>('');
  const [departmentName, setDepartmentName] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [billNumber, setBillNumber] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');

  // Staff Requester State
  const [requestedByStaffCode, setRequestedByStaffCode] = useState<string>('');
  const [requestedByStaffName, setRequestedByStaffName] = useState<string>('');

  // Multi-Vendor Mode State
  const [isMultiVendor, setIsMultiVendor] = useState<boolean>(false);
  const [vendorSplits, setVendorSplits] = useState<VendorSplitItem[]>([
    {
      vendor_name: '',
      category_name: '',
      department_name: '',
      bill_number: '',
      description: '',
      amount: 0,
    },
  ]);

  // Staff Split Multi-Mode State
  const [splits, setSplits] = useState<SplitItem[]>([
    {
      staffCode: '',
      staffName: '',
      departmentName: '',
      categoryName: '',
      amount: 0,
    },
  ]);

  // Courier Specific State
  const [courierCompany, setCourierCompany] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');

  // Payment & Remarks State
  const [paymentMethod, setPaymentMethod] = useState<'Physical_Cash' | 'Online_UPI'>('Online_UPI');
  const [remarks, setRemarks] = useState<string>('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  // Submission, Preview & Feedback State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successVoucher, setSuccessVoucher] = useState<any | null>(null);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Float Slide-Over Drawer State
  const [isQuickFloatOpen, setIsQuickFloatOpen] = useState<boolean>(false);

  // Listen to Global Counter Custom Events
  useEffect(() => {
    const handleSetMode = (e: Event) => {
      const custom = e as CustomEvent<VoucherMode>;
      if (custom.detail) {
        setMode(custom.detail);
      }
    };
    const handleTriggerDisburse = () => {
      formRef.current?.requestSubmit();
    };
    const handleOpenFloat = () => {
      if (canAddCash) setIsQuickFloatOpen(true);
    };

    window.addEventListener('asopalav:set-voucher-mode', handleSetMode);
    window.addEventListener('asopalav:trigger-disburse-f2', handleTriggerDisburse);
    window.addEventListener('asopalav:open-quick-float', handleOpenFloat);

    return () => {
      window.removeEventListener('asopalav:set-voucher-mode', handleSetMode);
      window.removeEventListener('asopalav:trigger-disburse-f2', handleTriggerDisburse);
      window.removeEventListener('asopalav:open-quick-float', handleOpenFloat);
    };
  }, [canAddCash]);

  useEffect(() => {
    if (error && errorBannerRef.current) {
      animateErrorBanner(errorBannerRef.current);
    }
  }, [error]);

  // Keyboard Shortcuts Listener (F2: Disburse, F6: Float, Alt+1/2/3: Mode, ESC: Reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (successVoucher) return;

      if (e.key === 'F2') {
        e.preventDefault();
        if (isSubmittingRef.current) return;
        formRef.current?.requestSubmit();
      } else if (e.key === 'F6' && canAddCash) {
        e.preventDefault();
        triggerHaptic('selection');
        setIsQuickFloatOpen((prev) => !prev);
      } else if (e.altKey && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        triggerHaptic('selection');
        setMode('Shop_Vendor');
      } else if (e.altKey && (e.key === '2' || e.code === 'Digit2')) {
        e.preventDefault();
        triggerHaptic('selection');
        setMode('Staff_Split');
      } else if (e.altKey && (e.key === '3' || e.code === 'Digit3')) {
        e.preventDefault();
        triggerHaptic('selection');
        setMode('Courier');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [successVoucher, canAddCash]);

  // Quick Amount Add
  const handleAddAmount = (inc: number) => {
    triggerHaptic('selection');
    setAmount((prev) => {
      const cur = Number(prev) || 0;
      return cur + inc;
    });
  };

  // Calculated Total Amount
  const finalCalculatedAmount = useMemo(() => {
    if (mode === 'Staff_Split') {
      return splits.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    }
    if (mode === 'Shop_Vendor' && isMultiVendor) {
      return vendorSplits.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    }
    return Number(amount) || 0;
  }, [mode, isMultiVendor, amount, splits, vendorSplits]);

  // Section 40A(3) Compliance Check
  const sec40A3Check = useMemo(() => {
    return erpService.validateSection40A3(paymentMethod, finalCalculatedAmount, mode);
  }, [paymentMethod, finalCalculatedAmount, mode]);

  const {
    isNegativeWalletAllowed,
    isAutoVoucherDigitsAllowed,
    is40A3ExceededAllowed,
    isLockedPeriodEntryAllowed,
    isBackdatedAllowed,
  } = useOverrideStore();

  const allowNegative = isNegativeWalletAllowed();
  const allowAutoVoucher = isAutoVoucherDigitsAllowed();
  const allowLockedPeriod = isLockedPeriodEntryAllowed();
  const allowBackdated = isBackdatedAllowed();

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const isBackdated = paymentDate < todayStr;
  const isBackdateRestricted = isBackdated && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer';
  const isBackdateBlocked = isBackdateRestricted && !allowBackdated;

  // Balance Check
  const availableBalance = paymentMethod === 'Physical_Cash' ? cashBalance : upiBalance;
  const isInsufficientBalance = finalCalculatedAmount > 0 && finalCalculatedAmount > availableBalance;

  const handleResetForm = () => {
    setAmount('');
    setCategoryName('');
    setDepartmentName('');
    setRecipientName('');
    setRequestedByStaffCode('');
    setRequestedByStaffName('');
    setIsMultiVendor(false);
    setVendorSplits([
      {
        vendor_name: '',
        category_name: '',
        department_name: '',
        bill_number: '',
        description: '',
        amount: 0,
      },
    ]);
    setBillNumber('');
    setRemarks('');
    setPhotoUrls([]);
    setError(null);
    setVoucherDigits('');
    setSplits([
      {
        staffCode: '',
        staffName: '',
        departmentName: '',
        categoryName: '',
        amount: 0,
      },
    ]);
    setCourierCompany('');
    setTrackingNumber('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    _handleValidateAndPreview();
  };

  const _handleValidateAndPreview = () => {
    setError(null);

    // Section 40A(3) enforcement
    if (sec40A3Check.exceeded && !is40A3ExceededAllowed()) {
      setError(`Cash payment of ${formatINR(finalCalculatedAmount)} exceeds the ₹10,000 tax limit. Please switch to Bank UPI.`);
      return;
    }

    // Block future-dated vouchers
    if (paymentDate > todayStr && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer') {
      setError("Cannot pick future date. Please use today's date.");
      return;
    }

    // Date Validation for Cashiers
    if (isBackdateBlocked) {
      const msg = `Past dates are locked for Cashiers. You can only record for today (${format(new Date(), 'dd-MMM-yyyy')}).`;
      setError(msg);
      showToast({ type: 'error', title: 'Date Locked', message: msg });
      triggerHaptic('error');
      return;
    }

    // Voucher Number Validation
    let effectiveVoucherDigits = voucherDigits.trim();
    if (!effectiveVoucherDigits) {
      if (allowAutoVoucher) {
        effectiveVoucherDigits = `EMG-${Date.now().toString().slice(-4)}`;
      } else {
        const msg = 'Please enter the bill / voucher book number.';
        setError(msg);
        showToast({ type: 'error', title: 'Bill Number Needed', message: msg });
        triggerHaptic('error');
        return;
      }
    }

    // Amount Validation
    if (finalCalculatedAmount <= 0) {
      const msg = 'Please enter an amount greater than ₹0.';
      setError(msg);
      showToast({ type: 'error', title: 'Amount Needed', message: msg });
      triggerHaptic('error');
      return;
    }

    // Till Balance Validation
    if (isInsufficientBalance && !allowNegative) {
      const msg = `Not enough ${paymentMethod === 'Physical_Cash' ? 'Cash in box' : 'UPI balance'}. Need ${formatINR(finalCalculatedAmount)}, but only ${formatINR(availableBalance)} available.`;
      setError(msg);
      showToast({ type: 'error', title: 'Not Enough Money', message: msg });
      triggerHaptic('error');
      return;
    }

    // Mode-Specific Validations
    if (mode === 'Shop_Vendor') {
      if (isMultiVendor) {
        if (vendorSplits.length === 0) {
          const msg = 'Please add at least one vendor item in the table.';
          setError(msg);
          showToast({ type: 'error', title: 'Vendor Needed', message: msg });
          triggerHaptic('error');
          return;
        }
        const invalidItem = vendorSplits.find((v) => !v.vendor_name.trim() || Number(v.amount) <= 0);
        if (invalidItem) {
          const msg = 'Every item must have a vendor name and amount > ₹0.';
          setError(msg);
          showToast({ type: 'error', title: 'Check Table', message: msg });
          triggerHaptic('error');
          return;
        }
      } else {
        if (!categoryName) {
          const msg = 'Please choose an expense category.';
          setError(msg);
          showToast({ type: 'error', title: 'Category Needed', message: msg });
          triggerHaptic('error');
          return;
        }
        if (!recipientName.trim()) {
          const msg = 'Please write who was paid (shop or person name).';
          setError(msg);
          showToast({ type: 'error', title: 'Name Needed', message: msg });
          triggerHaptic('error');
          return;
        }
      }
    } else if (mode === 'Courier') {
      if (!courierCompany.trim()) {
        const msg = 'Please choose or write the courier agency name.';
        setError(msg);
        showToast({ type: 'error', title: 'Courier Needed', message: msg });
        triggerHaptic('error');
        return;
      }
    } else if (mode === 'Staff_Split') {
      if (splits.length === 0) {
        const msg = 'Please add at least one staff member to split.';
        setError(msg);
        showToast({ type: 'error', title: 'Staff Needed', message: msg });
        triggerHaptic('error');
        return;
      }
      const invalidSplit = splits.find((s) => !s.staffName.trim() || Number(s.amount) <= 0);
      if (invalidSplit) {
        const msg = 'All staff entries must have a name and amount > ₹0.';
        setError(msg);
        showToast({ type: 'error', title: 'Check Staff Split', message: msg });
        triggerHaptic('error');
        return;
      }
    }

    // Period Lock Validation
    if (isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer') {
      const msg = `Today's register has been closed. New expenses cannot be saved.`;
      setError(msg);
      showToast({ type: 'error', title: 'Day Closed', message: msg });
      triggerHaptic('error');
      return;
    }

    // Notes minimum length check
    if (!remarks.trim() || remarks.trim().length < 3) {
      const msg = 'Please write a short reason for this expense (at least 3 letters).';
      setError(msg);
      showToast({ type: 'error', title: 'Reason Needed', message: msg });
      triggerHaptic('error');
      return;
    }

    // All valid -> Open Preview Modal for confirmation!
    triggerHaptic('selection');
    setIsPreviewOpen(true);
  };

  const executeFinalDisbursal = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    triggerHaptic('heavy');

    let effectiveVoucherDigits = voucherDigits.trim();
    if (!effectiveVoucherDigits && allowAutoVoucher) {
      effectiveVoucherDigits = `EMG-${Date.now().toString().slice(-4)}`;
    }

    try {
      const generatedVoucherNumber = `${currBranch.branch_code}-${effectiveVoucherDigits.toUpperCase()}`;

      const payload: any = {
        branch_id: selectedBranch,
        branch_code: currBranch.branch_code,
        payment_date: paymentDate,
        payment_type: mode,
        payment_method: paymentMethod,
        total_amount: finalCalculatedAmount,
        remarks,
        bill_number: billNumber.trim() || undefined,
        bill_photo_urls: photoUrls,
        created_by_name: `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim(),
        status: 'Approved',
        requested_by_staff_code: requestedByStaffCode.trim() || undefined,
        requested_by_staff_name: requestedByStaffName.trim() || undefined,
      };

      if (mode === 'Shop_Vendor') {
        if (isMultiVendor) {
          payload.category_name = vendorSplits[0]?.category_name || categoryName || 'Multiple Expenses';
          payload.department_name = vendorSplits[0]?.department_name || departmentName || 'Main Shop Floor';
          payload.recipient_name = `${vendorSplits.length} Vendors (${vendorSplits.map((v) => v.vendor_name.split(' ')[0]).join(', ')})`;
          payload.vendor_splits = vendorSplits;
        } else {
          payload.category_name = categoryName || 'General Expense';
          payload.department_name = departmentName || 'Main Shop Floor';
          payload.recipient_name = recipientName;
        }
      } else if (mode === 'Courier') {
        payload.category_name = categoryName || 'Customer Courier & Packing';
        payload.department_name = departmentName || 'Logistics & Dispatch';
        payload.recipient_name = courierCompany;
        payload.courier_company = courierCompany;
        payload.tracking_number = trackingNumber;
      } else if (mode === 'Staff_Split') {
        payload.category_name = categoryName || 'Staff Welfare & Food';
        payload.department_name = departmentName || 'Store Operations';
        payload.recipient_name = `${splits.length} Staff (${splits.map((s) => s.staffName.split(' ')[0]).join(', ')})`;
        payload.splits = splits;
      }

      const created = await erpService.createVoucherWithLedger({
        voucher: {
          ...payload,
          voucher_number: generatedVoucherNumber,
        },
        splits:
          mode === 'Staff_Split'
            ? splits.map((s) => ({
                staffCode: s.staffCode,
                staffName: s.staffName,
                departmentName: s.departmentName || departmentName || 'Store Operations',
                categoryName: s.categoryName || categoryName || 'Staff Welfare & Food',
                amount: s.amount,
              }))
            : undefined,
        userName: `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim(),
        userRole: user?.role_code || 'Cashier',
      });

      showToast({
        type: 'success',
        title: 'Expense Saved',
        message: `Bill #${created.voucher_number} for ₹${created.total_amount} paid successfully.`,
      });

      setIsPreviewOpen(false);
      setSuccessVoucher(created);
      refresh();
      loadBalances();
    } catch (err: any) {
      console.error('Error creating voucher:', err);
      const rawMsg = err?.message || 'Could not save expense.';
      let userFriendlyMsg = rawMsg;
      if (rawMsg.includes('duplicate key') || rawMsg.includes('voucher_number') || rawMsg.includes('Duplicate Voucher Number')) {
        userFriendlyMsg = `Bill #${currBranch.branch_code}-${effectiveVoucherDigits.toUpperCase()} already exists. Please check the next number in your bill book.`;
      }
      showToast({
        type: 'error',
        title: 'Could Not Save',
        message: userFriendlyMsg,
      });
      setError(userFriendlyMsg);
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Keyboard Shortcuts Listener when Preview Modal is open
  useEffect(() => {
    if (!isPreviewOpen) return;
    const handlePreviewKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPreviewOpen(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeFinalDisbursal();
      }
    };
    window.addEventListener('keydown', handlePreviewKeyDown);
    return () => window.removeEventListener('keydown', handlePreviewKeyDown);
  }, [isPreviewOpen]);

  // Success Screen Keyboard Shortcuts Listener (P: Print, Space: Next, Esc: Expenses)
  useEffect(() => {
    if (!successVoucher) return;
    const handleSuccessKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        printThermalVoucherSlip(successVoucher);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        triggerHaptic('success');
        setSuccessVoucher(null);
        handleResetForm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActivePage('expenses');
      }
    };

    window.addEventListener('keydown', handleSuccessKeyDown);
    return () => window.removeEventListener('keydown', handleSuccessKeyDown);
  }, [successVoucher]);

  // SUCCESS STATE MODAL & THERMAL RECEIPT FLOW
  if (successVoucher) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 font-sans select-none space-y-4 animate-in fade-in duration-200">
        <div className="p-6 sm:p-8 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-xs text-center space-y-6">
          {/* Top Success Badge */}
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 dark:bg-[#3ecf8e]/10 border border-emerald-500/20 dark:border-[#3ecf8e]/20 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-white font-sans tracking-tight">
              Expense Saved & Paid Successfully!
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              Bill #{successVoucher.voucher_number} • {currBranch.branch_name}
            </p>
          </div>

          {/* Quick Summary Card */}
          <div className="p-4 rounded-[8px] bg-slate-50/70 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] divide-y divide-slate-200/70 dark:divide-[#242424] text-xs font-sans text-left">
            <div className="flex justify-between items-center pb-2.5">
              <span className="text-slate-500 dark:text-zinc-400 font-sans">Bill Number:</span>
              <span className="font-mono font-medium text-slate-900 dark:text-white text-xs px-2 py-0.5 rounded-[4px] bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e]">
                #{successVoucher.voucher_number}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <span className="text-slate-500 dark:text-zinc-400 font-sans">Amount Paid:</span>
              <span className="font-mono font-medium text-emerald-600 dark:text-[#3ecf8e] text-lg sm:text-xl tabular-nums">
                {formatINR(successVoucher.total_amount)}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <span className="text-slate-500 dark:text-zinc-400 font-sans">Paid To:</span>
              <span className="text-slate-900 dark:text-white font-medium font-sans">
                {successVoucher.recipient_name}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <span className="text-slate-500 dark:text-zinc-400 font-sans">Payment Source:</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-xs font-mono font-medium bg-slate-100 dark:bg-[#1f1f1f] text-slate-800 dark:text-zinc-300 border border-slate-200 dark:border-[#2e2e2e]">
                {successVoucher.payment_method === 'Physical_Cash' ? 'Cash Box' : 'Bank UPI'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5">
              <span className="text-slate-500 dark:text-zinc-400 font-sans">Category:</span>
              <span className="text-slate-700 dark:text-zinc-300 font-sans">
                {successVoucher.category_name}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => printThermalVoucherSlip(successVoucher)}
              className="w-full sm:flex-1 h-10 min-h-[40px] px-4 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-800 dark:text-zinc-200 font-medium font-sans text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Print Slip</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                setSuccessVoucher(null);
                handleResetForm();
              }}
              className="w-full sm:flex-1 h-10 min-h-[40px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-sans text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs select-none"
            >
              <Zap className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
              <span>Add Next Expense</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('expenses')}
              className="w-full sm:w-auto h-10 min-h-[40px] px-4 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-800 dark:text-zinc-200 font-sans text-xs font-medium cursor-pointer transition-colors shadow-xs"
            >
              All Expenses
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-6 select-none">
      {/* 1. Add Expense Header (2-Layer Layout: Left Title & Subtitle, Right Actions) */}
      <div className="border-b border-slate-200 dark:border-[#242424] bg-white/90 dark:bg-[#141414]/90 backdrop-blur-xl px-4 lg:px-6 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3ecf8e]" />
                <span>Add Expense</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8e8e93] font-sans mt-0.5">
              Record daily shop expenses, staff food, and courier bills.
            </p>
          </div>

          {/* Right Layer: Live Balances & Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <div className="h-8 px-2.5 flex items-center gap-1.5 rounded-[6px] bg-slate-50 dark:bg-[#1c1c1f] border border-slate-200 dark:border-[#26262a] shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e]" />
                <span className="text-[10px] text-slate-500 dark:text-[#8e8e93] font-sans font-medium">Cash:</span>
                <span className="font-semibold text-emerald-700 dark:text-[#3ecf8e] tabular-nums">{formatINR(cashBalance)}</span>
              </div>
              <div className="h-8 px-2.5 flex items-center gap-1.5 rounded-[6px] bg-slate-50 dark:bg-[#1c1c1f] border border-slate-200 dark:border-[#26262a] shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span className="text-[10px] text-slate-500 dark:text-[#8e8e93] font-sans font-medium">UPI:</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">{formatINR(upiBalance)}</span>
              </div>
            </div>

            {canAddCash && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setIsQuickFloatOpen(true);
                }}
                className="h-8 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Add Cash (F6)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetForm}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] transition-all cursor-pointer shadow-2xs"
              title="Clear Form"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Studio Content Area */}
      <div className="px-4 lg:px-6 py-4 space-y-4 flex-1">
        {/* Error Alert Banner */}
        {error && (
          <div
            ref={errorBannerRef}
            className="p-3.5 rounded-[12px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans animate-in fade-in shadow-xs"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div>
                <strong className="block font-semibold text-rose-900 dark:text-rose-200 text-xs">Please check:</strong>
                <span className="text-rose-700 dark:text-rose-300 text-xs font-medium leading-relaxed">{error}</span>
              </div>
            </div>

            {canAddCash && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsQuickFloatOpen(true)}
                  className="px-3 py-1.5 rounded-[6px] border border-emerald-600/30 dark:border-[#3ecf8e]/30 bg-emerald-100/80 dark:bg-[#3ecf8e]/10 hover:bg-emerald-200 dark:hover:bg-[#3ecf8e]/20 text-emerald-900 dark:text-[#3ecf8e] font-sans font-semibold flex items-center gap-1 text-xs cursor-pointer transition-all shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cash</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Section 40A(3) Compliance Alert */}
        {sec40A3Check.exceeded && (
          <div className="p-3.5 rounded-[12px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans animate-in fade-in shadow-xs">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-amber-900 dark:text-amber-200 text-xs">
                  Cash Limit Warning (Over ₹10,000)
                </strong>
                <span className="text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                  Cash payment of {formatINR(finalCalculatedAmount)} exceeds ₹10,000 tax limit. Please pay with Bank UPI.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaymentMethod('Online_UPI')}
              className="px-3.5 py-1.5 rounded-[6px] bg-white dark:bg-[#202020] hover:bg-slate-50 dark:hover:bg-[#282828] text-slate-800 dark:text-white border border-slate-300 dark:border-[#2e2e2e] font-semibold text-xs shrink-0 cursor-pointer shadow-xs transition-all"
            >
              Pay via Bank UPI
            </button>
          </div>
        )}

        {/* Main 2-Column Responsive POS Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
            {/* LEFT COLUMN: Modes, Basic Details, Expense Details */}
            <div className="lg:col-span-8 space-y-4">
              {/* 1. COMPACT MODE SELECTION TABS */}
              <div className="w-full">
                <SegmentedControl
                  options={[
                    { id: 'Shop_Vendor', label: 'Shop Bill', icon: <Store className="w-4 h-4 shrink-0" /> },
                    { id: 'Staff_Split', label: 'Staff Food', icon: <Users className="w-4 h-4 shrink-0" /> },
                    { id: 'Courier', label: 'Courier', icon: <Truck className="w-4 h-4 shrink-0" /> },
                  ]}
                  value={mode}
                  onChange={(val) => setMode(val as VoucherMode)}
                  size="md"
                  fullWidth
                />
              </div>

          {/* CARD 1: BASIC DETAILS */}
          <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] shadow-2xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Showroom / Branch */}
              <div className="space-y-1 min-w-0">
                <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                  Branch *
                </label>
                <SearchableSelect
                  value={selectedBranch}
                  onChange={(val) => {
                    setSelectedBranch(val);
                    setSelectedBranchId(val);
                  }}
                  options={branchList.map((b) => ({
                    value: b.branch_id,
                    label: b.branch_name,
                  }))}
                  placeholder="Select branch..."
                  allowCustom={false}
                />
              </div>

              {/* Date of Payment */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                    Date *
                  </label>
                  {isBackdated && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                      Past Date
                    </span>
                  )}
                </div>
                <DatePicker
                  value={paymentDate}
                  onChange={setPaymentDate}
                  placeholder="Select date..."
                />
              </div>

              {/* Voucher Number */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                    Bill No. *
                  </label>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-[#3ecf8e]">
                    Auto
                  </span>
                </div>
                <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e]/30 overflow-hidden h-10 min-h-[40px] shadow-2xs">
                  <span className="px-3 h-full flex items-center bg-slate-50 dark:bg-[#1c1c1c] text-slate-600 dark:text-[#A1A1A1] font-mono font-medium text-xs select-none shrink-0 border-r border-slate-200 dark:border-[#282828]">
                    {currBranch.branch_code}-
                  </span>
                  <input
                    type="text"
                    value={voucherDigits}
                    onChange={(e) => setVoucherDigits(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''))}
                    placeholder="0001"
                    className="w-full bg-transparent px-3 py-2 text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Sub-Row: Amount + Paid From */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#222222] grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
              {/* Left 7 cols: Amount Input */}
              <div className="md:col-span-7 space-y-1.5">
                <label className="block text-xs font-medium text-slate-800 dark:text-[#EDEDED]">
                  Amount (₹) *
                </label>

                <div className="relative flex items-center rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e]/30 shadow-2xs overflow-hidden h-10 min-h-[40px]">
                  <span className="pl-3.5 pr-1 text-sm font-mono text-slate-400 dark:text-zinc-500 font-medium select-none">
                    ₹
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    disabled={mode === 'Staff_Split' || (mode === 'Shop_Vendor' && isMultiVendor)}
                    value={mode === 'Staff_Split' || (mode === 'Shop_Vendor' && isMultiVendor) ? finalCalculatedAmount || '' : amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                    placeholder="0.00"
                    className="w-full bg-transparent pl-1 pr-3.5 py-2 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none disabled:opacity-85 disabled:cursor-not-allowed"
                  />
                </div>

                {finalCalculatedAmount > 0 && (
                  <div className="p-1.5 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#282828]">
                    <span className="text-[11px] text-emerald-600 dark:text-[#3ecf8e] font-mono font-medium block truncate">
                      {numberToWordsINR(finalCalculatedAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Right 5 cols: Paid From (Bank UPI vs Cash Box) */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="block text-xs font-medium text-slate-800 dark:text-[#EDEDED]">
                  Pay Mode *
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setPaymentMethod('Online_UPI');
                    }}
                    className={cn(
                      'p-2 rounded-[6px] border text-left flex flex-col justify-between cursor-pointer transition-all shadow-2xs h-10 min-h-[40px]',
                      paymentMethod === 'Online_UPI'
                        ? 'bg-sky-500/10 border-sky-400 text-slate-900 dark:text-white ring-1 ring-sky-400/30'
                        : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-[#282828] text-slate-700 dark:text-[#A1A1A1] hover:bg-slate-50 dark:hover:bg-[#202020]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-sky-500" />
                        <span>Bank UPI</span>
                      </span>
                      {paymentMethod === 'Online_UPI' && <Check className="w-3 h-3 text-sky-400 stroke-[2.5]" />}
                    </div>
                    <span className="text-[9.5px] font-mono text-sky-500 dark:text-sky-400 tabular-nums font-semibold leading-none">
                      UPI: {formatINR(upiBalance)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setPaymentMethod('Physical_Cash');
                    }}
                    className={cn(
                      'p-2 rounded-[6px] border text-left flex flex-col justify-between cursor-pointer transition-all shadow-2xs h-10 min-h-[40px]',
                      paymentMethod === 'Physical_Cash'
                        ? 'bg-emerald-500/10 border-[#3ecf8e] text-slate-900 dark:text-white ring-1 ring-[#3ecf8e]/30'
                        : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-[#282828] text-slate-700 dark:text-[#A1A1A1] hover:bg-slate-50 dark:hover:bg-[#202020]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                        <span>Cash Box</span>
                      </span>
                      {paymentMethod === 'Physical_Cash' && <Check className="w-3 h-3 text-[#3ecf8e] stroke-[2.5]" />}
                    </div>
                    <span className="text-[9.5px] font-mono text-emerald-600 dark:text-[#3ecf8e] tabular-nums font-semibold leading-none">
                      Cash: {formatINR(cashBalance)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: EXPENSE DETAILS */}
          <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] shadow-2xs space-y-3.5">
            {/* Who ordered this */}
            <div className="space-y-1 min-w-0">
              <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                Staff Member (Optional)
              </label>
              <SearchableSelect
                value={requestedByStaffCode}
                onChange={(val) => {
                  setRequestedByStaffCode(val);
                  const found = staff.find((s) => s.staff_code === val);
                  setRequestedByStaffName(found ? `${found.first_name} ${found.last_name || ''}`.trim() : val);
                }}
                options={staff.map((s) => ({
                  value: s.staff_code,
                  label: `${s.first_name} ${s.last_name || ''}`.trim(),
                  subLabel: s.department_name || s.designation,
                }))}
                placeholder="Select staff member..."
                allowCustom={true}
              />
            </div>

            {/* Mode-Specific Inputs */}
            {mode === 'Shop_Vendor' && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-[#222222]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-800 dark:text-[#EDEDED]">
                    Shop Details
                  </span>

                  <div className="flex items-center p-0.5 rounded-[6px] bg-slate-100 dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#2e2e2e] self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setIsMultiVendor(false);
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-[4px] transition-all cursor-pointer select-none',
                        !isMultiVendor
                          ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white shadow-2xs font-semibold'
                          : 'text-slate-500 dark:text-[#888888] hover:text-slate-800 dark:hover:text-[#dddddd]'
                      )}
                    >
                      Single Shop
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setIsMultiVendor(true);
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-[4px] transition-all cursor-pointer select-none',
                        isMultiVendor
                          ? 'bg-emerald-500/15 dark:bg-[#3ecf8e]/15 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/30 dark:border-[#3ecf8e]/30 shadow-2xs font-semibold'
                          : 'text-slate-500 dark:text-[#888888] hover:text-slate-800 dark:hover:text-[#dddddd]'
                      )}
                    >
                      Multiple Shops
                    </button>
                  </div>
                </div>

                {!isMultiVendor ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Paid To *
                        </label>
                        <input
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="e.g. Ramesh Tea Stall, Sharma Electrician"
                          className="w-full rounded-[6px] border border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-sans placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 h-10 min-h-[40px] shadow-2xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Bill No. (Optional)
                        </label>
                        <input
                          type="text"
                          value={billNumber}
                          onChange={(e) => setBillNumber(e.target.value)}
                          placeholder="e.g. Bill #104"
                          className="w-full rounded-[6px] border border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 h-10 min-h-[40px] shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Category *
                        </label>
                        <SearchableSelect
                          value={categoryName}
                          onChange={setCategoryName}
                          options={categories.map((c) => ({
                            value: c.category_name,
                            label: c.category_name,
                          }))}
                          placeholder="Select category..."
                          allowCustom={true}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Department *
                        </label>
                        <SearchableSelect
                          value={departmentName}
                          onChange={setDepartmentName}
                          options={departments.map((d) => ({
                            value: d.department_name,
                            label: d.department_name,
                          }))}
                          placeholder="Select department..."
                          allowCustom={true}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <VendorSplitTable
                    splits={vendorSplits}
                    categories={categories}
                    departments={departments}
                    targetAmount={Number(amount) || undefined}
                    onChange={setVendorSplits}
                  />
                )}
              </div>
            )}

            {mode === 'Staff_Split' && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-[#222222]">
                <StaffSplitTable
                  splits={splits}
                  staffList={staff}
                  categories={categories}
                  departments={departments}
                  targetAmount={Number(amount) || undefined}
                  onChange={setSplits}
                />
              </div>
            )}

            {mode === 'Courier' && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-[#222222]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Courier Name *
                    </label>
                    <SearchableSelect
                      value={courierCompany}
                      onChange={setCourierCompany}
                      options={couriers.map((c) => ({
                        value: c.partner_name,
                        label: c.partner_name,
                      }))}
                      placeholder="Select courier (Maruti, DTDC)..."
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Tracking / Agent Name *
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. Ramesh Bhai / Track No."
                      className="w-full rounded-[6px] border border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 h-10 min-h-[40px] shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes / Reason */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#222222] space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                  Reason *
                </label>
                <span className="font-mono text-[10.5px] text-slate-400 dark:text-zinc-500">
                  {remarks.length} / 255
                </span>
              </div>

              <textarea
                rows={2}
                maxLength={255}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value.slice(0, 255))}
                placeholder="Why was this money spent? (e.g. Tea for floor staff)"
                className="w-full rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#121212] p-2.5 text-slate-900 dark:text-white text-xs font-sans placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] resize-none shadow-2xs leading-relaxed"
              />
            </div>
          </div>

            </div>
            {/* END LEFT COLUMN */}

            {/* RIGHT COLUMN (lg:col-span-4): Attach Bill, Total Amount & Review & Pay Dock */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
              {/* CARD 3: ATTACH PHOTO */}
              <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200/80 dark:border-[#242424] shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-[#EDEDED] font-sans block">
                      Attach Bill (Optional)
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-[#707070] font-sans mt-0.5 block">
                      Upload photo of bill, voucher slip, or receipt
                    </span>
                  </div>

                  <span className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#202020] text-slate-500 dark:text-[#8e8e8e] text-[10px] font-mono border border-slate-200/80 dark:border-[#282828] shrink-0 tabular-nums">
                    {photoUrls.length} / 4
                  </span>
                </div>

                <BillUploader photoUrls={photoUrls} onChange={setPhotoUrls} maxPhotos={4} />
              </div>

              {/* CARD 4: TOTAL & ACTION DOCK */}
              <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10.5px] text-slate-400 dark:text-zinc-500 font-sans block font-medium">
                      Total Amount
                    </span>
                    <span className="text-3xl font-medium font-mono text-slate-900 dark:text-white tabular-nums tracking-tight block">
                      {formatINR(finalCalculatedAmount)}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-[6px] text-xs font-mono font-medium bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#2e2e2e]">
                    {paymentMethod === 'Physical_Cash' ? 'Cash Box' : 'Bank UPI'}
                  </span>
                </div>

                {/* Main Review & Pay CTA */}
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (isInsufficientBalance && !allowNegative) ||
                    (isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer')
                  }
                  className={cn(
                    'w-full h-11 px-5 rounded-[6px] font-sans font-medium text-sm tracking-tight transition-all cursor-pointer select-none flex items-center justify-center gap-2 shadow-2xs',
                    isInsufficientBalance && !allowNegative
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60 cursor-not-allowed'
                      : isInsufficientBalance && allowNegative
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold'
                      : isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer'
                      ? 'bg-amber-600 text-white cursor-not-allowed opacity-80'
                      : 'bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] shadow-emerald-500/20 shadow-md font-semibold'
                  )}
                >
                  <Zap className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>
                    {submitting
                      ? 'Checking...'
                      : isInsufficientBalance && !allowNegative
                      ? 'Not Enough Cash in Box'
                      : 'Review & Pay (F2)'}
                  </span>
                </button>

                {/* Secondary buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-[#222222]">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="h-8.5 px-3 flex items-center justify-center gap-1.5 rounded-[6px] border border-slate-200 dark:border-[#282828] bg-slate-50 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] transition-colors cursor-pointer shadow-2xs text-xs font-medium"
                    title="Reset all form fields"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePage('dashboard')}
                    className="h-8.5 px-3 rounded-[6px] border border-slate-200 dark:border-[#282828] bg-slate-50 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] font-sans text-xs cursor-pointer transition-colors font-medium flex items-center justify-center shadow-2xs"
                  >
                    Cancel (ESC)
                  </button>
                </div>

                {/* POS Keyboard hints */}
                <div className="pt-2 border-t border-slate-100 dark:border-[#222222] flex items-center justify-between text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                  <span>F2: Save &amp; Pay</span>
                  <span>F6: Add Cash</span>
                  <span>Alt+1-3: Mode</span>
                </div>
              </div>
            </div>
            {/* END RIGHT COLUMN */}

          </div>
        </form>

        {/* PREVIEW & CONFIRMATION MODAL (Step before final payment) */}
        {isPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-100">
            <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2e2e32] rounded-[12px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col font-sans">
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#3ecf8e]" />
                  <h3 className="text-base font-medium text-slate-900 dark:text-white">
                    Review Payment
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1 rounded-[6px] text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body: Voucher Summary Slip */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#121214] border border-slate-200 dark:border-[#242426] text-center space-y-1">
                  <span className="text-[11px] font-sans text-slate-500 dark:text-zinc-400 uppercase tracking-wider block font-medium">
                    Amount to Pay
                  </span>
                  <span className="text-3xl font-mono font-medium text-emerald-600 dark:text-[#3ecf8e] tabular-nums tracking-tight block">
                    {formatINR(finalCalculatedAmount)}
                  </span>
                  <span className="text-xs font-mono text-slate-600 dark:text-zinc-300 block">
                    {numberToWordsINR(finalCalculatedAmount)}
                  </span>
                </div>

                <div className="rounded-[8px] border border-slate-200 dark:border-[#242426] bg-white dark:bg-[#141416] divide-y divide-slate-100 dark:divide-white/5 text-xs">
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 dark:text-zinc-400">Pay Mode:</span>
                    <span className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                      {paymentMethod === 'Physical_Cash' ? (
                        <>
                          <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Cash Box</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-3.5 h-3.5 text-sky-500" />
                          <span>Bank UPI</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 dark:text-zinc-400">Paid To:</span>
                    <span className="font-medium text-slate-900 dark:text-white text-right truncate max-w-[240px]">
                      {mode === 'Shop_Vendor'
                        ? isMultiVendor
                          ? `${vendorSplits.length} Vendors`
                          : recipientName
                        : mode === 'Courier'
                        ? courierCompany
                        : `${splits.length} Staff Members`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 dark:text-zinc-400">Category &amp; Dept:</span>
                    <span className="text-slate-700 dark:text-zinc-300 text-right truncate max-w-[240px]">
                      {categoryName || 'General'} • {departmentName || 'Main Floor'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 dark:text-zinc-400">Bill Number:</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      #{currBranch.branch_code}-{voucherDigits.trim() || 'AUTO'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 dark:text-zinc-400">Date:</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {format(new Date(paymentDate), 'dd MMMM yyyy')}
                    </span>
                  </div>

                  {requestedByStaffName && (
                    <div className="flex items-center justify-between p-3">
                      <span className="text-slate-500 dark:text-zinc-400">Ordered By:</span>
                      <span className="text-slate-700 dark:text-zinc-300">
                        {requestedByStaffName}
                      </span>
                    </div>
                  )}

                  <div className="p-3 space-y-1">
                    <span className="text-slate-500 dark:text-zinc-400 block">Reason / Notes:</span>
                    <p className="text-slate-800 dark:text-zinc-200 leading-relaxed font-sans">
                      {remarks}
                    </p>
                  </div>

                  {photoUrls.length > 0 && (
                    <div className="flex items-center justify-between p-3">
                      <span className="text-slate-500 dark:text-zinc-400">Bill Photos:</span>
                      <span className="text-emerald-600 dark:text-[#3ecf8e] font-mono">
                        {photoUrls.length} attached
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#141416] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="h-9 px-4 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1f1f1f] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-700 dark:text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Go Back &amp; Edit
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={executeFinalDisbursal}
                  className="h-9 px-5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>{submitting ? 'Saving...' : 'Confirm & Pay (Enter)'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QUICK CASH FLOAT (F6) - Restricted to Managers/Admins */}
        {canAddCash && (
          <QuickFloatDrawer
            isOpen={isQuickFloatOpen}
            onClose={() => setIsQuickFloatOpen(false)}
            branchId={selectedBranch}
            currentCashBalance={cashBalance}
            currentUpiBalance={upiBalance}
            onSuccess={() => {
              loadBalances();
              refresh();
            }}
          />
        )}
      </div>
    </div>
  );
};
