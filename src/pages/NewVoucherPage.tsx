import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { useOverrideStore } from '@/store/overrideStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { VoucherMode } from '@/components/vouchers/VoucherModeCards';
import { StaffSplitTable, SplitItem } from '@/components/vouchers/StaffSplitTable';
import { VendorSplitTable } from '@/components/vouchers/VendorSplitTable';
import { BillUploader } from '@/components/vouchers/BillUploader';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DatePicker } from '@/components/ui/DatePicker';
import { QuickFloatDrawer } from '@/components/vouchers/QuickFloatDrawer';
import { cn, formatINR, numberToWordsINR, printThermalVoucherSlip, triggerHaptic, normalizeBranchCode, DEFAULT_BRANCHES } from '@/lib/utils';
import { format } from 'date-fns';
import { animateErrorBanner } from '@/lib/animations';
import { showToast } from '@/components/ui/ToastContainer';
import { VendorSplitItem } from '@/types/database';
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
  Layers,
  HelpCircle,
  X,
  CreditCard,
  Banknote,
  UserCheck,
} from 'lucide-react';

// Fast Amount Increment Chips
const AMOUNT_INCREMENTS = [50, 100, 500, 1000];

interface VoucherDraft {
  id: string;
  label: string;
  mode: VoucherMode;
  isMultiVendor?: boolean;
  selectedBranch: string;
  paymentDate: string;
  voucherDigits: string;
  categoryName: string;
  departmentName: string;
  recipientName: string;
  requestedByStaffCode?: string;
  requestedByStaffName?: string;
  billNumber: string;
  amount: number | '';
  splits: SplitItem[];
  vendorSplits?: VendorSplitItem[];
  courierCompany: string;
  trackingNumber: string;
  paymentMethod: 'Physical_Cash' | 'Online_UPI';
  remarks: string;
  photoUrls: string[];
  updatedAt: number;
}

