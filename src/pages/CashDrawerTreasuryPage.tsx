import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format as formatDateFns } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore } from '@/store/uiStore';
import { useVoucherStore } from '@/store/voucherStore';
import { supabase } from '@/lib/supabase';
import { erpService } from '@/lib/erpService';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatINR, numberToWordsINR, formatDate, cn, triggerHaptic } from '@/lib/utils';
import { useOverrideStore } from '@/store/overrideStore';
import { SafeDropDrawer } from '@/components/treasury/SafeDropDrawer';
import { DatePicker } from '@/components/ui/DatePicker';
import { MetricCard } from '@/components/ui/MetricCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AccessDeniedView } from '@/components/common/AccessDeniedView';
import {
  Wallet,
  Coins,
  CheckCircle2,
  AlertCircle,
  Building2,
  Lock,
  History,
  Check,
  Plus,
  Minus,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Search,
  Download,
  FileSpreadsheet,
  Code,
  Terminal,
  MoreVertical,
  ChevronDown,
  X,
  SlidersHorizontal,
  Calendar,
  Clock,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  LayoutList,
  Banknote,
  QrCode,
  User,
  Sparkles,
  FileText,
  Tag,
  Shield,
  RefreshCw,
  Eye,
  CheckCheck,
  CheckSquare,
  ExternalLink,
  ChevronRight,
  Filter,
  Copy,
  Printer,
  Trash2,
  ArrowDown,
  ArrowUp,
  Sliders,
} from 'lucide-react';
import { showToast } from '@/components/ui/ToastContainer';
import { useGsapContext } from '@/hooks/useGsap';
import { animateStaggerCards } from '@/lib/animations';

type DateFilter = 'this_month' | 'today' | 'yesterday' | 'week' | 'all' | 'custom';
type ScopeFilter = 'ALL' | 'INFLOW' | 'OUTFLOW' | 'Float_Topup' | 'Expense_Voucher' | 'Safe_Drop' | 'Adjustment';
type SortOption = 'newest' | 'oldest' | 'highest_amount' | 'lowest_amount';

interface DenomCount {
  [key: number]: number;
}

const ALL_DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

function parseLedgerNotes(remarks?: string) {
  if (!remarks) return { title: 'Cash Added to Drawer', chips: [], modeDetails: null };

  let title = remarks;
  const chips: string[] = [];
  let modeDetails: string | null = null;

  // Extract [Transfer Mode: ...]
  const modeMatch = remarks.match(/\[Transfer Mode:\s*([^\]]+)\]/i);
  if (modeMatch) {
    modeDetails = modeMatch[1].trim();
    title = title.replace(modeMatch[0], '').trim();
  }

  // Extract [Notes: ₹500×3, ...] or [₹100 x 15 = ₹1500 | ...]
  const notesMatch = remarks.match(/\[(?:Notes:\s*)?([^\]]+)\]/i);
  if (notesMatch) {
    const rawBreakdown = notesMatch[1];
    const parts = rawBreakdown.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
    parts.forEach((p) => {
      chips.push(p);
    });
    title = title.replace(notesMatch[0], '').trim();
  }

  if (!title) {
    title = 'Morning Opening Till Float';
  }

  return { title, chips, modeDetails };
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const CashDrawerTreasuryPage: React.FC = () => {
  const { user, getAllowedBranches, isBranchAllowed } = useAuthStore();
  const { branches, selectedBranchId, getActiveBranch } = useBranchStore();
  const { setActivePage } = useUIStore();

  // If cashier, block entire page
  if (user?.role_code === 'Cashier') {
    return (
      <AccessDeniedView
        title="Access Restricted"
        message="Cash Drawer & Treasury management is restricted to Store Managers and Super Admins."
        pageName="Cash & Bank"
      />
    );
  }

  const allowedBranches = getAllowedBranches(branches);
  const activeBranch = getActiveBranch();
  const initialBranch = (selectedBranchId && isBranchAllowed(selectedBranchId))
    ? selectedBranchId
    : (allowedBranches[0]?.branch_id || activeBranch.branch_id);

  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [entryDate, setEntryDate] = useState<string>(formatDateFns(new Date(), 'yyyy-MM-dd'));
  const [walletType, setWalletType] = useState<'Cash' | 'UPI'>('Cash');
  const [amount, setAmount] = useState<number | ''>('');
  const [transferMode, setTransferMode] = useState('');
  const [referenceNotes, setReferenceNotes] = useState('');

  const [currentCashBalance, setCurrentCashBalance] = useState(0);
  const [currentUpiBalance, setCurrentUpiBalance] = useState(0);
  const [allLedgerEntries, setAllLedgerEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Pro Enterprise Ledger View & Filter State
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_month');
  const [customDate, setCustomDate] = useState<string>(formatDateFns(new Date(), 'yyyy-MM-dd'));
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerWalletFilter, setLedgerWalletFilter] = useState<'ALL' | 'Cash' | 'UPI'>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [activeRowDropdownId, setActiveRowDropdownId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [viewLedgerEntry, setViewLedgerEntry] = useState<any | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Safe Drop Drawer State
  const [isSafeDropOpen, setIsSafeDropOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const hasAutoPurgedRef = useRef(false);

  const containerRef = useGsapContext(() => {
    animateStaggerCards(containerRef.current, '.stagger-card', 0.03);
  }, [selectedBranch]);

  useEffect(() => {
    setSelectedBranch(selectedBranchId || activeBranch.branch_id);
  }, [selectedBranchId, activeBranch.branch_id]);

  const isDeveloper = user?.role_code === 'Developer' || user?.role_code === 'Super_Admin';

  // Global keyboard shortcuts ('/' to search ledger, ESC to close popovers)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setActiveRowDropdownId(null);
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (
        activeRowDropdownId &&
        !(e.target as HTMLElement).closest(`[data-dropdown-id="${activeRowDropdownId}"]`)
      ) {
        setActiveRowDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeRowDropdownId]);

  const loadTreasuryData = async () => {
    setLoading(true);
    try {
      if (!hasAutoPurgedRef.current) {
        hasAutoPurgedRef.current = true;
        try {
          await erpService.purgeErroneousHistoricalRecords(selectedBranch);
        } catch (e) {
          console.warn('Auto purge historical records silent check:', e);
        }
      }

      const [wallet, ledger] = await Promise.all([
        erpService.getBranchWallet(selectedBranch),
        erpService.getWalletLedger(selectedBranch),
      ]);
      setCurrentCashBalance(wallet.cash_balance);
      setCurrentUpiBalance(wallet.upi_balance);
      setAllLedgerEntries(ledger || []);
    } catch (err) {
      console.warn('Error loading treasury data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTreasuryData();
    const handleUpdates = () => {
      loadTreasuryData();
    };
    window.addEventListener('asopalav:wallet-updated', handleUpdates);
    window.addEventListener('asopalav:ledger-updated', handleUpdates);
    return () => {
      window.removeEventListener('asopalav:wallet-updated', handleUpdates);
      window.removeEventListener('asopalav:ledger-updated', handleUpdates);
    };
  }, [selectedBranch]);

  // Dynamically compute running balance for each transaction chronologically
  const entriesWithRunningBalance = useMemo(() => {
    const chronological = [...allLedgerEntries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let runningCash = 0;
    let runningUpi = 0;
    const balanceMap = new Map<string, { runningCash: number; runningUpi: number; runningCombined: number }>();

    chronological.forEach((entry) => {
      const credit = Number(entry.credit_amount) || 0;
      const debit = Number(entry.debit_amount) || 0;
      const isUpi = entry.wallet_type === 'UPI';

      if (isUpi) {
        runningUpi += credit - debit;
      } else {
        runningCash += credit - debit;
      }

      const key = entry.id || `${entry.created_at}-${entry.credit_amount}-${entry.debit_amount}`;
      balanceMap.set(key, {
        runningCash,
        runningUpi,
        runningCombined: runningCash + runningUpi,
      });
    });

    return balanceMap;
  }, [allLedgerEntries]);

  // Filtered allocations for Pro Enterprise Timeline / Feed & Full Table
  const filteredAllocations = useMemo(() => {
    let list = allLedgerEntries;

    if (scopeFilter === 'INFLOW') {
      list = list.filter((l) => (Number(l.credit_amount) || 0) > 0);
    } else if (scopeFilter === 'OUTFLOW') {
      list = list.filter((l) => (Number(l.debit_amount) || 0) > 0);
    } else if (scopeFilter !== 'ALL') {
      list = list.filter((l) => l.transaction_type === scopeFilter);
    }

    if (ledgerWalletFilter !== 'ALL') {
      list = list.filter((l) => l.wallet_type === ledgerWalletFilter);
    }

    const now = new Date();
    if (dateFilter === 'this_month') {
      const monthStr = formatDateFns(now, 'yyyy-MM');
      list = list.filter((l) => (l.created_at || '').slice(0, 7) === monthStr);
    } else if (dateFilter === 'today') {
      const todayStr = formatDateFns(now, 'yyyy-MM-dd');
      list = list.filter((l) => (l.created_at || '').slice(0, 10) === todayStr);
    } else if (dateFilter === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterdayStr = formatDateFns(y, 'yyyy-MM-dd');
      list = list.filter((l) => (l.created_at || '').slice(0, 10) === yesterdayStr);
    } else if (dateFilter === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      list = list.filter((l) => {
        if (!l.created_at) return false;
        const entryDate = new Date(l.created_at);
        return entryDate >= sevenDaysAgo && entryDate <= now;
      });
    } else if (dateFilter === 'custom' && customDate) {
      list = list.filter((l) => (l.created_at || '').slice(0, 10) === customDate);
    }

    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(
        (l) =>
          (l.remarks && l.remarks.toLowerCase().includes(q)) ||
          (l.cashier_name && l.cashier_name.toLowerCase().includes(q)) ||
          (l.authorized_by_name && l.authorized_by_name.toLowerCase().includes(q)) ||
          (l.id && String(l.id).toLowerCase().includes(q)) ||
          (l.reference_number && String(l.reference_number).toLowerCase().includes(q)) ||
          (l.transaction_type && String(l.transaction_type).toLowerCase().includes(q)) ||
          (l.wallet_type && String(l.wallet_type).toLowerCase().includes(q)) ||
          String(l.credit_amount || l.debit_amount || '').includes(q)
      );
    }

    // Sort order
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'highest_amount') {
        const aAmt = Math.max(Number(a.credit_amount) || 0, Number(a.debit_amount) || 0);
        const bAmt = Math.max(Number(b.credit_amount) || 0, Number(b.debit_amount) || 0);
        return bAmt - aAmt;
      }
      if (sortBy === 'lowest_amount') {
        const aAmt = Math.max(Number(a.credit_amount) || 0, Number(a.debit_amount) || 0);
        const bAmt = Math.max(Number(b.credit_amount) || 0, Number(b.debit_amount) || 0);
        return aAmt - bAmt;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [allLedgerEntries, scopeFilter, ledgerWalletFilter, dateFilter, customDate, ledgerSearch, sortBy]);

  // Comprehensive Treasury Flow Summary (Top-ups, Inflow, Outflow, Net Position)
  const treasurySummary = useMemo(() => {
    let totalCashIn = 0;
    let totalCashOut = 0;
    let totalUpiIn = 0;
    let totalUpiOut = 0;
    let totalFloatTopups = 0;
    let topupCount = 0;
    let cashTopupCount = 0;
    let upiTopupCount = 0;
    let totalSafeDrops = 0;
    let safeDropCount = 0;
    let totalExpenses = 0;
    let expenseCount = 0;
    let cashExpenseCount = 0;
    let upiExpenseCount = 0;
    let totalAdjustments = 0;
    let adjustmentCount = 0;
    let creditCount = 0;
    let debitCount = 0;

    allLedgerEntries.forEach((entry) => {
      const credit = Number(entry.credit_amount) || 0;
      const debit = Number(entry.debit_amount) || 0;
      const isCash = entry.wallet_type === 'Cash' || !entry.wallet_type;
      const isUpi = entry.wallet_type === 'UPI';

      if (credit > 0) {
        creditCount++;
        if (isCash) {
          totalCashIn += credit;
          cashTopupCount++;
        }
        if (isUpi) {
          totalUpiIn += credit;
          upiTopupCount++;
        }
      }
      if (debit > 0) {
        debitCount++;
        if (isCash) {
          totalCashOut += debit;
          if (entry.transaction_type === 'Expense_Voucher') cashExpenseCount++;
        }
        if (isUpi) {
          totalUpiOut += debit;
          if (entry.transaction_type === 'Expense_Voucher') upiExpenseCount++;
        }
      }

      if (entry.transaction_type === 'Float_Topup' || (credit > 0 && !entry.transaction_type)) {
        topupCount++;
        totalFloatTopups += credit;
      } else if (entry.transaction_type === 'Safe_Drop') {
        safeDropCount++;
        totalSafeDrops += debit;
      } else if (entry.transaction_type === 'Expense_Voucher') {
        expenseCount++;
        totalExpenses += debit;
      } else if (entry.transaction_type === 'Adjustment') {
        adjustmentCount++;
        totalAdjustments += (credit || debit);
      }
    });

    return {
      totalCashIn,
      totalCashOut,
      netCash: totalCashIn - totalCashOut,
      totalUpiIn,
      totalUpiOut,
      netUpi: totalUpiIn - totalUpiOut,
      totalMoneyIn: totalCashIn + totalUpiIn,
      totalMoneyOut: totalCashOut + totalUpiOut,
      netTotalFlow: totalCashIn + totalUpiIn - (totalCashOut + totalUpiOut),
      totalFloatTopups,
      topupCount,
      cashTopupCount,
      upiTopupCount,
      totalSafeDrops,
      safeDropCount,
      totalExpenses,
      expenseCount,
      cashExpenseCount,
      upiExpenseCount,
      totalAdjustments,
      adjustmentCount,
      creditCount,
      debitCount,
    };
  }, [allLedgerEntries]);

  const handleCopyRef = (refText: string) => {
    navigator.clipboard.writeText(refText);
    setCopiedRef(refText);
    triggerHaptic('light');
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const handleViewSlip = async (entry: any) => {
    triggerHaptic('selection');
    if (entry.transaction_type === 'Expense_Voucher' && entry.reference_number) {
      const vStore = useVoucherStore.getState();
      const allCached = Object.values(vStore.vouchers).flat();
      const match = allCached.find((v) => v.voucher_number === entry.reference_number);
      if (match) {
        useUIStore.getState().setActiveDrawerVoucher(match);
        return;
      }
      try {
        const { data } = await supabase
          .from('expense_vouchers')
          .select('*')
          .eq('voucher_number', entry.reference_number)
          .maybeSingle();
        if (data) {
          useUIStore.getState().setActiveDrawerVoucher(data);
          return;
        }
      } catch {
        // Fallback to entry slip
      }
    }
    setViewLedgerEntry(entry);
  };

  const [purgingId, setPurgingId] = useState<string | null>(null);

  const handlePurgeEntry = async (entry: any) => {
    if (!window.confirm(`Are you sure you want to delete this ledger record (${entry.reference_number || 'TRZ'})? This will permanently remove it from the audit ledger.`)) {
      return;
    }
    try {
      const entryKey = entry.id || entry.reference_number;
      setPurgingId(entryKey);
      const userName = `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim();
      const userRole = user?.role_code || 'Super_Admin';
      await erpService.deleteLedgerEntry({
        entryId: entryKey,
        branchId: selectedBranch,
        userName,
        userRole,
        reason: 'Super Admin duplicate / error purge',
        adjustWalletBalance: true,
      });
      showToast({
        type: 'success',
        title: 'Entry Purged',
        message: `Ledger entry ${entry.reference_number || ''} was removed and wallet balance recalculated.`,
      });
      loadTreasuryData();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Purge Failed',
        message: e?.message || 'Could not delete ledger entry.',
      });
    } finally {
      setPurgingId(null);
    }
  };

  const handleCleanDuplicates = async () => {
    try {
      const userName = `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim();
      const userRole = user?.role_code || 'Super_Admin';
      const res = await erpService.cleanDuplicateLedgerEntries(selectedBranch, userName, userRole);
      if (res.removedCount > 0) {
        showToast({
          type: 'success',
          title: 'Duplicate Audit Complete',
          message: `Purged ${res.removedCount} duplicate record(s). Ledger is now 100% clean.`,
        });
        loadTreasuryData();
      } else {
        showToast({
          type: 'info',
          title: 'Ledger Clean',
          message: 'Zero duplicate records found. Your ledger is 100% balanced.',
        });
      }
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Duplicate Cleanup Error',
        message: e?.message || 'Failed to scan and clean duplicates.',
      });
    }
  };

  const handlePurgeHistoricalRecords = async () => {
    if (
      !window.confirm(
        'This will purge any leftover September test top-ups (FLT-856048 & FLT-984105) across database tables, local caches, and reconcile till wallet balance to exact October 1st ledger truth. Proceed?'
      )
    ) {
      return;
    }
    try {
      const res = await erpService.purgeErroneousHistoricalRecords(selectedBranch);
      showToast({
        type: 'success',
        title: 'Historical Records Purged',
        message: res.message,
      });
      loadTreasuryData();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Purge Failed',
        message: e?.message || 'Failed to purge historical test records.',
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredAllocations.length / pageSize));
  const paginatedAllocations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAllocations.slice(start, start + pageSize);
  }, [filteredAllocations, currentPage, pageSize]);

  const handleExportLedger = (format: 'csv' | 'json' | 'sql') => {
    setIsExportMenuOpen(false);
    const dateStr = new Date().toISOString().slice(0, 10);
    const esc = (val?: string | null) => (val ? `'${val.replace(/'/g, "''")}'` : 'NULL');

    if (format === 'json') {
      downloadBlob(`asopalav_treasury_ledger_${dateStr}.json`, JSON.stringify(filteredAllocations, null, 2), 'application/json');
    } else if (format === 'csv') {
      const headers = ['Record ID', 'Date & Time', 'Credit Amount', 'Wallet Type', 'Remarks', 'Cashier', 'Authorized By'];
      const rows = filteredAllocations.map((l) => [
        l.id,
        l.created_at,
        l.credit_amount,
        l.wallet_type,
        `"${(l.remarks || '').replace(/"/g, '""')}"`,
        l.cashier_name || '',
        l.authorized_by_name || '',
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      downloadBlob(`asopalav_treasury_ledger_${dateStr}.csv`, csv, 'text/csv');
    } else if (format === 'sql') {
      const sql = filteredAllocations
        .map(
          (l) =>
            `INSERT INTO wallet_ledgers (id, branch_id, transaction_type, wallet_type, credit_amount, remarks, cashier_name, authorized_by_name, created_at) VALUES (${esc(l.id)}, ${esc(l.branch_id)}, '${l.transaction_type || 'Float_Topup'}', ${esc(l.wallet_type)}, ${Number(l.credit_amount) || 0}, ${esc(l.remarks)}, ${esc(l.cashier_name)}, ${esc(l.authorized_by_name)}, ${esc(l.created_at)});`
        )
        .join('\n');
      downloadBlob(`asopalav_treasury_ledger_${dateStr}.sql`, sql, 'text/plain');
    }
  };

  const handleResetForm = () => {
    triggerHaptic('light');
    setAmount('');
    setReferenceNotes('');
    setTransferMode('');
    setEntryDate(formatDateFns(new Date(), 'yyyy-MM-dd'));
    setFeedback(null);
  };

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const amountToAdd = Number(amount) || 0;

    if (amountToAdd <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid amount greater than ₹0.' });
      return;
    }

    setIsPreviewOpen(true);
  };

  const handleConfirmSubmit = async () => {
    const amountToAdd = Number(amount) || 0;
    if (amountToAdd <= 0) return;

    setSubmitting(true);
    setIsPreviewOpen(false);
    try {
      const isHistorical = entryDate !== formatDateFns(new Date(), 'yyyy-MM-dd');
      const dateTag = isHistorical ? ` [Date: ${entryDate}]` : '';
      const defaultNote = walletType === 'Cash' ? 'Cash Box Inflow' : 'Bank UPI Inflow';
      const noteContent = referenceNotes.trim() || defaultNote;
      const modeTag = transferMode ? ` [Transfer Mode: ${transferMode}]` : '';
      const fullRemarks = `${noteContent}${modeTag}${dateTag}`.trim();

      const userName = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();
      const authName = `${user?.first_name || 'Store'} ${user?.last_name || 'Manager'}`.trim();

      await erpService.createFloatTopup({
        branchId: selectedBranch,
        branchCode: activeBranch.branch_code,
        walletType,
        amount: amountToAdd,
        referenceNotes: fullRemarks,
        receivedByName: userName,
        authorizedByName: authName,
        createdAt: isHistorical ? new Date(`${entryDate}T12:00:00`).toISOString() : undefined,
      });

      triggerHaptic('heavy');
      setFeedback({
        type: 'success',
        message: `Successfully added ${formatINR(amountToAdd)} ${walletType === 'Cash' ? 'Cash' : 'Bank UPI'}!`,
      });

      setAmount('');
      setReferenceNotes('');
      setEntryDate(formatDateFns(new Date(), 'yyyy-MM-dd'));
      loadTreasuryData();
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    } catch (err: any) {
      console.error('Error adding float:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to add float.' });
    } finally {
      setSubmitting(false);
    }
  };

  const { isCeilingExceededAllowed } = useOverrideStore();
  const safeDropExceeded = currentCashBalance > 50000 && !isCeilingExceededAllowed();

  return (
    <div ref={containerRef} className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Cash & Bank Header */}
      <div className="relative z-30 px-4 lg:px-6 py-3.5 border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title, Status Badges & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#3ecf8e]" />
                <span>Cash & Bank</span>
              </h1>
              <span className="px-2 py-0.5 rounded-[4px] text-[10px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                {filteredAllocations.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
              Manage cash in box, add float, and view history.
            </p>
          </div>

          {/* Right Layer: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setIsSafeDropOpen(true);
              }}
              className="h-8 px-3 py-1.5 rounded-[6px] border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Move excess cash from box to showroom safe"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Move to Safe</span>
            </button>

            {(isDeveloper || user?.role_code === 'Super_Admin' || user?.role_code === 'Store_Manager') && (
              <button
                type="button"
                onClick={handleCleanDuplicates}
                className="h-8 px-3 py-1.5 rounded-[6px] border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Scan and purge any duplicate ledger records"
              >
                <Shield className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                <span>Clean Duplicates</span>
              </button>
            )}

            {(isDeveloper || user?.role_code === 'Super_Admin') && (
              <button
                type="button"
                onClick={handlePurgeHistoricalRecords}
                className="h-8 px-3 py-1.5 rounded-[6px] border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Purge September test records and reconcile wallet to Oct 1st ledger"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                <span>Purge Test Records</span>
              </button>
            )}

            <button
              type="button"
              onClick={loadTreasuryData}
              disabled={loading}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] transition-all cursor-pointer shadow-2xs"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[#3ecf8e]")} />
            </button>

            {/* Export Menu */}
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="h-8 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-[#707070]" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-44 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] rounded-[6px] shadow-2xl p-1 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => handleExportLedger('csv')}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#222222] rounded-[4px] flex items-center gap-2 cursor-pointer font-mono transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                    <span>CSV format</span>
                  </button>
                  {isDeveloper && (
                    <button
                      type="button"
                      onClick={() => handleExportLedger('json')}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#222222] rounded-[4px] flex items-center gap-2 cursor-pointer font-mono transition-colors"
                    >
                      <Code className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>JSON format</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Studio Content Area */}
      <div className="px-4 lg:px-6 py-4 space-y-4 flex-1">
        {/* Tier 2: Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-[12px] border border-slate-200 dark:border-[#242424] bg-slate-50/70 dark:bg-[#18181a]/70 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                placeholder="Search history..."
                className="w-full h-10 min-h-[40px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-8 pr-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#737373] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 transition-colors font-sans shadow-2xs"
              />
              {ledgerSearch ? (
                <button
                  type="button"
                  onClick={() => setLedgerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#737373] hover:text-slate-900 dark:hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {/* Scope / Activity Filter */}
            <div className="w-36">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: 'All Activity' },
                  { value: 'Float_Topup', label: 'Top-ups Only' },
                  { value: 'Cash', label: 'Cash Only' },
                  { value: 'UPI', label: 'UPI Only' },
                ]}
                value={ledgerWalletFilter}
                onChange={(val) => setLedgerWalletFilter(val as any)}
                placeholder="All Activity"
                searchPlaceholder="Search activity..."
                allowCustom={false}
              />
            </div>

            {/* Date Range Selector */}
            <div className="w-36">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'this_month', label: 'This Month' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'week', label: 'Last 7 Days' },
                  { value: 'all', label: 'All Time' },
                  { value: 'custom', label: 'Specific Date...' },
                ]}
                value={dateFilter}
                onChange={(val) => {
                  setDateFilter(val as DateFilter);
                }}
                placeholder="Date range"
                searchPlaceholder="Search date..."
                allowCustom={false}
              />
            </div>

            {/* Direct DatePicker for Specific Date selection */}
            {dateFilter === 'custom' && (
              <div className="w-40 animate-in fade-in">
                <DatePicker
                  value={customDate}
                  onChange={(val) => setCustomDate(val)}
                  allowPastDatesOverride={true}
                  placeholder="Pick date..."
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Branch Selector */}
          <div className="w-full sm:w-64">
            <SearchableSelect
              size="sm"
              value={selectedBranch}
              onChange={setSelectedBranch}
              options={allowedBranches.map((b) => ({
                value: b.branch_id,
                label: b.branch_code,
                sublabel: b.branch_name.replace(/^Asopalav\s*-\s*/i, ''),
              }))}
              placeholder="Select branch..."
            />
          </div>
        </div>

      {/* Safe Deposit Alert Banner */}
      {safeDropExceeded && (
        <div className="p-3.5 rounded-[12px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <strong className="block font-medium text-amber-800 dark:text-amber-300">Move Cash to Safe (Cash is High)</strong>
              <span className="text-[11px] text-amber-700 dark:text-amber-200/80">
                Cash in box ({formatINR(currentCashBalance)}) is over ₹50,000. Please move extra cash to the safe.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsSafeDropOpen(true);
            }}
            className="h-8 px-3.5 py-1.5 rounded-[6px] bg-amber-500 hover:bg-amber-400 text-[#171717] font-medium text-xs font-sans flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
            <span>Move to Safe ({formatINR(Math.max(0, currentCashBalance - 40000))})</span>
          </button>
        </div>
      )}

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <MetricCard
          label="Cash in Box"
          value={formatINR(currentCashBalance)}
          subValue="Cash notes in till"
          statusDotColor="#3ecf8e"
          icon={Wallet}
        />

        <MetricCard
          label="Bank UPI Balance"
          value={formatINR(currentUpiBalance)}
          subValue="Shop UPI balance"
          statusDotColor="#38bdf8"
          icon={Building2}
        />

        <MetricCard
          label="Total Available"
          value={formatINR(currentCashBalance + currentUpiBalance)}
          subValue="Cash + UPI combined"
          statusDotColor="#3ecf8e"
          badge="READY"
          badgeColor="emerald"
          icon={Coins}
        />
      </div>

      {/* 3. Main Dual Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Add Cash Form (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <form onSubmit={handleOpenPreview} className="stagger-card p-4 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-[#242424] gap-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#3ecf8e]" />
                <h2 className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                  Add Cash / UPI
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-[#242424]">
                  <button
                    type="button"
                    onClick={() => setWalletType('Cash')}
                    className={cn(
                      'px-3 py-1 rounded-[4px] text-xs font-sans transition-all cursor-pointer font-medium',
                      walletType === 'Cash'
                        ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white font-medium border border-slate-200 dark:border-[#383838] shadow-xs'
                        : 'text-slate-500 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white border border-transparent'
                    )}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletType('UPI')}
                    className={cn(
                      'px-3 py-1 rounded-[4px] text-xs font-sans transition-all cursor-pointer font-medium',
                      walletType === 'UPI'
                        ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white font-medium border border-slate-200 dark:border-[#383838] shadow-xs'
                        : 'text-slate-500 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white border border-transparent'
                    )}
                  >
                    Bank UPI
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleResetForm}
                  className="h-8 w-8 flex items-center justify-center rounded-[6px] text-slate-500 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-[#242424] transition-all cursor-pointer shadow-xs shrink-0"
                  title="Reset"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-1 font-sans">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-800 dark:text-[#e0e0e0]">
                  {walletType === 'Cash' ? 'Cash Amount (₹) *' : 'Bank / UPI Amount (₹) *'}
                </label>
                {Number(amount) > 0 && (
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-[#3ecf8e]">
                    {numberToWordsINR(Number(amount))}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-medium text-slate-400 dark:text-[#737373] text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || '')}
                  placeholder="0.00"
                  className="w-full h-10 min-h-[40px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-7 pr-3 text-sm font-mono font-medium tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>
            </div>

            {/* Transaction Date */}
            <div className="space-y-1 font-sans">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-800 dark:text-[#e0e0e0]">
                  Date
                </label>
                {entryDate !== formatDateFns(new Date(), 'yyyy-MM-dd') && (
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium">
                    Past Date ({entryDate})
                  </span>
                )}
              </div>
              <DatePicker
                value={entryDate}
                onChange={(val) => setEntryDate(val)}
                allowPastDatesOverride={isDeveloper || user?.role_code === 'Super_Admin' || user?.role_code === 'Store_Manager'}
                placeholder="Select date..."
              />
            </div>

            {/* Reference Remarks */}
            <div className="space-y-1 font-sans">
              <label className="block text-xs font-medium text-slate-800 dark:text-[#e0e0e0]">
                Reason / Note
              </label>
              <input
                type="text"
                value={referenceNotes}
                onChange={(e) => setReferenceNotes(e.target.value)}
                placeholder="e.g. Morning cash from safe / Owner topup"
                className="w-full h-10 min-h-[40px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
              />
            </div>

            {/* Feedback Alert */}
            {feedback && (
              <div
                className={`p-2.5 rounded-[6px] border font-sans text-xs font-medium ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-[#3ecf8e]/10 border-emerald-200 dark:border-[#3ecf8e]/30 text-emerald-700 dark:text-[#3ecf8e]'
                    : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400'
                }`}
              >
                {feedback.message}
              </div>
            )}

            {/* Action Footer */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200 dark:border-[#242424]">
              <div className="text-xs text-slate-600 dark:text-[#A1A1A1] font-mono flex items-center justify-between sm:justify-start gap-2">
                <span>Total:</span>
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums text-sm">
                  {formatINR(Number(amount) || 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="h-9 w-9 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#202020] text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#282828] transition-all cursor-pointer shadow-xs shrink-0"
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 sm:flex-none h-9 px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none shadow-xs"
                >
                  <Check className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>
                    {submitting
                      ? 'Processing...'
                      : walletType === 'Cash'
                      ? 'Review & Add Cash'
                      : 'Review & Add UPI'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Pure Timeline Feed View */}
        <div className="lg:col-span-5 space-y-3">
          <div className="stagger-card p-4 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] space-y-3 shadow-xs">
            {/* Header with Title & Count Badge */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-white/10">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <h2 className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                  Treasury Activity Feed
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-[#A1A1A1] border border-slate-200/80 dark:border-white/10">
                  {filteredAllocations.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 dark:text-[#737373]">
                <Clock className="w-3 h-3 text-[#3ecf8e]" />
                <span>Real-time Feed</span>
              </div>
            </div>

            {/* Quick Flow Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-[10px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] block font-sans">Cash Inflow:</span>
                <span className="text-emerald-600 dark:text-[#3ecf8e] font-semibold text-xs tabular-nums block mt-0.5">
                  +{formatINR(treasurySummary.totalCashIn)}
                </span>
              </div>
              <div className="p-2.5 rounded-[10px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] block font-sans">Cash Outflow:</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs tabular-nums block mt-0.5">
                  -{formatINR(treasurySummary.totalCashOut)}
                </span>
              </div>
              <div className="p-2.5 rounded-[10px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] block font-sans">UPI Inflow:</span>
                <span className="text-sky-600 dark:text-sky-400 font-semibold text-xs tabular-nums block mt-0.5">
                  +{formatINR(treasurySummary.totalUpiIn)}
                </span>
              </div>
              <div className="p-2.5 rounded-[10px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] text-slate-500 dark:text-[#707070] block font-sans">UPI Outflow:</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs tabular-nums block mt-0.5">
                  -{formatINR(treasurySummary.totalUpiOut)}
                </span>
              </div>
            </div>

            {/* TIMELINE FEED VIEW ONLY */}
            <div className="rounded-[8px] border border-slate-200 dark:border-[#242424] bg-slate-50 dark:bg-[#171717] p-3.5">
              <div className="relative pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-[#282828] space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
                {paginatedAllocations.map((entry, idx) => {
                  const parsed = parseLedgerNotes(entry.remarks);
                  const isCredit = Number(entry.credit_amount) > 0;
                  const amountValue = isCredit ? Number(entry.credit_amount) : Number(entry.debit_amount) || 0;
                  const isUpi = entry.wallet_type === 'UPI';

                  return (
                    <div key={entry.id || idx} className="relative group">
                      {/* Timeline Node Marker */}
                      <div
                        className={cn(
                          'absolute -left-6 top-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-transform group-hover:scale-110',
                          isUpi
                            ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-700 text-sky-600 dark:text-sky-400'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-[#3ecf8e]'
                        )}
                      >
                        {isUpi ? (
                          <QrCode className="w-2.5 h-2.5" />
                        ) : (
                          <Coins className="w-2.5 h-2.5" />
                        )}
                      </div>

                      {/* Timeline Card */}
                      <div className="p-3 rounded-[8px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] hover:border-slate-300 dark:hover:border-[#383838] transition-all space-y-2 shadow-xs">
                        {/* Top Row: Date/Time + Amount + Mode */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#A1A1A1] font-mono">
                            <Clock className="w-3 h-3 text-slate-400 dark:text-[#737373]" />
                            <span>{formatDate(entry.created_at, 'dd MMM, HH:mm')}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'font-mono font-medium text-xs tabular-nums',
                                isCredit
                                  ? 'text-emerald-600 dark:text-[#3ecf8e]'
                                  : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {isCredit ? '+' : '-'}{formatINR(amountValue)}
                            </span>

                            <span
                              className={cn(
                                'px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono font-medium border',
                                isUpi
                                  ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'
                                  : 'bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-200 dark:border-[#3ecf8e]/20'
                              )}
                            >
                              {entry.wallet_type || 'Cash'}
                            </span>
                          </div>
                        </div>

                        {/* Middle Row: Primary Remarks Title */}
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-900 dark:text-zinc-100 font-sans leading-snug">
                            {parsed.title}
                          </p>

                          {/* Transfer Mode Badge */}
                          {parsed.modeDetails && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[10px] font-mono text-sky-700 dark:text-sky-300">
                              <Building2 className="w-2.5 h-2.5" />
                              {parsed.modeDetails}
                            </span>
                          )}

                          {/* Denomination Breakdown Chips */}
                          {parsed.chips.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {parsed.chips.map((chip, cIdx) => (
                                <span
                                  key={cIdx}
                                  className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#333333] text-[10px] font-mono font-medium text-slate-700 dark:text-[#A1A1A1] tabular-nums"
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Bottom Row: Attribution & Actions */}
                        <div className="pt-1.5 border-t border-slate-100 dark:border-[#242424] flex items-center justify-between text-[11px] font-sans">
                          <div className="flex items-center gap-1 text-slate-500 dark:text-[#A1A1A1] truncate">
                            <User className="w-3 h-3 text-slate-400 dark:text-[#737373] shrink-0" />
                            <span className="truncate">
                              By: <strong className="font-medium text-slate-900 dark:text-white">{entry.cashier_name || 'Cashier'}</strong>
                            </span>
                            {entry.authorized_by_name && (
                              <span className="text-[10px] text-slate-400 dark:text-[#737373] truncate">
                                (Auth: {entry.authorized_by_name})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredAllocations.length === 0 && (
                  <div className="py-8">
                    <EmptyState
                      icon={History}
                      title="No treasury records found"
                      description="No cash float top-ups, safe drops, or wallet transactions found for the selected filter criteria."
                      actionLabel="Clear Filters"
                      onAction={() => {
                        setLedgerSearch('');
                        setLedgerWalletFilter('ALL');
                        setDateFilter('this_month');
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 10-Row Pagination Footer */}
            <div className="p-3 bg-slate-50 dark:bg-[#171717] border border-slate-200 dark:border-[#242424] rounded-[8px] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-600 dark:text-[#A1A1A1]">
                <span>
                  Page <strong className="text-slate-900 dark:text-white font-mono">{currentPage}</strong> of{' '}
                  <strong className="text-slate-900 dark:text-white font-mono">{totalPages}</strong> ({filteredAllocations.length} total)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-sans transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-sans transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Full Advanced Treasury Ledger & Accounting Audit Register Table */}
      <div className="stagger-card p-4 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] space-y-4 shadow-xs">
        {/* Table Header with Filters & Scope Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3ecf8e]" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                Full Treasury Ledger &amp; Cash / Bank Flow Audit Register
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-200 dark:border-[#3ecf8e]/20">
              {filteredAllocations.length} of {allLedgerEntries.length} records
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scope / Direction Filter Segmented Control */}
            <div className="inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 text-xs overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('ALL');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'ALL'
                    ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                All Flows ({allLedgerEntries.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('INFLOW');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'INFLOW'
                    ? 'bg-white dark:bg-[#282828] text-emerald-600 dark:text-[#3ecf8e] font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                + Inflows ({treasurySummary.creditCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('OUTFLOW');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'OUTFLOW'
                    ? 'bg-white dark:bg-[#282828] text-rose-600 dark:text-rose-400 font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                - Outflows ({treasurySummary.debitCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('Float_Topup');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'Float_Topup'
                    ? 'bg-white dark:bg-[#282828] text-emerald-600 dark:text-[#3ecf8e] font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                Top-ups ({treasurySummary.topupCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('Safe_Drop');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'Safe_Drop'
                    ? 'bg-white dark:bg-[#282828] text-amber-600 dark:text-amber-400 font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                Safe Drops ({treasurySummary.safeDropCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setScopeFilter('Expense_Voucher');
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-2 py-1 rounded-[4px] text-[11px] font-sans transition-all cursor-pointer whitespace-nowrap',
                  scopeFilter === 'Expense_Voucher'
                    ? 'bg-white dark:bg-[#282828] text-rose-600 dark:text-rose-400 font-medium shadow-xs'
                    : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                Expenses ({treasurySummary.expenseCount})
              </button>
            </div>

            {/* Sort Order Selector */}
            <div className="w-36">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption);
                  setCurrentPage(1);
                }}
                aria-label="Sort Order"
                className="w-full h-8 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] px-2 text-xs text-slate-700 dark:text-zinc-300 font-sans focus:outline-none focus:border-[#3ecf8e] cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest_amount">Highest Amount</option>
                <option value="lowest_amount">Lowest Amount</option>
              </select>
            </div>

            {/* Page Size Selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              aria-label="Rows per page"
              className="h-8 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] px-2 text-xs text-slate-700 dark:text-zinc-300 font-mono focus:outline-none focus:border-[#3ecf8e] cursor-pointer"
            >
              <option value={15}>15 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={250}>250 rows</option>
            </select>
          </div>
        </div>

        {/* 6-KPI Diagnostic Matrix Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-[10px] bg-emerald-500/5 border border-emerald-500/20">
            <span className="text-[10px] text-slate-500 dark:text-[#A1A1A1] block font-sans">Total Inflow (Credits):</span>
            <span className="text-emerald-600 dark:text-[#3ecf8e] font-semibold text-xs tabular-nums block mt-0.5">
              +{formatINR(treasurySummary.totalMoneyIn)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              Cash: {formatINR(treasurySummary.totalCashIn)} ({treasurySummary.cashTopupCount}) | UPI: {formatINR(treasurySummary.totalUpiIn)} ({treasurySummary.upiTopupCount})
            </span>
          </div>

          <div className="p-2.5 rounded-[10px] bg-rose-500/5 border border-rose-500/20">
            <span className="text-[10px] text-slate-500 dark:text-[#A1A1A1] block font-sans">Total Outflow (Debits):</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs tabular-nums block mt-0.5">
              -{formatINR(treasurySummary.totalMoneyOut)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              Cash: -{formatINR(treasurySummary.totalCashOut)} | UPI: -{formatINR(treasurySummary.totalUpiOut)}
            </span>
          </div>

          <div className="p-2.5 rounded-[10px] bg-emerald-500/5 border border-emerald-500/25">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-sans font-medium">Net Cash in Box:</span>
            <span className={cn(
              "font-semibold text-xs tabular-nums block mt-0.5",
              treasurySummary.netCash >= 0 ? "text-emerald-600 dark:text-[#3ecf8e]" : "text-rose-600 dark:text-rose-400"
            )}>
              {treasurySummary.netCash >= 0 ? '+' : ''}{formatINR(treasurySummary.netCash)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              In {formatINR(treasurySummary.totalCashIn)} − Out {formatINR(treasurySummary.totalCashOut)}
            </span>
          </div>

          <div className="p-2.5 rounded-[10px] bg-sky-500/5 border border-sky-500/25">
            <span className="text-[10px] text-sky-700 dark:text-sky-400 block font-sans font-medium">Net Bank UPI:</span>
            <span className={cn(
              "font-semibold text-xs tabular-nums block mt-0.5",
              treasurySummary.netUpi >= 0 ? "text-sky-600 dark:text-sky-400" : "text-rose-600 dark:text-rose-400"
            )}>
              {treasurySummary.netUpi >= 0 ? '+' : ''}{formatINR(treasurySummary.netUpi)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              In {formatINR(treasurySummary.totalUpiIn)} − Out {formatINR(treasurySummary.totalUpiOut)}
            </span>
          </div>

          <div className="p-2.5 rounded-[10px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10">
            <span className="text-[10px] text-slate-500 dark:text-[#A1A1A1] block font-sans">Float Top-ups:</span>
            <span className="text-slate-800 dark:text-[#EDEDED] font-semibold text-xs tabular-nums block mt-0.5">
              +{formatINR(treasurySummary.totalFloatTopups)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              {treasurySummary.cashTopupCount} Cash + {treasurySummary.upiTopupCount} UPI additions
            </span>
          </div>

          <div className="p-2.5 rounded-[10px] bg-purple-500/5 border border-purple-500/20">
            <span className="text-[10px] text-slate-500 dark:text-[#A1A1A1] block font-sans">Expense Vouchers:</span>
            <span className="text-purple-600 dark:text-purple-400 font-semibold text-xs tabular-nums block mt-0.5">
              -{formatINR(treasurySummary.totalExpenses)}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-sans block mt-0.5">
              {treasurySummary.expenseCount} vouchers ({treasurySummary.cashExpenseCount} Cash, {treasurySummary.upiExpenseCount} UPI)
            </span>
          </div>
        </div>

        {/* Full High-Density Accounting Audit Table */}
        <div className="border border-slate-200 dark:border-[#242424] rounded-[8px] overflow-hidden bg-white dark:bg-[#171717]">
          <div className="max-h-[620px] overflow-x-auto overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50 dark:bg-[#141414] text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Flow &amp; Scope</th>
                  <th className="py-2.5 px-3">Wallet Channel</th>
                  <th className="py-2.5 px-3 text-right">Inflow (+ Credit)</th>
                  <th className="py-2.5 px-3 text-right">Outflow (- Debit)</th>
                  <th className="py-2.5 px-3 text-right">Running Balance (₹)</th>
                  <th className="py-2.5 px-3">Particulars, Mode &amp; Denominations</th>
                  <th className="py-2.5 px-3">Cashier &amp; Approver</th>
                  <th className="py-2.5 px-3">Slip / Voucher #</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#242424]">
                {filteredAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 px-4 text-center">
                      <EmptyState
                        icon={History}
                        title="No treasury ledger records found"
                        description="No float top-ups, safe drops, or wallet transactions match the selected filter criteria."
                        actionLabel="Reset Search & Filters"
                        onAction={() => {
                          setLedgerSearch('');
                          setScopeFilter('ALL');
                          setLedgerWalletFilter('ALL');
                          setDateFilter('this_month');
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedAllocations.map((entry, idx) => {
                    const credit = Number(entry.credit_amount) || 0;
                    const debit = Number(entry.debit_amount) || 0;
                    const parsed = parseLedgerNotes(entry.remarks);
                    const isUpi = entry.wallet_type === 'UPI';
                    const isCredit = credit > 0;
                    const isSafeDrop = entry.transaction_type === 'Safe_Drop';
                    const isExpense = entry.transaction_type === 'Expense_Voucher';
                    const entryKey = entry.id || `${entry.created_at}-${entry.credit_amount}-${entry.debit_amount}`;
                    const runningBal = entriesWithRunningBalance.get(entryKey)?.runningCombined;
                    const rowSeq = (currentPage - 1) * pageSize + idx + 1;
                    const refCode = entry.reference_number || (entry.id ? String(entry.id).slice(0, 8).toUpperCase() : 'TRZ-AUTO');

                    return (
                      <tr
                        key={entryKey}
                        className="hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] transition-colors group"
                      >
                        {/* 1. Sequence Number */}
                        <td className="py-2.5 px-3 text-slate-400 dark:text-zinc-500 font-mono text-[11px] whitespace-nowrap">
                          #{rowSeq}
                        </td>

                        {/* 2. Date & Time */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-slate-800 dark:text-zinc-200 font-mono font-semibold">
                              {formatDate(entry.created_at, 'dd MMM yyyy')}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                              {formatDate(entry.created_at, 'HH:mm:ss')} ({formatDate(entry.created_at, 'EEE')})
                            </span>
                          </div>
                        </td>

                        {/* 3. Flow Direction & Scope Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {isCredit ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-200 dark:border-emerald-500/20 w-fit">
                                <ArrowDownLeft className="w-2.5 h-2.5 stroke-[2.5]" />
                                INFLOW (+)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 w-fit">
                                <ArrowUpRight className="w-2.5 h-2.5 stroke-[2.5]" />
                                OUTFLOW (-)
                              </span>
                            )}

                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans">
                              {isSafeDrop
                                ? 'Safe Vault Deposit'
                                : isExpense
                                ? 'Expense Voucher'
                                : entry.transaction_type === 'Float_Topup'
                                ? 'Cash Float Top-up'
                                : entry.transaction_type || 'Adjustment'}
                            </span>
                          </div>
                        </td>

                        {/* 4. Wallet Channel */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border font-medium',
                            isUpi
                              ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'
                              : 'bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-200 dark:border-[#3ecf8e]/20'
                          )}>
                            {isUpi ? <Building2 className="w-2.5 h-2.5" /> : <Coins className="w-2.5 h-2.5" />}
                            {entry.wallet_type === 'UPI' ? 'Bank UPI' : 'Cash Drawer Till'}
                          </span>
                        </td>

                        {/* 5. Inflow Credit (+) */}
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap">
                          {credit > 0 ? (
                            <span className="text-emerald-600 dark:text-[#3ecf8e] font-mono font-bold text-xs">
                              +₹{formatINR(credit)}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600 font-mono text-xs">—</span>
                          )}
                        </td>

                        {/* 6. Outflow Debit (-) */}
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap">
                          {debit > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400 font-mono font-bold text-xs">
                              -₹{formatINR(debit)}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600 font-mono text-xs">—</span>
                          )}
                        </td>

                        {/* 7. Progressive Running Balance */}
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-900 dark:text-white font-bold bg-slate-50 dark:bg-black/30 px-2 py-0.5 rounded border border-slate-200/60 dark:border-white/5">
                            ₹{formatINR(runningBal !== undefined ? runningBal : (Number(entry.running_balance) || 0))}
                          </span>
                        </td>

                        {/* 8. Particulars, Mode & Denominations */}
                        <td className="py-2.5 px-3 max-w-[280px]">
                          <div className="space-y-1">
                            <span className="block truncate font-sans text-slate-900 dark:text-zinc-100 text-xs font-medium" title={parsed.title}>
                              {parsed.title}
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              {parsed.modeDetails && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[9px] font-mono text-sky-700 dark:text-sky-300">
                                  {parsed.modeDetails}
                                </span>
                              )}
                              {parsed.chips.map((chip, cIdx) => (
                                <span
                                  key={cIdx}
                                  className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#333333] text-[9px] font-mono text-slate-700 dark:text-[#A1A1A1] tabular-nums"
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>

                        {/* 9. Cashier & Approver */}
                        <td className="py-2.5 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-sans text-xs text-slate-900 dark:text-white font-medium">
                              <User className="w-2.5 h-2.5 text-slate-400" />
                              <span className="truncate">{entry.cashier_name || 'Cashier'}</span>
                            </div>
                            {entry.authorized_by_name && (
                              <span className="block text-[10px] text-slate-400 dark:text-zinc-500 font-sans truncate">
                                Auth: <strong className="font-medium text-slate-600 dark:text-zinc-400">{entry.authorized_by_name}</strong>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 10. Slip / Voucher # */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <span className="font-mono text-[11px] text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-black/30 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-white/5 font-semibold">
                              {refCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyRef(refCode)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                              title="Copy slip reference"
                            >
                              {copiedRef === refCode ? (
                                <CheckCheck className="w-3 h-3 text-[#3ecf8e]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 11. Action */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleViewSlip(entry)}
                              className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-zinc-300 text-xs font-sans inline-flex items-center gap-1 transition-all cursor-pointer"
                              title="View slip details"
                            >
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>Slip</span>
                            </button>

                            {(isDeveloper || user?.role_code === 'Super_Admin' || user?.role_code === 'Store_Manager') && (
                              <button
                                type="button"
                                disabled={purgingId === (entry.id || entry.reference_number)}
                                onClick={() => handlePurgeEntry(entry)}
                                className="p-1 rounded-[6px] border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs transition-all cursor-pointer disabled:opacity-40"
                                title="Delete / Purge errant ledger entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Treasury Table Pagination Footer */}
        <div className="p-3 bg-slate-50 dark:bg-[#171717] border border-slate-200 dark:border-[#242424] rounded-[8px] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-600 dark:text-[#A1A1A1]">
            <span>
              Showing{' '}
              <strong className="text-slate-900 dark:text-white font-mono">
                {filteredAllocations.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>{' '}
              to{' '}
              <strong className="text-slate-900 dark:text-white font-mono">
                {Math.min(currentPage * pageSize, filteredAllocations.length)}
              </strong>{' '}
              of <strong className="text-slate-900 dark:text-white font-mono">{filteredAllocations.length}</strong> entries (Page {currentPage} of {totalPages})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-sans transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-sans transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 5. Safe Drop Slide-Over Drawer */}
      <SafeDropDrawer
        isOpen={isSafeDropOpen}
        onClose={() => setIsSafeDropOpen(false)}
        branchId={selectedBranch}
        currentCashBalance={currentCashBalance}
        onSuccess={loadTreasuryData}
      />

      {/* 6. View Treasury Transaction Slip Modal */}
      {viewLedgerEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl p-5 space-y-4 font-sans animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#242424]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Treasury Voucher Slip
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewLedgerEntry(null)}
                className="p-1 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Slip content */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Voucher / Ref #</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono">
                  {viewLedgerEntry.reference_number || (viewLedgerEntry.id ? String(viewLedgerEntry.id).slice(0, 8).toUpperCase() : 'TRZ-AUTO')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Transaction Type</span>
                <span className="font-semibold text-slate-900 dark:text-white font-sans">
                  {viewLedgerEntry.transaction_type || (Number(viewLedgerEntry.credit_amount) > 0 ? 'Float_Topup' : 'Expense_Voucher')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Wallet Account</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono">
                  {viewLedgerEntry.wallet_type === 'UPI' ? 'Bank UPI Account' : 'Cash Drawer Till Box'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Date &amp; Time</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatDate(viewLedgerEntry.created_at, 'dd MMMM yyyy, HH:mm:ss')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Cashier Attribution</span>
                <span className="font-semibold text-slate-900 dark:text-white font-sans">
                  {viewLedgerEntry.cashier_name || 'Store Cashier'}
                </span>
              </div>
              {viewLedgerEntry.authorized_by_name && (
                <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                  <span>Authorized By</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-sans">
                    {viewLedgerEntry.authorized_by_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-start text-slate-500 dark:text-zinc-400 pt-1">
                <span>Remarks / Notes</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[220px] font-sans">
                  {viewLedgerEntry.remarks || 'Cash Float Top-up'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-[#242424] flex justify-between items-baseline">
                <span className="text-xs uppercase font-sans text-slate-500">
                  {Number(viewLedgerEntry.credit_amount) > 0 ? 'Inflow Amount' : 'Outflow Amount'}
                </span>
                <div className="text-right">
                  <div className={cn(
                    "text-xl font-bold font-mono",
                    Number(viewLedgerEntry.credit_amount) > 0 ? "text-emerald-600 dark:text-[#3ecf8e]" : "text-rose-600 dark:text-rose-400"
                  )}>
                    {Number(viewLedgerEntry.credit_amount) > 0
                      ? `+₹${formatINR(Number(viewLedgerEntry.credit_amount))}`
                      : `-₹${formatINR(Number(viewLedgerEntry.debit_amount))}`}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans">
                    {numberToWordsINR(Number(viewLedgerEntry.credit_amount || viewLedgerEntry.debit_amount) || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleCopyRef(viewLedgerEntry.reference_number || String(viewLedgerEntry.id || ''))}
                className="px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] text-slate-700 dark:text-zinc-300 text-xs font-sans inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Ref</span>
              </button>

              <button
                type="button"
                onClick={() => setViewLedgerEntry(null)}
                className="px-4 py-2 rounded-[6px] bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282828] text-xs font-medium cursor-pointer"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Pre-Commit Verification Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl p-5 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#242424]">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Confirm Inflow
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

            {/* Slip content */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Branch</span>
                <span className="font-semibold text-slate-900 dark:text-white">{activeBranch.branch_name} ({activeBranch.branch_code})</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Wallet</span>
                <span className="font-semibold text-slate-900 dark:text-white">{walletType === 'Cash' ? 'Cash Box' : 'Bank UPI'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Date</span>
                <span className="font-semibold text-slate-900 dark:text-white">{entryDate}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400">
                <span>Reason</span>
                <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{referenceNotes || (walletType === 'Cash' ? 'Cash Box Inflow' : 'Bank UPI Inflow')}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-[#242424] flex justify-between items-baseline">
                <span className="text-xs uppercase font-sans text-slate-500">Amount</span>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-600 dark:text-[#3ecf8e]">
                    {formatINR(Number(amount) || 0)}
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-[#3ecf8e] font-sans">
                    {numberToWordsINR(Number(amount) || 0)}
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
      </div>
    </div>
  );
};