export const NewVoucherPage: React.FC = () => {
  const { setActivePage } = useUIStore();
  const { user, getAllowedBranches, isBranchAllowed } = useAuthStore();
  const { branches, selectedBranchId, setSelectedBranchId, getActiveBranch } = useBranchStore();
  const { categories, departments, couriers, staff, refresh } = useVouchers();

  const allowedBranches = getAllowedBranches(branches);
  const activeBranch = getActiveBranch();
  const initialBranch = (selectedBranchId && selectedBranchId !== 'ALL' && isBranchAllowed(selectedBranchId))
    ? selectedBranchId
    : (allowedBranches[0]?.branch_id || activeBranch.branch_id || 'Aellp-ASI');

  // Mode Selection: Shop_Vendor (Default), Staff_Split, Courier
  const [mode, setMode] = useState<VoucherMode>('Shop_Vendor');
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [voucherDigits, setVoucherDigits] = useState<string>('');
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [upiBalance, setUpiBalance] = useState<number>(0);
  const [isPeriodLocked, setIsPeriodLocked] = useState<boolean>(false);

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

  // Staff Requester State (Who initiated / ordered this expense?)
  const [requestedByStaffCode, setRequestedByStaffCode] = useState<string>('');
  const [requestedByStaffName, setRequestedByStaffName] = useState<string>('');

  // Multi-Vendor / Item Breakdown Mode State
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

  // Submission & Feedback State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successVoucher, setSuccessVoucher] = useState<any | null>(null);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Float (F6) Slide-Over Drawer State
  const [isQuickFloatOpen, setIsQuickFloatOpen] = useState<boolean>(false);

  // Multi-Draft Workstation Tabs State
  const [drafts, setDrafts] = useState<VoucherDraft[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('asopalav_pos_drafts_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [
      {
        id: 'draft-1',
        label: 'Draft #1',
        mode: 'Shop_Vendor',
        isMultiVendor: false,
        selectedBranch: selectedBranchId && selectedBranchId !== 'ALL' ? selectedBranchId : activeBranch.branch_id || 'Aellp-ASI',
        paymentDate: format(new Date(), 'yyyy-MM-dd'),
        voucherDigits: '',
        categoryName: '',
        departmentName: '',
        recipientName: '',
        requestedByStaffCode: '',
        requestedByStaffName: '',
        billNumber: '',
        amount: '',
        splits: [
          {
            staffCode: '',
            staffName: '',
            departmentName: '',
            categoryName: '',
            amount: 0,
          },
        ],
        vendorSplits: [
          {
            vendor_name: '',
            category_name: '',
            department_name: '',
            bill_number: '',
            description: '',
            amount: 0,
          },
        ],
        courierCompany: '',
        trackingNumber: '',
        paymentMethod: 'Online_UPI',
        remarks: '',
        photoUrls: [],
        updatedAt: Date.now(),
      },
    ];
  });
  const [activeDraftId, setActiveDraftId] = useState<string>(() => drafts[0]?.id || 'draft-1');

  // Auto-save active draft into drafts state and localStorage
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setDrafts((prev) => {
      const updated = prev.map((d) => {
        if (d.id === activeDraftId) {
          return {
            ...d,
            mode,
            isMultiVendor,
            selectedBranch,
            paymentDate,
            voucherDigits,
            categoryName,
            departmentName,
            recipientName,
            requestedByStaffCode,
            requestedByStaffName,
            billNumber,
            amount,
            splits,
            vendorSplits,
            courierCompany,
            trackingNumber,
            paymentMethod,
            remarks,
            photoUrls,
            updatedAt: Date.now(),
          };
        }
        return d;
      });
      try {
        localStorage.setItem('asopalav_pos_drafts_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [
    activeDraftId,
    mode,
    isMultiVendor,
    selectedBranch,
    paymentDate,
    voucherDigits,
    categoryName,
    departmentName,
    recipientName,
    requestedByStaffCode,
    requestedByStaffName,
    billNumber,
    amount,
    splits,
    vendorSplits,
    courierCompany,
    trackingNumber,
    paymentMethod,
    remarks,
    photoUrls,
  ]);

  // Draft Switching Handlers
  const handleSwitchDraft = (targetId: string) => {
    if (targetId === activeDraftId) return;
    triggerHaptic('selection');
    const target = drafts.find((d) => d.id === targetId);
    if (target) {
      setMode(target.mode);
      setIsMultiVendor(Boolean(target.isMultiVendor));
      setSelectedBranch(target.selectedBranch || activeBranch.branch_id || 'Aellp-ASI');
      setPaymentDate(target.paymentDate || format(new Date(), 'yyyy-MM-dd'));
      setVoucherDigits(target.voucherDigits || '');
      setCategoryName(target.categoryName || '');
      setDepartmentName(target.departmentName || '');
      setRecipientName(target.recipientName || '');
      setRequestedByStaffCode(target.requestedByStaffCode || '');
      setRequestedByStaffName(target.requestedByStaffName || '');
      setBillNumber(target.billNumber || '');
      setAmount(target.amount ?? '');
      setSplits(
        target.splits && target.splits.length > 0
          ? target.splits
          : [
              {
                staffCode: '',
                staffName: '',
                departmentName: '',
                categoryName: '',
                amount: 0,
              },
            ]
      );
      setVendorSplits(
        target.vendorSplits && target.vendorSplits.length > 0
          ? target.vendorSplits
          : [
              {
                vendor_name: '',
                category_name: '',
                department_name: '',
                bill_number: '',
                description: '',
                amount: 0,
              },
            ]
      );
      setCourierCompany(target.courierCompany || '');
      setTrackingNumber(target.trackingNumber || '');
      setPaymentMethod(target.paymentMethod || 'Physical_Cash');
      setRemarks(target.remarks || '');
      setPhotoUrls(target.photoUrls || []);
      setError(null);
      setActiveDraftId(targetId);
    }
  };

  const handleCreateNewDraft = () => {
    triggerHaptic('selection');
    const newId = `draft-${Date.now()}`;
    const newDraft: VoucherDraft = {
      id: newId,
      label: `Draft #${drafts.length + 1}`,
      mode: 'Shop_Vendor',
      isMultiVendor: false,
      selectedBranch: selectedBranchId && selectedBranchId !== 'ALL' ? selectedBranchId : activeBranch.branch_id || 'Aellp-ASI',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      voucherDigits: '',
      categoryName: '',
      departmentName: '',
      recipientName: '',
      billNumber: '',
      amount: '',
      splits: [
        {
          staffCode: '',
          staffName: '',
          departmentName: '',
          categoryName: '',
          amount: 0,
        },
      ],
      vendorSplits: [
        {
          vendor_name: '',
          category_name: '',
          department_name: '',
          bill_number: '',
          description: '',
          amount: 0,
        },
      ],
      courierCompany: '',
      trackingNumber: '',
      paymentMethod: 'Online_UPI',
      remarks: '',
      photoUrls: [],
      updatedAt: Date.now(),
    };

    setDrafts((prev) => {
      const next = [...prev, newDraft];
      try {
        localStorage.setItem('asopalav_pos_drafts_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    setMode(newDraft.mode);
    setSelectedBranch(newDraft.selectedBranch);
    setPaymentDate(newDraft.paymentDate);
    setVoucherDigits('');
    setCategoryName(newDraft.categoryName);
    setDepartmentName(newDraft.departmentName);
    setRecipientName('');
    setBillNumber('');
    setAmount('');
    setSplits(newDraft.splits);
    setCourierCompany('');
    setTrackingNumber('');
    setPaymentMethod('Online_UPI');
    setRemarks('');
    setPhotoUrls([]);
    setError(null);
    setActiveDraftId(newId);

    showToast({
      type: 'info',
      title: 'New Voucher Tab Opened',
      message: `Workstation tab #${drafts.length + 1} ready.`,
    });
  };

  const handleCloseDraft = (draftId: string) => {
    if (drafts.length <= 1) return;
    triggerHaptic('light');
    const filtered = drafts.filter((d) => d.id !== draftId);
    setDrafts(filtered);
    try {
      localStorage.setItem('asopalav_pos_drafts_v1', JSON.stringify(filtered));
    } catch {}

    if (activeDraftId === draftId) {
      const nextActive = filtered[0];
      if (nextActive) {
        handleSwitchDraft(nextActive.id);
      }
    }
  };

  // Listen to Global Counter Custom Events
  useEffect(() => {
    const handleApplyAmount = (e: Event) => {
      const custom = e as CustomEvent<{ amount: number }>;
      if (custom.detail?.amount) {
        setAmount(custom.detail.amount);
        if (amountInputRef.current) {
          amountInputRef.current.focus();
        }
      }
    };
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
      setIsQuickFloatOpen(true);
    };

    window.addEventListener('asopalav:apply-voucher-amount', handleApplyAmount);
    window.addEventListener('asopalav:set-voucher-mode', handleSetMode);
    window.addEventListener('asopalav:trigger-disburse-f2', handleTriggerDisburse);
    window.addEventListener('asopalav:open-quick-float', handleOpenFloat);

    return () => {
      window.removeEventListener('asopalav:apply-voucher-amount', handleApplyAmount);
      window.removeEventListener('asopalav:set-voucher-mode', handleSetMode);
      window.removeEventListener('asopalav:trigger-disburse-f2', handleTriggerDisburse);
      window.removeEventListener('asopalav:open-quick-float', handleOpenFloat);
    };
  }, []);

  useEffect(() => {
    if (error && errorBannerRef.current) {
      animateErrorBanner(errorBannerRef.current);
    }
  }, [error]);

  // Keyboard Shortcuts Listener for Counter Ergonomics (F2: Disburse, F6: Float, Alt+1/2/3: Mode, ESC: Reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when inside modal or success screen
      if (successVoucher) return;

      if (e.key === 'F2') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      } else if (e.key === 'F6') {
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
  }, [successVoucher]);

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
    setError(null);

    // 0. Date Validation (Cashiers locked to Today only unless Super Admin override in F12 is enabled)
    if (isBackdateBlocked) {
      const msg = `Backdated entries are locked for Cashier accounts. You can only record vouchers for today (${format(new Date(), 'dd-MMM-yyyy')}). Super Admin can toggle backdating in F12 Profile & Security.`;
      setError(msg);
      showToast({
        type: 'error',
        title: 'Backdated Entry Locked',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    // 1. Voucher Number Validation (Physical voucher number required or SuperAdmin auto emergency code)
    let effectiveVoucherDigits = voucherDigits.trim();
    if (!effectiveVoucherDigits) {
      if (allowAutoVoucher) {
        effectiveVoucherDigits = `EMG-${Date.now().toString().slice(-4)}`;
      } else {
        const msg = 'Please enter the physical voucher / bill book number.';
        setError(msg);
        showToast({
          type: 'error',
          title: 'Voucher Number Required',
          message: msg,
        });
        triggerHaptic('error');
        return;
      }
    }

    // 2. Amount Validation
    if (finalCalculatedAmount <= 0) {
      const msg = 'Please enter a valid expense amount greater than ₹0.';
      setError(msg);
      showToast({
        type: 'error',
        title: 'Amount Required',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    // 3. Till Balance Validation (Bypassed if SuperAdmin Override is active)
    if (isInsufficientBalance && !allowNegative) {
      const msg = `Insufficient ${
        paymentMethod === 'Physical_Cash' ? 'Cash Drawer Till' : 'Bank UPI'
      } balance (${formatINR(availableBalance)} available, ${formatINR(
        finalCalculatedAmount
      )} required). Press F6 to inject cash float from safe.`;
      setError(msg);
      showToast({
        type: 'error',
        title: 'Insufficient Balance',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    // 4. Mode-Specific Validations
    if (mode === 'Shop_Vendor') {
      if (isMultiVendor) {
        if (vendorSplits.length === 0) {
          const msg = 'Please add at least one vendor / item line to the multi-vendor table.';
          setError(msg);
          showToast({
            type: 'error',
            title: 'Vendor Line Required',
            message: msg,
          });
          triggerHaptic('error');
          return;
        }
        const invalidItem = vendorSplits.find((v) => !v.vendor_name.trim() || Number(v.amount) <= 0);
        if (invalidItem) {
          const msg = 'All vendor line items must have a vendor/shop name and an amount > ₹0.';
          setError(msg);
          showToast({
            type: 'error',
            title: 'Invalid Vendor Item',
            message: msg,
          });
          triggerHaptic('error');
          return;
        }
      } else {
        if (!categoryName) {
          const msg = 'Please select or enter an expense category.';
          setError(msg);
          showToast({
            type: 'error',
            title: 'Category Required',
            message: msg,
          });
          triggerHaptic('error');
          return;
        }
        if (!recipientName.trim()) {
          const msg = 'Please enter the recipient / vendor payee name.';
          setError(msg);
          showToast({
            type: 'error',
            title: 'Payee Required',
            message: msg,
          });
          triggerHaptic('error');
          return;
        }
      }
    } else if (mode === 'Courier') {
      if (!courierCompany.trim()) {
        const msg = 'Please select or enter the courier agency name.';
        setError(msg);
        showToast({
          type: 'error',
          title: 'Courier Agency Required',
          message: msg,
        });
        triggerHaptic('error');
        return;
      }
    } else if (mode === 'Staff_Split') {
      if (splits.length === 0) {
        const msg = 'Please add at least one staff member to the split table.';
        setError(msg);
        showToast({
          type: 'error',
          title: 'Staff Required',
          message: msg,
        });
        triggerHaptic('error');
        return;
      }
      const invalidSplit = splits.find((s) => !s.staffName.trim() || Number(s.amount) <= 0);
      if (invalidSplit) {
        const msg = 'All staff split entries must have a selected staff name and an amount > ₹0.';
        setError(msg);
        showToast({
          type: 'error',
          title: 'Invalid Staff Split',
          message: msg,
        });
        triggerHaptic('error');
        return;
      }
    }

    // 5. Backdating Lock Validation for Cashiers (Bypassed if F12 Backdate Override is enabled)
    if (isBackdateBlocked) {
      const msg = `Backdating Locked: Cashiers are restricted to recording expenses for today (${todayStr}). Past date ${paymentDate} requires F12 Emergency Backdate Override.`;
      setError(msg);
      showToast({
        type: 'error',
        title: 'Backdating Restricted',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    // 6. Period Lock Validation (Bypassed for SuperAdmin or Override)
    if (isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer') {
      const msg = `Accounting period for ${paymentDate} is LOCKED. Vouchers cannot be recorded for locked dates.`;
      setError(msg);
      showToast({
        type: 'error',
        title: 'Accounting Period Locked',
        message: msg,
      });
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    triggerHaptic('heavy');

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
        title: 'Expense Voucher Recorded',
        message: `Voucher #${created.voucher_number} for ₹${created.total_amount} saved successfully.`,
      });

      setSuccessVoucher(created);
      refresh();
      loadBalances();
    } catch (err: any) {
      console.error('Error creating voucher:', err);
      showToast({
        type: 'error',
        title: 'Could Not Save',
        message: err?.message || 'Failed to save expense.',
      });
      setError(err?.message || 'Failed to save expense. Please check your internet connection.');
    } finally {
      setSubmitting(false);
    }
  };

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
                {successVoucher.payment_method === 'Physical_Cash' ? 'Cash Drawer Till' : 'Online Bank / UPI'}
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
              className="w-full sm:flex-1 h-[38px] px-3.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-800 dark:text-zinc-200 font-medium font-sans text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Print Thermal Slip</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                setSuccessVoucher(null);
                handleResetForm();
              }}
              className="w-full sm:flex-1 h-[38px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-sans text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs select-none"
            >
              <Zap className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
              <span>Record Next Voucher</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('expenses')}
              className="w-full sm:w-auto h-[38px] px-3.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-800 dark:text-zinc-200 font-sans text-xs font-medium cursor-pointer transition-colors shadow-xs"
            >
              All Expenses
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-20 select-none flex flex-col">
      {/* 1. Add Expense Header (2-Layer Layout: Left Title & Subtitle, Right Actions) */}
      <div className="border-b border-slate-200 dark:border-[#232323] bg-white dark:bg-[#141414] px-4 lg:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3ecf8e]" />
                <span>Add Expense</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
              Record daily shop expenses, staff food, and courier bills.
            </p>
          </div>

          {/* Right Layer: Live Balances & Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <div className="h-8.5 px-2.5 flex items-center rounded-[6px] bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#262626] shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] mr-1.5 font-sans">Cash:</span>
                <span className="font-medium text-[#3ecf8e] tabular-nums">{formatINR(cashBalance)}</span>
              </div>
              <div className="h-8.5 px-2.5 flex items-center rounded-[6px] bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#262626] shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] mr-1.5 font-sans">UPI:</span>
                <span className="font-medium text-sky-500 dark:text-sky-400 tabular-nums">{formatINR(upiBalance)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setIsQuickFloatOpen(true);
              }}
              className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-[#1a1a1a] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Add Cash</span>
            </button>

            <button
              type="button"
              onClick={handleResetForm}
              className="h-8.5 w-8.5 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-[#1a1a1a] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#222222] transition-colors cursor-pointer shadow-xs"
              title="Clear Form"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 1.5 Multi-Draft Workstation Tabs Strip (Hold Bills) */}
      <div className="border-b border-slate-200 dark:border-[#1f1f1f] bg-slate-50/60 dark:bg-[#161616] px-4 lg:px-6 py-1.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-[#707070] mr-1 flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bills:</span>
          </span>
          {drafts.map((draft, idx) => {
            const isActive = draft.id === activeDraftId;
            const draftTitle = draft.recipientName
              ? `${draft.recipientName} (${draft.amount ? `₹${draft.amount}` : '₹0'})`
              : draft.mode === 'Staff_Split'
              ? `Staff Split (${draft.amount ? `₹${draft.amount}` : '₹0'})`
              : draft.mode === 'Courier'
              ? `Courier (${draft.courierCompany || 'Pending'})`
              : `Draft #${idx + 1}`;

            return (
              <div
                key={draft.id}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-sans transition-all cursor-pointer select-none shrink-0 group border',
                  isActive
                    ? 'bg-white dark:bg-[#202020] text-slate-900 dark:text-white border-slate-300 dark:border-[#383838] shadow-2xs font-medium'
                    : 'bg-transparent text-slate-500 dark:text-[#888] border-transparent hover:bg-slate-200/60 dark:hover:bg-[#1a1a1a] hover:text-slate-800 dark:hover:text-[#ccc]'
                )}
                onClick={() => handleSwitchDraft(draft.id)}
              >
                <span className="truncate max-w-[130px] font-mono text-[11px]">{draftTitle}</span>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseDraft(draft.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-300 dark:hover:bg-[#333] text-slate-400 hover:text-rose-500 transition-opacity ml-0.5"
                    title="Close Draft"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleCreateNewDraft}
            className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium text-slate-600 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#1f1f1f] border border-dashed border-slate-300 dark:border-[#333] transition-colors cursor-pointer shrink-0"
            title="Open new empty bill (Hold current draft)"
          >
            <Plus className="w-3 h-3" />
            <span>New Bill</span>
          </button>
        </div>

        {/* Right Status Hint */}
        <div className="hidden md:flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-400 dark:text-[#666]">
          <span>Auto-Saved</span>
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsQuickFloatOpen(true)}
                className="px-3 py-1.5 rounded-[6px] border border-emerald-600/30 dark:border-[#3ecf8e]/30 bg-emerald-100/80 dark:bg-[#3ecf8e]/10 hover:bg-emerald-200 dark:hover:bg-[#3ecf8e]/20 text-emerald-900 dark:text-[#3ecf8e] font-sans font-medium flex items-center gap-1 text-xs cursor-pointer transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Cash</span>
              </button>
            </div>
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
                  Cash payment of {formatINR(finalCalculatedAmount)} exceeds the ₹10,000 limit allowed by tax rules. Please pay via Bank UPI instead.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaymentMethod('Online_UPI')}
              className="px-3 py-1.5 rounded-[6px] bg-white dark:bg-[#202020] hover:bg-slate-50 dark:hover:bg-[#282828] text-slate-800 dark:text-white border border-slate-300 dark:border-[#2e2e2e] font-medium text-xs shrink-0 cursor-pointer shadow-xs transition-colors"
            >
              Pay via Bank UPI
            </button>
          </div>
        )}

        {/* Main Full-Width Single-Page Responsive Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-3.5">
          {/* 1. COMPACT MODE SELECTION TABS (Shop Expense / Staff Expense / Courier) */}
          <div className="flex items-center p-1 rounded-[10px] bg-slate-100 dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#282828] gap-1 shadow-xs">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setMode('Shop_Vendor');
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] text-xs font-semibold font-sans transition-all cursor-pointer select-none min-h-[38px]',
                mode === 'Shop_Vendor'
                  ? 'bg-white dark:bg-[#282828] text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#222222]'
              )}
            >
              <Store className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>Shop Expense</span>
              <kbd className="hidden sm:inline text-[9px] font-mono opacity-60 font-normal">Alt+1</kbd>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setMode('Staff_Split');
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] text-xs font-semibold font-sans transition-all cursor-pointer select-none min-h-[38px]',
                mode === 'Staff_Split'
                  ? 'bg-white dark:bg-[#282828] text-emerald-600 dark:text-[#3ecf8e] shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#222222]'
              )}
            >
              <Users className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>Staff Expense</span>
              <kbd className="hidden sm:inline text-[9px] font-mono opacity-60 font-normal">Alt+2</kbd>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setMode('Courier');
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] text-xs font-semibold font-sans transition-all cursor-pointer select-none min-h-[38px]',
                mode === 'Courier'
                  ? 'bg-white dark:bg-[#282828] text-amber-600 dark:text-amber-400 shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#222222]'
              )}
            >
              <Truck className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>Courier & Parcel</span>
              <kbd className="hidden sm:inline text-[9px] font-mono opacity-60 font-normal">Alt+3</kbd>
            </button>
          </div>

          {/* CARD 1: TRANSACTION & BASIC INFO (Showroom, Date, Voucher #, Amount, Payment Method) */}
          <div className="p-3.5 sm:p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-xs space-y-3.5">
            {/* Top Sub-Row: Showroom, Date, Bill Number */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Showroom / Branch */}
              <div className="space-y-1 min-w-0">
                <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                  Showroom / Branch *
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
                    Date of Payment *
                  </label>
                  {isBackdated && (
                    <span
                      className={cn(
                        'text-[10px] font-mono flex items-center gap-1 font-medium',
                        allowBackdated
                          ? 'text-emerald-600 dark:text-[#3ecf8e]'
                          : isBackdateRestricted
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-zinc-400'
                      )}
                    >
                      {allowBackdated ? (
                        <>
                          <Zap className="w-2.5 h-2.5 text-[#3ecf8e]" />
                          <span>F12 Backdate Mode</span>
                        </>
                      ) : isBackdateRestricted ? (
                        <>
                          <ShieldAlert className="w-2.5 h-2.5 text-amber-500" />
                          <span>Past Date</span>
                        </>
                      ) : (
                        <span>Past Date</span>
                      )}
                    </span>
                  )}
                </div>
                <DatePicker
                  value={paymentDate}
                  onChange={setPaymentDate}
                  placeholder="Select date..."
                />
                {isBackdateBlocked && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-sans leading-tight">
                    ⚠️ Backdated entry is locked for cashiers.
                  </p>
                )}
              </div>

              {/* Voucher Number */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                    Bill / Receipt No. *
                  </label>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-[#3ecf8e]">
                    Auto
                  </span>
                </div>
                <div className="relative flex items-center rounded-[6px] bg-slate-50/60 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e]/30 overflow-hidden min-h-[38px] shadow-xs">
                  <span className="px-2.5 py-2 bg-slate-100 dark:bg-[#1c1c1c] text-slate-600 dark:text-[#A1A1A1] font-mono font-medium text-xs select-none shrink-0 border-r border-slate-200 dark:border-[#262626]">
                    {currBranch.branch_code}-
                  </span>
                  <input
                    type="text"
                    value={voucherDigits}
                    onChange={(e) => setVoucherDigits(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''))}
                    placeholder="00001"
                    className="w-full bg-transparent px-3 py-1.5 text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Sub-Row: Amount (₹) + Paid From Till */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#222222] grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
              {/* Left 7 cols: Amount Input + Chips + Words */}
              <div className="md:col-span-7 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="block text-xs font-medium text-slate-800 dark:text-[#EDEDED]">
                    Expense Amount (₹) *
                  </label>

                  {mode !== 'Staff_Split' && !(mode === 'Shop_Vendor' && isMultiVendor) && (
                    <div className="flex items-center gap-1">
                      {AMOUNT_INCREMENTS.map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => handleAddAmount(inc)}
                          className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] active:bg-[#3ecf8e]/20 border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono font-medium text-slate-700 dark:text-zinc-300 transition-all cursor-pointer shadow-2xs"
                        >
                          +₹{inc >= 1000 ? `${inc / 1000}k` : inc}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative flex items-center rounded-[8px] bg-slate-50/60 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e]/30 shadow-xs overflow-hidden min-h-[44px]">
                  <span className="pl-3.5 pr-1.5 text-lg font-mono text-slate-400 dark:text-zinc-500 font-medium select-none">
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
                    className="w-full bg-transparent pl-1 pr-3.5 py-2 text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none disabled:opacity-85 disabled:cursor-not-allowed"
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
                  Paid From (Payment Till) *
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setPaymentMethod('Online_UPI');
                    }}
                    className={cn(
                      'p-2.5 rounded-[8px] border text-left flex flex-col justify-between cursor-pointer transition-all shadow-xs min-h-[52px]',
                      paymentMethod === 'Online_UPI'
                        ? 'bg-sky-500/10 border-sky-400 text-slate-900 dark:text-white ring-1 ring-sky-400/30'
                        : 'bg-slate-50/50 dark:bg-[#121212] border-slate-200 dark:border-[#262626] text-slate-700 dark:text-[#A1A1A1] hover:bg-slate-100/60 dark:hover:bg-[#1c1c1c]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-sky-500" />
                        <span>Bank UPI</span>
                      </span>
                      {paymentMethod === 'Online_UPI' && <Check className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />}
                    </div>
                    <span className="text-[10px] font-mono text-sky-500 dark:text-sky-400 tabular-nums font-semibold mt-0.5">
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
                      'p-2.5 rounded-[8px] border text-left flex flex-col justify-between cursor-pointer transition-all shadow-xs min-h-[52px]',
                      paymentMethod === 'Physical_Cash'
                        ? 'bg-emerald-500/10 border-[#3ecf8e] text-slate-900 dark:text-white ring-1 ring-[#3ecf8e]/30'
                        : 'bg-slate-50/50 dark:bg-[#121212] border-slate-200 dark:border-[#262626] text-slate-700 dark:text-[#A1A1A1] hover:bg-slate-100/60 dark:hover:bg-[#1c1c1c]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                        <span>Cash Box</span>
                      </span>
                      {paymentMethod === 'Physical_Cash' && <Check className="w-3.5 h-3.5 text-[#3ecf8e] stroke-[2.5]" />}
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-[#3ecf8e] tabular-nums font-semibold mt-0.5">
                      Cash: {formatINR(cashBalance)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: EXPENSE DETAILS & REMARKS */}
          <div className="p-3.5 sm:p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-xs space-y-3.5">
            {/* Requested / Ordered By (Floor Staff Member) */}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                  Requested / Ordered By (Floor Staff Member - Optional)
                </label>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-sans">
                  Who ordered this expense
                </span>
              </div>
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
                placeholder="Search staff who requested this (e.g. Salesperson, Floor Manager)..."
                allowCustom={true}
              />
            </div>

            {/* Mode-Specific Dynamic Inputs */}
            {mode === 'Shop_Vendor' && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-[#222222]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-[#EDEDED] font-sans">
                    Vendor &amp; Category Details
                  </span>

                  {/* Multi-Vendor / Single Vendor Mode Toggle */}
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
                      Single Vendor Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setIsMultiVendor(true);
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-[4px] transition-all cursor-pointer select-none flex items-center gap-1',
                        isMultiVendor
                          ? 'bg-emerald-500/15 dark:bg-[#3ecf8e]/15 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/30 dark:border-[#3ecf8e]/30 shadow-2xs font-semibold'
                          : 'text-slate-500 dark:text-[#888888] hover:text-slate-800 dark:hover:text-[#dddddd]'
                      )}
                    >
                      <span>Multi-Vendor Breakdown</span>
                      <span className="px-1 py-0.2 rounded text-[9px] bg-[#3ecf8e] text-zinc-900 font-bold">New</span>
                    </button>
                  </div>
                </div>

                {!isMultiVendor ? (
                  <>
                    {/* Row 1: Who was paid & Bill Number */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Who was paid? (Shop or Person Name) *
                        </label>
                        <input
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="e.g. Ramesh Tea Stall, Sharma Electrician"
                          className="w-full rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#121212] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-sans placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] dark:focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 min-h-[38px] shadow-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Shop Bill / Receipt No. (Optional)
                        </label>
                        <input
                          type="text"
                          value={billNumber}
                          onChange={(e) => setBillNumber(e.target.value)}
                          placeholder="e.g. Bill #104 or Cash Slip"
                          className="w-full rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#121212] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] dark:focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 min-h-[38px] shadow-xs"
                        />
                      </div>
                    </div>

                    {/* Row 2: Category & Department */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                          Expense Category *
                        </label>
                        <SearchableSelect
                          value={categoryName}
                          onChange={setCategoryName}
                          options={categories.map((c) => ({
                            value: c.category_name,
                            label: c.category_name,
                          }))}
                          placeholder="e.g. Tea & Snacks, Electricity, Repairs..."
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
                          placeholder="e.g. Sales Counter, Housekeeping..."
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
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-[#EDEDED] font-sans">
                    Staff Members Split
                  </span>
                </div>

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
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-[#EDEDED] font-sans">
                    Courier Delivery Details
                  </span>
                </div>

                {/* Row 1: Courier Company & Tracking Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Courier Company *
                    </label>
                    <SearchableSelect
                      value={courierCompany}
                      onChange={setCourierCompany}
                      options={couriers.map((c) => ({
                        value: c.partner_name,
                        label: c.partner_name,
                      }))}
                      placeholder="Select courier (Maruti, DTDC, Trackon)..."
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Delivery Agent Name / Tracking No. *
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. Ramesh Bhai (Agent) / AWB Track No."
                      className="w-full rounded-[6px] border border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#121212] px-3.5 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] dark:focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 min-h-[38px] shadow-xs"
                    />
                  </div>
                </div>

                {/* Row 2: Category & Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Expense Category (Optional)
                    </label>
                    <SearchableSelect
                      value={categoryName}
                      onChange={setCategoryName}
                      options={categories.map((c) => ({
                        value: c.category_name,
                        label: c.category_name,
                      }))}
                      placeholder="Select category (optional)..."
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                      Department (Optional)
                    </label>
                    <SearchableSelect
                      value={departmentName}
                      onChange={setDepartmentName}
                      options={departments.map((d) => ({
                        value: d.department_name,
                        label: d.department_name,
                      }))}
                      placeholder="Select department (optional)..."
                      allowCustom={true}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes / Remarks Integrated Directly in Card 2 */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#222222] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#EDEDED]">
                    Notes / Remarks *
                  </label>
                </div>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-[4px] border font-mono text-[10.5px] font-medium transition-colors',
                    remarks.length >= 240
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold'
                      : remarks.length >= 3
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] border-emerald-500/20'
                      : 'bg-slate-100 dark:bg-[#202020] text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-[#2e2e2e]'
                  )}
                >
                  {remarks.length} / 255
                </span>
              </div>

              <textarea
                rows={3}
                maxLength={255}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value.slice(0, 255))}
                placeholder="Enter detailed reason, item particulars, or payment context (e.g. Evening tea & snacks for 12 sales staff during festive rush)..."
                className="w-full rounded-[8px] border border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#121212] p-2.5 text-slate-900 dark:text-white text-xs font-sans placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] dark:focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 resize-none shadow-xs transition-colors leading-relaxed"
              />
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-sans">
                Max 255 characters. Minimum 3 characters required.
              </p>
            </div>
          </div>

          {/* CARD 3: ATTACH PHOTO OF BILL / CASH RECEIPT */}
          <div className="p-3.5 sm:p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-[#EDEDED] font-sans block">
                  Attach Photo of Bill / Receipt
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans mt-0.5 block">
                  Upload receipt or slip (up to 4 photos)
                </span>
              </div>

              <span className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] text-slate-600 dark:text-zinc-400 text-[10px] font-mono border border-slate-200 dark:border-[#2e2e2e] shrink-0">
                {photoUrls.length} of 4 attached
              </span>
            </div>

            <BillUploader photoUrls={photoUrls} onChange={setPhotoUrls} maxPhotos={4} />
          </div>

          {/* 7. ADVANCED & SIMPLE SETTLEMENT DOCK */}
          <div className="p-3.5 sm:p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Total Disbursal + Payment Till Source Badge */}
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[10.5px] text-slate-400 dark:text-zinc-500 font-sans block font-medium">
                  Total Disbursal
                </span>
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
                  {formatINR(finalCalculatedAmount)}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-[6px] text-xs font-mono font-medium bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#2e2e2e] self-center">
                {paymentMethod === 'Physical_Cash' ? 'Cash Box' : 'Bank UPI'}
              </span>
            </div>

            {/* Right: Actions Cluster */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={handleResetForm}
                className="h-10 w-10 flex items-center justify-center rounded-[8px] border border-slate-200 dark:border-[#282828] bg-slate-50 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] transition-colors cursor-pointer shadow-2xs shrink-0"
                title="Reset all form fields"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setActivePage('dashboard')}
                className="px-3.5 py-2 rounded-[6px] border border-slate-200 dark:border-[#282828] bg-slate-50 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] font-sans text-xs cursor-pointer transition-colors font-medium min-h-[38px] flex items-center justify-center shadow-2xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  submitting ||
                  (isInsufficientBalance && !allowNegative) ||
                  (isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer')
                }
                className={cn(
                  'flex-1 sm:flex-none min-h-[40px] px-5 sm:px-6 rounded-[8px] font-sans font-semibold text-xs sm:text-sm tracking-tight transition-all cursor-pointer select-none flex items-center justify-center gap-2 shadow-xs',
                  isInsufficientBalance && !allowNegative
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900/60 cursor-not-allowed'
                    : isInsufficientBalance && allowNegative
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold'
                    : isPeriodLocked && !allowLockedPeriod && user?.role_code !== 'Super_Admin' && user?.role_code !== 'Developer'
                    ? 'bg-amber-600 text-white cursor-not-allowed opacity-80'
                    : 'bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] shadow-emerald-500/20 shadow-md'
                )}
              >
                <Zap className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                <span>
                  {submitting
                    ? 'Saving...'
                    : isInsufficientBalance && !allowNegative
                    ? user?.role_code === 'Cashier'
                      ? 'Insufficient Cash: Contact Store Manager'
                      : 'Insufficient Cash: Add Cash First'
                    : isInsufficientBalance && allowNegative
                    ? 'Save & Pay (Overdraft Override)'
                    : 'Save & Pay Expense (F2)'}
                </span>
              </button>
            </div>
          </div>
        </form>

        {/* QUICK CASH FLOAT IN-LINE TOP-UP SLIDE-OVER DRAWER (F6) */}
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
      </div>
    </div>
  );
};
