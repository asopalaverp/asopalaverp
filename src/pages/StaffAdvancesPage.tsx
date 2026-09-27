import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { erpService } from '@/lib/erpService';
import { StaffAdvance } from '@/types/database';
import { formatINR, formatDate, cn, triggerHaptic } from '@/lib/utils';
import { useScrollLock } from '@/hooks/useScrollLock';
import { differenceInDays } from 'date-fns';
import { MetricCard } from '@/components/ui/MetricCard';
import { IOSSegmentedControl } from '@/components/ui/ios';
import { ThermalReceiptSlip } from '@/components/ui/ThermalReceiptSlip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/ToastContainer';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  HandCoins,
  Plus,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  Flag,
  Trash2,
  Calendar,
  Receipt,
  Printer,
  PenTool,
  User,
  Zap,
  X,
  AlertTriangle,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
  Clock,
  Code,
  Copy,
  Check,
  SlidersHorizontal,
  BarChart3,
  Users,
  Building2,
  Terminal,
  MoreVertical,
  Activity,
  RotateCcw,
  ChevronDown,
  CornerDownRight,
  Filter,
  ShieldCheck,
  Download,
} from 'lucide-react';

type SortField =
  | 'receipt_number'
  | 'date'
  | 'staff_name'
  | 'advance_amount'
  | 'settled'
  | 'unsettled_balance'
  | 'status';
type SortOrder = 'asc' | 'desc';
type TableDensity = 'compact' | 'normal' | 'relaxed';
type SubViewTab = 'grid' | 'salary_payroll' | 'analytics_staff' | 'analytics_dept';

type ColumnKey =
  | 'receipt_number'
  | 'date'
  | 'staff_name'
  | 'branch_code'
  | 'advance_amount'
  | 'settled'
  | 'unsettled_balance'
  | 'status'
  | 'actions';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'receipt_number', label: 'Receipt No.' },
  { key: 'date', label: 'Date' },
  { key: 'staff_name', label: 'Staff Member' },
  { key: 'branch_code', label: 'Branch' },
  { key: 'advance_amount', label: 'Advance Given (₹)' },
  { key: 'settled', label: 'Settled (₹)' },
  { key: 'unsettled_balance', label: 'Remaining Due (₹)' },
  { key: 'status', label: 'Status & Ageing' },
  { key: 'actions', label: 'Action & Tools' },
];

interface ActionModalState {
  type: 'flag_salary' | 'waive' | 'delete' | null;
  advance: StaffAdvance | null;
  reason: string;
  month: string;
  isSubmitting: boolean;
  error?: string;
  successMessage?: string;
}

export const getAdvanceAgeing = (advanceDate: string, status: string) => {
  if (
    status === 'Settled_Bills' ||
    status === 'Settled_Cash' ||
    status === 'Cleared_Salary_Deduction'
  ) {
    return { days: 0, category: 'settled', label: 'Settled', isOverdue: false };
  }
  const days = Math.max(0, differenceInDays(new Date(), new Date(advanceDate)));
  if (days <= 7) {
    return { days, category: 'active_0_7', label: `${days}d (On Track)`, isOverdue: false };
  }
  if (days <= 14) {
    return { days, category: 'due_8_14', label: `${days}d (Due Soon)`, isOverdue: false };
  }
  return { days, category: 'overdue_15', label: `${days}d (Overdue)`, isOverdue: true };
};

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

function generateAdvanceSqlInsert(a: StaffAdvance): string {
  const esc = (val?: string | null) => (val ? `'${val.replace(/'/g, "''")}'` : 'NULL');
  return `INSERT INTO staff_advances (id, receipt_number, branch_code, advance_date, staff_name, staff_code, department_name, payment_method, advance_amount, bills_submitted_amount, cash_returned_amount, unsettled_balance, status, purpose) VALUES (${esc(a.id)}, ${esc(a.receipt_number)}, ${esc(a.branch_code)}, ${esc(a.advance_date)}, ${esc(a.staff_name)}, ${esc(a.staff_code)}, ${esc(a.department_name)}, ${esc(a.payment_method)}, ${Number(a.advance_amount) || 0}, ${Number(a.bills_submitted_amount) || 0}, ${Number(a.cash_returned_amount) || 0}, ${Number(a.unsettled_balance) || 0}, ${esc(a.status)}, ${esc(a.purpose)});`;
}

export const StaffAdvancesPage: React.FC = () => {
  const { setAdvanceModalOpen, setSettleTargetAdvance } = useUIStore();
  const { user, can } = useAuthStore();
  const isDeveloper = user?.role_code === 'Developer' || user?.role_code === 'Super_Admin';
  const { selectedBranchId } = useBranchStore();

  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [minDue, setMinDue] = useState<string>('');
  const [maxDue, setMaxDue] = useState<string>('');

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Sub-view Tab & Pro Developer Controls
  const [activeSubTab, setActiveSubTab] = useState<SubViewTab>('grid');
  const [tableDensity, setTableDensity] = useState<TableDensity>('normal');
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set([
      'receipt_number',
      'date',
      'staff_name',
      'branch_code',
      'advance_amount',
      'settled',
      'unsettled_balance',
      'status',
      'actions',
    ])
  );
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Popovers & Feedback
  const [selectedSlipAdvance, setSelectedSlipAdvance] = useState<StaffAdvance | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [activeRowDropdownId, setActiveRowDropdownId] = useState<string | null>(null);
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const columnPickerRef = useRef<HTMLDivElement | null>(null);

  const [actionModal, setActionModal] = useState<ActionModalState>({
    type: null,
    advance: null,
    reason: '',
    month: 'Current Month (25th Payroll)',
    isSubmitting: false,
  });

  // HR Payroll Sync State
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>('March 2026 Payroll (25th)');
  const [selectedPayrollIds, setSelectedPayrollIds] = useState<Set<string>>(new Set());
  const [isPayrollProcessing, setIsPayrollProcessing] = useState<boolean>(false);

  useScrollLock(Boolean(actionModal.type));

  const fetchAdvances = useCallback(async () => {
    try {
      const data = await erpService.getStaffAdvances(selectedBranchId);
      setAdvances(data);
    } catch (e) {
      console.error('Error fetching advances:', e);
    }
  }, [selectedBranchId]);

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal.advance || !actionModal.type) return;

    setActionModal((prev) => ({ ...prev, isSubmitting: true, error: undefined }));
    const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
    const userRole = user?.role_code || 'Super_Admin';
    const targetBranch = actionModal.advance.branch_id || selectedBranchId || 'Aellp-ASI';

    try {
      if (actionModal.type === 'flag_salary') {
        await erpService.flagForSalaryDeduction(
          actionModal.advance.receipt_number,
          actionModal.month,
          userName,
          targetBranch
        );
      } else if (actionModal.type === 'waive') {
        if (!actionModal.reason.trim()) {
          throw new Error('Please provide an approval reason for waiving remaining advance balance.');
        }
        await erpService.waiveStaffAdvance(
          actionModal.advance.receipt_number,
          userName,
          userRole,
          actionModal.reason.trim(),
          targetBranch
        );
      } else if (actionModal.type === 'delete') {
        if (!actionModal.reason.trim()) {
          throw new Error('Mandatory justification is required to delete/purge an advance.');
        }
        await erpService.deleteStaffAdvance(
          actionModal.advance.receipt_number,
          userName,
          userRole,
          actionModal.reason.trim(),
          targetBranch
        );
      }

      await fetchAdvances();
      showToast({
        type: 'success',
        title: 'Advance Updated',
        message: `Advance #${actionModal.advance.receipt_number} updated successfully.`,
      });
      triggerHaptic('success');
      setActionModal({ type: null, advance: null, reason: '', month: '', isSubmitting: false });
    } catch (err: any) {
      console.error('Advance action error:', err);
      const errMsg = err.message || 'Operation failed.';
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: errMsg,
      });
      triggerHaptic('error');
      setActionModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: errMsg,
      }));
    }
  };

  const handleExportHRPayrollCSV = () => {
    try {
      const csvContent = erpService.generateHRPayrollDeductionCSV(advances, selectedPayrollMonth);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HR_Payroll_Deductions_${selectedPayrollMonth.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast({
        type: 'success',
        title: 'Payroll CSV Exported',
        message: `HR Payroll deduction schedule downloaded for ${selectedPayrollMonth}`,
      });
      triggerHaptic('success');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Export Failed',
        message: err.message || 'Failed to generate payroll CSV',
      });
    }
  };

  const handleAutoFlag30DayOverdues = async () => {
    setIsPayrollProcessing(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const overdueAdvances = advances.filter(
        (a) =>
          a.status === 'Active_Unsettled' &&
          Number(a.unsettled_balance) > 0 &&
          new Date(a.advance_date) <= thirtyDaysAgo
      );

      if (overdueAdvances.length === 0) {
        showToast({
          type: 'info',
          title: 'No 30+ Day Overdues',
          message: 'All active advances are within the normal 30-day grace period.',
        });
        return;
      }

      const overdueIds = overdueAdvances.map((a) => a.id);
      const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
      const res = await erpService.batchFlagOverdueForSalaryDeduction(
        overdueIds,
        selectedPayrollMonth,
        userName,
        selectedBranchId
      );

      showToast({
        type: 'success',
        title: 'Overdue Advances Flagged',
        message: `Flagged ${res.count} overdue advances totaling ${formatINR(res.totalAmount)} for salary deduction`,
      });
      triggerHaptic('success');
      await fetchAdvances();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Auto-Flag Failed',
        message: err.message || 'Failed to auto-flag overdue advances',
      });
    } finally {
      setIsPayrollProcessing(false);
    }
  };

  const handleBatchClearPayrollDeductions = async () => {
    if (selectedPayrollIds.size === 0) {
      showToast({
        type: 'warning',
        title: 'No Rows Selected',
        message: 'Select at least one advance to mark as cleared by HR payroll.',
      });
      return;
    }

    setIsPayrollProcessing(true);
    try {
      const userName = `${user?.first_name || 'Cashier'} ${user?.last_name || ''}`.trim();
      const userRole = user?.role_code || 'Super_Admin';
      const res = await erpService.batchClearSalaryDeductions(
        Array.from(selectedPayrollIds),
        userName,
        userRole,
        `HR Payroll processed for ${selectedPayrollMonth}`,
        selectedBranchId
      );

      showToast({
        type: 'success',
        title: 'Payroll Deductions Cleared',
        message: `Successfully marked ${res.count} advances (${formatINR(res.totalAmount)}) as Settled via Salary Deduction`,
      });
      setSelectedPayrollIds(new Set());
      triggerHaptic('success');
      await fetchAdvances();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Clear Deductions Failed',
        message: err.message || 'Failed to clear salary deductions',
      });
    } finally {
      setIsPayrollProcessing(false);
    }
  };

  useEffect(() => {
    fetchAdvances();
    const handleUpdates = () => {
      fetchAdvances();
    };
    window.addEventListener('asopalav:advances-updated', handleUpdates);
    window.addEventListener('asopalav:wallet-updated', handleUpdates);
    return () => {
      window.removeEventListener('asopalav:advances-updated', handleUpdates);
      window.removeEventListener('asopalav:wallet-updated', handleUpdates);
    };
  }, [fetchAdvances]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
    setFocusedIndex(-1);
  }, [search, statusFilter, selectedDept, minDue, maxDue, pageSize]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setIsColumnPickerOpen(false);
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

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setClipboardToast(label);
    showToast({
      type: 'info',
      title: 'Copied to Clipboard',
      message: label,
    });
    triggerHaptic('selection');
    setTimeout(() => setClipboardToast(null), 2500);
  }, []);

  // Departments list
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    advances.forEach((a) => {
      if (a.department_name) set.add(a.department_name);
    });
    return Array.from(set);
  }, [advances]);

  // Metrics
  const metrics = useMemo(() => {
    const totalDisbursed = advances.reduce((s, a) => s + (Number(a.advance_amount) || 0), 0);
    const totalUnsettled = advances.reduce((s, a) => s + (Number(a.unsettled_balance) || 0), 0);
    const totalSettledBills = advances.reduce(
      (s, a) => s + (Number(a.bills_submitted_amount) || 0),
      0
    );
    const totalCashReturned = advances.reduce(
      (s, a) => s + (Number(a.cash_returned_amount) || 0),
      0
    );
    const totalSettled = totalSettledBills + totalCashReturned;
    const recoveryRate =
      totalDisbursed > 0 ? ((totalSettled / totalDisbursed) * 100).toFixed(1) : '0.0';

    const flaggedCount = advances.filter((a) => a.status === 'Flagged_Salary_Deduction').length;
    const activeUnsettled = advances.filter((a) => a.status === 'Active_Unsettled');
    const onTrackCount = activeUnsettled.filter(
      (a) => differenceInDays(new Date(), new Date(a.advance_date)) <= 7
    ).length;
    const dueSoonCount = activeUnsettled.filter((a) => {
      const d = differenceInDays(new Date(), new Date(a.advance_date));
      return d >= 8 && d <= 14;
    }).length;
    const overdueCount = activeUnsettled.filter(
      (a) => differenceInDays(new Date(), new Date(a.advance_date)) >= 15
    ).length;

    const overdueAmount = activeUnsettled
      .filter((a) => differenceInDays(new Date(), new Date(a.advance_date)) >= 15)
      .reduce((s, a) => s + (Number(a.unsettled_balance) || 0), 0);

    // Ageing percentages based on active unsettled count
    const totalActive = activeUnsettled.length;
    const onTrackPct = totalActive > 0 ? Math.round((onTrackCount / totalActive) * 100) : 0;
    const dueSoonPct = totalActive > 0 ? Math.round((dueSoonCount / totalActive) * 100) : 0;
    const overduePct = totalActive > 0 ? Math.round((overdueCount / totalActive) * 100) : 0;

    return {
      totalDisbursed,
      totalUnsettled,
      totalSettled,
      recoveryRate,
      settlementRate: recoveryRate,
      flaggedCount,
      activeCount: activeUnsettled.length,
      onTrackCount,
      dueSoonCount,
      overdueCount,
      overdueAmount,
      onTrackPct,
      dueSoonPct,
      overduePct,
    };
  }, [advances]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(
        field === 'advance_amount' || field === 'unsettled_balance' || field === 'date'
          ? 'desc'
          : 'asc'
      );
    }
  };

  const filteredAdvances = useMemo(() => {
    let result = advances.filter((a) => {
      const matchSearch =
        !search ||
        a.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
        a.staff_name.toLowerCase().includes(search.toLowerCase()) ||
        a.staff_code.toLowerCase().includes(search.toLowerCase()) ||
        a.purpose.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (selectedDept !== 'ALL' && a.department_name !== selectedDept) {
        return false;
      }

      if (minDue !== '' && !isNaN(Number(minDue)) && (Number(a.unsettled_balance) || 0) < Number(minDue)) {
        return false;
      }
      if (maxDue !== '' && !isNaN(Number(maxDue)) && (Number(a.unsettled_balance) || 0) > Number(maxDue)) {
        return false;
      }

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'Active_0_7') {
        return (
          a.status === 'Active_Unsettled' &&
          differenceInDays(new Date(), new Date(a.advance_date)) <= 7
        );
      }
      if (statusFilter === 'Due_8_14') {
        const d = differenceInDays(new Date(), new Date(a.advance_date));
        return a.status === 'Active_Unsettled' && d >= 8 && d <= 14;
      }
      if (statusFilter === 'Overdue_15') {
        return (
          a.status === 'Active_Unsettled' &&
          differenceInDays(new Date(), new Date(a.advance_date)) >= 15
        );
      }
      if (statusFilter === 'Flagged_Salary_Deduction') {
        return a.status === 'Flagged_Salary_Deduction';
      }
      if (statusFilter === 'Settled_Cleared') {
        return (
          a.status === 'Settled_Bills' ||
          a.status === 'Settled_Cash' ||
          a.status === 'Cleared_Salary_Deduction'
        );
      }
      return a.status === statusFilter;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.advance_date).getTime() - new Date(b.advance_date).getTime();
      } else if (sortField === 'receipt_number') {
        comparison = a.receipt_number.localeCompare(b.receipt_number);
      } else if (sortField === 'staff_name') {
        comparison = a.staff_name.localeCompare(b.staff_name);
      } else if (sortField === 'advance_amount') {
        comparison = (Number(a.advance_amount) || 0) - (Number(b.advance_amount) || 0);
      } else if (sortField === 'settled') {
        const setA =
          (Number(a.bills_submitted_amount) || 0) + (Number(a.cash_returned_amount) || 0);
        const setB =
          (Number(b.bills_submitted_amount) || 0) + (Number(b.cash_returned_amount) || 0);
        comparison = setA - setB;
      } else if (sortField === 'unsettled_balance') {
        comparison = (Number(a.unsettled_balance) || 0) - (Number(b.unsettled_balance) || 0);
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [advances, search, statusFilter, selectedDept, minDue, maxDue, sortField, sortOrder]);

  // Grouped Staff Analytics
  const staffMemberAnalytics = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        code: string;
        dept: string;
        count: number;
        totalReceived: number;
        totalSettled: number;
        unsettled: number;
      }
    >();

    filteredAdvances.forEach((a) => {
      const key = `${a.staff_code}_${a.staff_name}`;
      const prev = map.get(key) || {
        name: a.staff_name,
        code: a.staff_code,
        dept: a.department_name || 'General',
        count: 0,
        totalReceived: 0,
        totalSettled: 0,
        unsettled: 0,
      };

      const settled =
        (Number(a.bills_submitted_amount) || 0) + (Number(a.cash_returned_amount) || 0);

      map.set(key, {
        ...prev,
        count: prev.count + 1,
        totalReceived: prev.totalReceived + (Number(a.advance_amount) || 0),
        totalSettled: prev.totalSettled + settled,
        unsettled: prev.unsettled + (Number(a.unsettled_balance) || 0),
      });
    });

    return Array.from(map.values()).sort((a, b) => b.unsettled - a.unsettled);
  }, [filteredAdvances]);

  // Grouped Dept Analytics
  const departmentAnalytics = useMemo(() => {
    const map = new Map<
      string,
      { dept: string; count: number; totalReceived: number; totalSettled: number; unsettled: number }
    >();

    filteredAdvances.forEach((a) => {
      const dept = a.department_name || 'General';
      const prev = map.get(dept) || {
        dept,
        count: 0,
        totalReceived: 0,
        totalSettled: 0,
        unsettled: 0,
      };

      const settled =
        (Number(a.bills_submitted_amount) || 0) + (Number(a.cash_returned_amount) || 0);

      map.set(dept, {
        dept,
        count: prev.count + 1,
        totalReceived: prev.totalReceived + (Number(a.advance_amount) || 0),
        totalSettled: prev.totalSettled + settled,
        unsettled: prev.unsettled + (Number(a.unsettled_balance) || 0),
      });
    });

    return Array.from(map.values()).sort((a, b) => b.unsettled - a.unsettled);
  }, [filteredAdvances]);

  const totalPages = Math.max(1, Math.ceil(filteredAdvances.length / pageSize));
  const paginatedAdvances = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredAdvances.slice(startIdx, startIdx + pageSize);
  }, [filteredAdvances, currentPage, pageSize]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllCurrentPage = () => {
    const pageIds = paginatedAdvances.map((a) => a.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach((id) => next.delete(id));
    } else {
      pageIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const getExportData = () => {
    return selectedIds.size > 0
      ? filteredAdvances.filter((a) => selectedIds.has(a.id))
      : filteredAdvances;
  };

  const handleExportCSV = () => {
    const list = getExportData();
    const headers = [
      'Receipt #',
      'Date',
      'Staff Code',
      'Staff Name',
      'Department',
      'Branch',
      'Payment Mode',
      'Total Advance Given',
      'Bills Submitted',
      'Cash Returned',
      'Pending Balance',
      'Status',
      'Purpose',
    ];

    const rows = list.map((a) => [
      a.receipt_number,
      a.advance_date,
      a.staff_code,
      `"${a.staff_name}"`,
      `"${a.department_name}"`,
      a.branch_code,
      a.payment_method,
      a.advance_amount,
      a.bills_submitted_amount,
      a.cash_returned_amount,
      a.unsettled_balance,
      a.status,
      `"${a.purpose.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Staff_Advances_Ledger_${new Date().toISOString().slice(0, 10)}.csv`,
      csvContent,
      'text/csv;charset=utf-8;'
    );
    showToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${list.length} staff advance records as CSV.`,
    });
    setIsExportMenuOpen(false);
  };

  const handleExportJSON = () => {
    const list = getExportData();
    const jsonContent = JSON.stringify(list, null, 2);
    downloadBlob(
      `Staff_Advances_Dump_${new Date().toISOString().slice(0, 10)}.json`,
      jsonContent,
      'application/json;charset=utf-8;'
    );
    showToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${list.length} staff advance records as JSON.`,
    });
    setIsExportMenuOpen(false);
  };

  const handleExportSQL = () => {
    const list = getExportData();
    const sqlContent =
      `-- Asopalav Staff Advances SQL Dump\n-- Generated on ${new Date().toISOString()}\n\n` +
      list.map(generateAdvanceSqlInsert).join('\n');
    downloadBlob(
      `Staff_Advances_${new Date().toISOString().slice(0, 10)}.sql`,
      sqlContent,
      'text/plain;charset=utf-8;'
    );
    showToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${list.length} staff advance records as SQL dump.`,
    });
    setIsExportMenuOpen(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive =
        activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (isExportMenuOpen) setIsExportMenuOpen(false);
        if (isColumnPickerOpen) setIsColumnPickerOpen(false);
        if (activeRowDropdownId) setActiveRowDropdownId(null);
        if (search) setSearch('');
        return;
      }

      if (isInputActive) return;

      if (activeSubTab === 'grid' && paginatedAdvances.length > 0) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1 >= paginatedAdvances.length ? 0 : prev + 1));
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 < 0 ? paginatedAdvances.length - 1 : prev - 1));
        } else if (e.key === ' ' && focusedIndex >= 0) {
          e.preventDefault();
          const target = paginatedAdvances[focusedIndex];
          if (target) handleToggleSelect(target.id);
        } else if (e.key === 'Enter' && focusedIndex >= 0) {
          e.preventDefault();
          const target = paginatedAdvances[focusedIndex];
          if (target && target.unsettled_balance > 0) {
            setSettleTargetAdvance(target);
          }
        } else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          setIsExportMenuOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isExportMenuOpen,
    isColumnPickerOpen,
    activeRowDropdownId,
    search,
    activeSubTab,
    paginatedAdvances,
    focusedIndex,
    setSettleTargetAdvance,
  ]);

  const handleFlagSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal.advance) return;

    setActionModal((prev) => ({ ...prev, isSubmitting: true, error: undefined }));
    try {
      await erpService.flagForSalaryDeduction(
        actionModal.advance.receipt_number,
        actionModal.month,
        user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : 'Store Manager',
        selectedBranchId
      );
      await fetchAdvances();
      setActionModal({
        type: null,
        advance: null,
        reason: '',
        month: '',
        isSubmitting: false,
      });
      copyToClipboard(
        actionModal.advance.receipt_number,
        `Flagged for ${actionModal.month} payroll deduction`
      );
    } catch (err: any) {
      setActionModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.message || 'Failed to flag for salary deduction',
      }));
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setVisibleColumns(next);
  };

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors ml-1 inline-block" />
      );
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-primary stroke-[2.5] ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary stroke-[2.5] ml-1 inline-block" />
    );
  };

  const isAllCurrentPageSelected =
    paginatedAdvances.length > 0 && paginatedAdvances.every((a) => selectedIds.has(a.id));

  const densityStyles = {
    compact: {
      header: 'py-2 px-2.5 text-[10px]',
      cell: 'py-1.5 px-2.5 text-xs',
    },
    normal: {
      header: 'py-3 px-3.5 text-[11px]',
      cell: 'py-2.5 px-3.5 text-xs',
    },
    relaxed: {
      header: 'py-3.5 px-4 text-xs',
      cell: 'py-3.5 px-4 text-sm',
    },
  }[tableDensity];

  return (
    <div className="min-h-screen bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16 select-none">
      {/* Toast Notification */}
      {clipboardToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-[6px] bg-slate-900 dark:bg-[#171717] text-white border border-slate-700 dark:border-[#2e2e2e] shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200 text-xs font-mono">
          <Check className="w-3.5 h-3.5 text-[#3ecf8e] stroke-[2.5]" />
          <span>{clipboardToast}</span>
        </div>
      )}

      {/* 1. Staff Advances Header (iOS 16 Frosted Glass) */}
      <div className="sticky top-0 z-30 px-4 lg:px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 backdrop-blur-2xl bg-white/80 dark:bg-[#121214]/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title, Status Badges & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3ecf8e]" />
                <span>Staff Advances</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center font-medium">
                {filteredAdvances.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
              Track money given in advance to staff, bills submitted, and remaining balances.
            </p>
          </div>

          {/* Right Layer: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Sub-View Switcher (iOS Segmented Control) */}
            <IOSSegmentedControl
              options={[
                { id: 'grid', label: 'All Advances', icon: <Layers className="w-3.5 h-3.5" /> },
                { id: 'salary_payroll', label: 'HR Payroll Sync', icon: <Flag className="w-3.5 h-3.5" /> },
                { id: 'analytics_staff', label: 'By Staff', icon: <Users className="w-3.5 h-3.5" /> },
                { id: 'analytics_dept', label: 'By Department', icon: <Building2 className="w-3.5 h-3.5" /> },
              ]}
              value={activeSubTab}
              onChange={(val) => setActiveSubTab(val as SubViewTab)}
              size="sm"
            />

            {/* Export Menu */}
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="h-8.5 px-3 py-1.5 rounded-[10px] border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ios-press"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-[#707070]" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-48 rounded-[14px] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border border-slate-200/80 dark:border-white/15 shadow-2xl p-1.5 z-40 space-y-0.5 text-xs font-mono animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-[8px] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Export CSV</span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-[#707070]">.csv</span>
                  </button>

                  {isDeveloper && (
                    <button
                      type="button"
                      onClick={handleExportJSON}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-[8px] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Code className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Export JSON</span>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-[#707070]">.json</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setAdvanceModalOpen(true);
              }}
              className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs select-none"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Give Advance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container Area */}
      <main className="px-4 lg:px-6 py-4 space-y-4 flex-1">
        {/* Filter Controls Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-[12px] bg-slate-50/80 dark:bg-[#18181a] border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-[#707070]" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search advances by staff name, receipt..."
                className="w-full pl-9 pr-12 py-2 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 text-xs text-slate-900 dark:text-[#EDEDED] placeholder-slate-400 dark:placeholder-[#606060] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e] font-mono transition-colors shadow-2xs"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-[#EDEDED] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {/* Status & Ageing Filter Dropdown */}
            <div className="w-52">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: `All Advances (${advances.length})` },
                  { value: 'Active_0_7', label: '0-7 days (On Track)', badge: `${metrics.onTrackCount}` },
                  { value: 'Due_8_14', label: '8-14 days (Due Soon)', badge: `${metrics.dueSoonCount}` },
                  { value: 'Overdue_15', label: '15+ days (Overdue)', badge: `${metrics.overdueCount}` },
                  { value: 'Flagged_Salary_Deduction', label: 'Deduct from Salary', badge: `${metrics.flaggedCount}` },
                  { value: 'Settled_Cleared', label: 'Settled & Cleared' },
                ]}
                value={statusFilter}
                onChange={(val) => {
                  triggerHaptic();
                  setStatusFilter(val);
                }}
                placeholder="All Statuses"
                searchPlaceholder="Search status..."
                allowCustom={false}
              />
            </div>

            {/* Department Filter */}
            <div className="w-48">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: `All Departments (${departmentsList.length})` },
                  ...departmentsList.map((d) => ({ value: d, label: d })),
                ]}
                value={selectedDept}
                onChange={setSelectedDept}
                placeholder="All Departments"
                searchPlaceholder="Search department..."
                allowCustom={false}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Density Toggle (Desktop Only) */}
            <div className="hidden sm:inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626]">
              {(['compact', 'normal', 'relaxed'] as TableDensity[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTableDensity(d)}
                  title={`Density: ${d}`}
                  className={cn(
                    'px-2 py-1 rounded-[4px] text-[10px] font-mono capitalize transition-all cursor-pointer font-medium',
                    tableDensity === d
                      ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white border border-slate-300 dark:border-[#383838] shadow-xs'
                      : 'text-slate-500 dark:text-[#707070] hover:text-slate-900 dark:hover:text-[#EDEDED]'
                  )}
                >
                  {d[0].toUpperCase()}
                </button>
              ))}
            </div>

            {/* Column Picker */}
            <div className="relative" ref={columnPickerRef}>
              <button
                type="button"
                onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
                title="Columns"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-medium text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] border border-slate-200 dark:border-[#262626] cursor-pointer transition-colors font-mono"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 dark:text-[#707070]" />
                <span>Columns</span>
              </button>

              {isColumnPickerOpen && (
                <div className="absolute right-0 mt-1.5 w-52 rounded-[8px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#262626] shadow-2xl p-3 z-40 space-y-2 text-xs font-mono">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#707070] pb-1 border-b border-slate-200 dark:border-[#262626]">
                    Visible Columns
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {ALL_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#222222] cursor-pointer text-slate-800 dark:text-[#EDEDED] text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded accent-[#3ecf8e] cursor-pointer"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#171717] p-3.5 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#707070]">Total Advances Given</div>
            <div className="text-2xl font-mono tabular-nums font-medium text-slate-900 dark:text-white">{formatINR(metrics.totalDisbursed)}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {advances.length} advances recorded
            </div>
          </div>

          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#171717] p-3.5 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#707070]">Pending to Recover</div>
            <div className="text-2xl font-mono tabular-nums font-medium text-slate-900 dark:text-white">{formatINR(metrics.totalUnsettled)}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {metrics.activeCount} staff balance due
            </div>
          </div>

          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#171717] p-3.5 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#707070]">Recovered (Bills & Cash)</div>
            <div className="text-2xl font-mono tabular-nums font-medium text-slate-900 dark:text-white">{formatINR(metrics.totalSettled)}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {metrics.settlementRate}% recovery velocity
            </div>
          </div>

          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#171717] p-3.5 space-y-1 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#707070]">15+ Days Overdue</div>
            <div className="text-2xl font-mono tabular-nums font-medium text-slate-900 dark:text-white">{formatINR(metrics.overdueAmount)}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {metrics.overdueCount} advances follow-up
            </div>
          </div>
        </div>

        {/* 3. Recovery Velocity Telemetry Strip */}
        <div className="p-3.5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#3ecf8e]" />
              <span className="font-mono font-medium text-slate-900 dark:text-white">Recovery Health & Ageing Distribution</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-[#707070]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#3ecf8e]" /> Settled ({metrics.settlementRate}%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" /> Due Soon ({metrics.dueSoonPct}%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400" /> Overdue ({metrics.overduePct}%)
              </span>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div className="w-full h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-[#141414] flex border border-slate-200 dark:border-[#262626]">
            <div
              className="bg-[#3ecf8e] transition-all duration-300"
              style={{ width: `${metrics.settlementRate}%` }}
              title={`Settled: ${metrics.settlementRate}%`}
            />
            <div
              className="bg-amber-400 transition-all duration-300"
              style={{ width: `${metrics.dueSoonPct}%` }}
              title={`Due (8-14d): ${metrics.dueSoonPct}%`}
            />
            <div
              className="bg-rose-500 transition-all duration-300"
              style={{ width: `${metrics.overduePct}%` }}
              title={`Overdue (15+d): ${metrics.overduePct}%`}
            />
          </div>
        </div>

        {/* Floating Selection Dock */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-3 rounded-[8px] bg-emerald-50 dark:bg-[#3ecf8e]/10 border border-emerald-200 dark:border-[#3ecf8e]/20 text-slate-900 dark:text-white shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 text-xs font-mono font-medium">
              <span className="w-6 h-6 rounded-full bg-[#3ecf8e] text-[#171717] font-mono text-xs flex items-center justify-center font-semibold">
                {selectedIds.size}
              </span>
              <span>
                {selectedIds.size} advance{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono">
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-[6px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] text-xs text-slate-800 dark:text-white hover:border-[#3ecf8e] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs font-medium"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2.5 py-1.5 rounded-[6px] text-xs text-slate-500 dark:text-[#707070] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* 5. Sub-Views Content */}
        {activeSubTab === 'grid' && (
          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414] overflow-hidden shadow-xs">
            {/* Mobile Studio Card Feed (< lg when mobileViewMode === 'cards') */}
            {mobileViewMode === 'cards' && (
              <div className="lg:hidden divide-y divide-slate-100 dark:divide-[#1f1f1f] p-2 space-y-2">
                {paginatedAdvances.map((adv) => {
                  const isSettled = adv.unsettled_balance === 0;
                  const isSelected = selectedIds.has(adv.id);
                  const ageing = getAdvanceAgeing(adv.advance_date, adv.status);
                  const initials = (adv.staff_name || 'ST')
                    .split(' ')
                    .map((p) => p[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={adv.id}
                      onClick={() => {
                        triggerHaptic();
                        setSelectedSlipAdvance(adv);
                      }}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-[12px] bg-slate-50 dark:bg-[#171717] border border-slate-200 dark:border-[#242424] hover:border-[#3ecf8e]/40 transition-all cursor-pointer gap-3 select-none',
                        isSelected && 'ring-1 ring-[#3ecf8e] bg-emerald-50 dark:bg-[#3ecf8e]/10'
                      )}
                    >
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full border flex items-center justify-center font-mono font-bold text-xs shadow-2xs transition-colors',
                            isSettled
                              ? 'border-[#3ecf8e]/50 bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e]'
                              : ageing.isOverdue
                              ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400'
                              : 'border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          )}
                        >
                          {initials}
                        </div>
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#171717]',
                            isSettled ? 'bg-[#3ecf8e]' : ageing.isOverdue ? 'bg-rose-500' : 'bg-amber-500'
                          )}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-medium text-sm text-slate-900 dark:text-white truncate">
                            {adv.staff_name}
                          </h4>
                          {adv.staff_code && (
                            <span className="text-[10px] font-mono px-1 rounded bg-slate-200 dark:bg-[#242424] text-slate-700 dark:text-[#A1A1A1]">
                              {adv.staff_code}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#707070] truncate flex items-center gap-1.5 font-sans">
                          <span>{adv.department_name || 'Floor Staff'}</span>
                          <span>•</span>
                          <span className="font-mono text-[10px]">{formatDate(adv.advance_date, 'dd MMM yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5 font-mono">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-[4px] text-[10px] font-mono border font-medium',
                              isSettled
                                ? 'bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-200 dark:border-[#3ecf8e]/20'
                                : ageing.isOverdue
                                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                            )}
                          >
                            {ageing.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-[#707070]">
                            #{adv.receipt_number}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch py-0.5">
                        <div>
                          <div className="text-[10px] text-slate-500 dark:text-[#707070] font-mono uppercase tracking-wider">
                            Due Balance
                          </div>
                          <div
                            className={cn(
                              'font-mono font-bold text-base tabular-nums',
                              adv.unsettled_balance > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-[#3ecf8e]'
                            )}
                          >
                            {formatINR(adv.unsettled_balance)}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#707070] font-mono">
                            Adv: {formatINR(adv.advance_amount)}
                          </div>
                        </div>

                        {!isSettled && can('can_settle_advance') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic();
                              setSettleTargetAdvance(adv);
                            }}
                            className="mt-1 px-3 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] font-semibold text-xs font-mono transition-colors cursor-pointer"
                          >
                            <span>Settle</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {paginatedAdvances.length === 0 && (
                  <EmptyState
                    icon={HandCoins}
                    title="No staff advances found"
                    description="No records match your active search or filters."
                    actionLabel="Give Staff Advance"
                    onAction={() => setAdvanceModalOpen(true)}
                    className="py-8"
                  />
                )}
              </div>
            )}

            {/* Desktop & Full View Table */}
            <div className={cn(mobileViewMode === 'cards' ? 'hidden lg:block' : 'block', 'overflow-x-auto min-h-[320px]')}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#707070] font-mono select-none">
                    <th
                      className={cn(
                        'w-11 border-r border-slate-200 dark:border-[#242424] text-center',
                        densityStyles.header
                      )}
                    >
                      <button
                        type="button"
                        onClick={handleSelectAllCurrentPage}
                        className="cursor-pointer text-slate-400 dark:text-[#707070] hover:text-[#3ecf8e] inline-flex items-center justify-center"
                      >
                        {isAllCurrentPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#3ecf8e]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>

                    {visibleColumns.has('receipt_number') && (
                      <th
                        onClick={() => handleSort('receipt_number')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group min-w-[130px]',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span>receipt_no</span>
                            <span className="text-[10px] text-slate-400 dark:text-[#555555]">varchar</span>
                          </span>
                          {renderSortArrow('receipt_number')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('date') && (
                      <th
                        onClick={() => handleSort('date')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group w-28',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span>advance_date</span>
                            <span className="text-[10px] text-slate-400 dark:text-[#555555]">date</span>
                          </span>
                          {renderSortArrow('date')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('staff_name') && (
                      <th
                        onClick={() => handleSort('staff_name')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] min-w-[180px] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span>staff_name</span>
                            <span className="text-[10px] text-slate-400 dark:text-[#555555]">text</span>
                          </span>
                          {renderSortArrow('staff_name')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('branch_code') && (
                      <th
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] min-w-[80px]',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>branch_code</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#555555]">varchar</span>
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('advance_amount') && (
                      <th
                        onClick={() => handleSort('advance_amount')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] text-right min-w-[125px] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>advance_amount</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#555555]">numeric</span>
                          {renderSortArrow('advance_amount')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('settled') && (
                      <th
                        onClick={() => handleSort('settled')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] text-right min-w-[120px] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>settled_amount</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#555555]">numeric</span>
                          {renderSortArrow('settled')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('unsettled_balance') && (
                      <th
                        onClick={() => handleSort('unsettled_balance')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] text-right min-w-[125px] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>unsettled_balance</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#555555]">numeric</span>
                          {renderSortArrow('unsettled_balance')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('status') && (
                      <th
                        onClick={() => handleSort('status')}
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] text-center min-w-[130px] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors group',
                          densityStyles.header
                        )}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>status</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#555555]">text</span>
                          {renderSortArrow('status')}
                        </div>
                      </th>
                    )}

                    {visibleColumns.has('actions') && (
                      <th className={cn('text-right min-w-[140px]', densityStyles.header)}>
                        <div className="flex items-center justify-end gap-1.5">
                          <span>actions</span>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-[#1f1f1f] font-mono tabular-nums">
                  {paginatedAdvances.map((adv, idx) => {
                    const isUnsettled = adv.unsettled_balance > 0;
                    const isSelected = selectedIds.has(adv.id);
                    const isFocused = focusedIndex === idx;
                    const ageing = getAdvanceAgeing(adv.advance_date, adv.status);
                    const isDropdownOpen = activeRowDropdownId === adv.id;

                    return (
                      <tr
                        key={adv.id}
                        className={cn(
                          'hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] transition-colors',
                          isSelected && 'bg-emerald-50/70 dark:bg-[#3ecf8e]/10',
                          isFocused && 'bg-slate-100 dark:bg-[#242424]'
                        )}
                      >
                        <td
                          className={cn(
                            'border-r border-slate-100 dark:border-[#1f1f1f] text-center',
                            densityStyles.cell
                          )}
                          onClick={() => handleToggleSelect(adv.id)}
                        >
                          <button
                            type="button"
                            className="cursor-pointer inline-flex items-center justify-center text-slate-400 dark:text-[#707070] hover:text-[#3ecf8e]"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#3ecf8e]" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {visibleColumns.has('receipt_number') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium',
                              densityStyles.cell
                            )}
                          >
                            {adv.receipt_number}
                          </td>
                        )}

                        {visibleColumns.has('date') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] text-slate-600 dark:text-[#A1A1A1]',
                              densityStyles.cell
                            )}
                          >
                            {formatDate(adv.advance_date)}
                          </td>
                        )}

                        {visibleColumns.has('staff_name') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] font-sans text-slate-900 dark:text-[#EDEDED]',
                              densityStyles.cell
                            )}
                          >
                            <div className="flex items-center gap-1.5 font-medium">
                              <span>{adv.staff_name}</span>
                              {adv.signature_image_url && (
                                <span
                                  className="inline-flex items-center text-[10px] text-[#3ecf8e]"
                                  title="Digital signature verified"
                                >
                                  <PenTool className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-[#707070]">
                              {adv.staff_code} • {adv.department_name}
                            </div>
                          </td>
                        )}

                        {visibleColumns.has('branch_code') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f]',
                              densityStyles.cell
                            )}
                          >
                            <span className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono">
                              {adv.branch_code}
                            </span>
                          </td>
                        )}

                        {visibleColumns.has('advance_amount') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] text-right font-medium text-slate-900 dark:text-[#EDEDED] text-sm',
                              densityStyles.cell
                            )}
                          >
                            {formatINR(adv.advance_amount)}
                          </td>
                        )}

                        {visibleColumns.has('settled') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] text-right text-emerald-600 dark:text-[#3ecf8e] font-medium',
                              densityStyles.cell
                            )}
                          >
                            {formatINR(adv.bills_submitted_amount + adv.cash_returned_amount)}
                          </td>
                        )}

                        {visibleColumns.has('unsettled_balance') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] text-right font-medium text-amber-600 dark:text-amber-400 text-sm',
                              densityStyles.cell
                            )}
                          >
                            {formatINR(adv.unsettled_balance)}
                          </td>
                        )}

                        {visibleColumns.has('status') && (
                          <td
                            className={cn(
                              'border-r border-slate-100 dark:border-[#1f1f1f] text-center',
                              densityStyles.cell
                            )}
                          >
                            {adv.status === 'Settled_Bills' ||
                            adv.status === 'Settled_Cash' ||
                            adv.status === 'Cleared_Salary_Deduction' ? (
                              <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-200 dark:border-[#3ecf8e]/20">
                                Settled
                              </span>
                            ) : adv.status === 'Flagged_Salary_Deduction' ? (
                              <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                                Salary Cut ({adv.salary_deduction_month || 'Payroll'})
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-[4px] text-[10px] font-mono border',
                                  ageing.category === 'active_0_7'
                                    ? 'bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-200 dark:border-[#3ecf8e]/20'
                                    : ageing.category === 'due_8_14'
                                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                    : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                                )}
                              >
                                {ageing.label}
                              </span>
                            )}
                          </td>
                        )}

                        {visibleColumns.has('actions') && (
                          <td
                            className={cn('text-right whitespace-nowrap relative', densityStyles.cell)}
                            data-dropdown-id={adv.id}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {isUnsettled ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSettleTargetAdvance(adv)}
                                    className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-mono cursor-pointer transition-colors"
                                  >
                                    Settle
                                  </button>
                                  {ageing.isOverdue && adv.status === 'Active_Unsettled' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionModal({
                                          type: 'flag_salary',
                                          advance: adv,
                                          reason: '',
                                          month: 'March 2026 Payroll (25th)',
                                          isSubmitting: false,
                                        })
                                      }
                                      className="px-2 py-1 rounded-[6px] bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/25 text-xs transition-colors cursor-pointer font-mono"
                                      title="Flag for salary deduction"
                                    >
                                      Cut Salary
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs font-mono text-emerald-600 dark:text-[#3ecf8e] font-medium">
                                  Settled
                                </span>
                              )}

                              {/* View / Print Slip Button */}
                              <button
                                type="button"
                                onClick={() => setSelectedSlipAdvance(adv)}
                                title="View & Print Advance Slip (80mm Thermal)"
                                className="p-1 rounded text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#282828] transition-colors cursor-pointer"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>

                              {/* Dev context menu */}
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveRowDropdownId(isDropdownOpen ? null : adv.id)
                                }
                                title="Developer Tools"
                                className="p-1 rounded text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#282828] transition-colors cursor-pointer"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Context Dropdown with Smart Placement */}
                            {isDropdownOpen && (
                              <div
                                className={cn(
                                  'absolute right-2 w-48 rounded-[8px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#262626] shadow-2xl p-1 z-50 space-y-0.5 text-xs text-left font-mono animate-in fade-in zoom-in-95 duration-100',
                                  idx >= Math.max(1, paginatedAdvances.length - 2) ? 'bottom-8' : 'top-8'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSlipAdvance(adv);
                                    setActiveRowDropdownId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-800 dark:text-[#EDEDED] cursor-pointer"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-[#3ecf8e]" />
                                  <span>View / Print Slip</span>
                                </button>

                                {isUnsettled && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActionModal({
                                          type: 'flag_salary',
                                          advance: adv,
                                          reason: '',
                                          month: 'Current Month (25th Payroll)',
                                          isSubmitting: false,
                                        });
                                        setActiveRowDropdownId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-purple-50 dark:hover:bg-[#222222] text-purple-700 dark:text-purple-400 cursor-pointer"
                                    >
                                      <Flag className="w-3.5 h-3.5" />
                                      <span>Flag Salary Cut</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActionModal({
                                          type: 'waive',
                                          advance: adv,
                                          reason: '',
                                          month: '',
                                          isSubmitting: false,
                                        });
                                        setActiveRowDropdownId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-50 dark:hover:bg-[#222222] text-amber-700 dark:text-amber-400 cursor-pointer"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      <span>Waive Balance</span>
                                    </button>
                                  </>
                                )}

                                {(user?.role_code === 'Super_Admin' || user?.role_code === 'Store_Manager') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActionModal({
                                        type: 'delete',
                                        advance: adv,
                                        reason: '',
                                        month: '',
                                        isSubmitting: false,
                                      });
                                      setActiveRowDropdownId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Advance</span>
                                  </button>
                                )}

                                <div className="my-1 border-t border-slate-200 dark:border-[#262626]" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    copyToClipboard(adv.receipt_number, 'Receipt # copied');
                                    setActiveRowDropdownId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-800 dark:text-[#EDEDED] cursor-pointer"
                                >
                                  <Copy className="w-3 h-3 text-slate-400 dark:text-[#707070]" />
                                  <span>Copy Receipt #</span>
                                </button>

                                {isDeveloper && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        copyToClipboard(
                                          JSON.stringify(adv, null, 2),
                                          'Advance JSON copied'
                                        );
                                        setActiveRowDropdownId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-800 dark:text-[#EDEDED] cursor-pointer"
                                    >
                                      <Code className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                                      <span>Copy as JSON</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        copyToClipboard(
                                          generateAdvanceSqlInsert(adv),
                                          'SQL INSERT copied'
                                        );
                                        setActiveRowDropdownId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-800 dark:text-[#EDEDED] cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                                      <span>Copy as SQL</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {paginatedAdvances.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="p-0 border-none">
                        <EmptyState
                          icon={HandCoins}
                          title="No staff advance records found"
                          description={
                            search || statusFilter !== 'ALL' || selectedDept !== 'ALL'
                              ? 'No staff advances match your filter or search criteria. Try resetting filters or clearing search.'
                              : 'No staff advances issued for this showroom branch yet.'
                          }
                          actionLabel="Issue Staff Advance"
                          onAction={() => setAdvanceModalOpen(true)}
                          secondaryActionLabel={
                            search || statusFilter !== 'ALL' || selectedDept !== 'ALL'
                              ? 'Reset Filters'
                              : undefined
                          }
                          onSecondaryAction={
                            search || statusFilter !== 'ALL' || selectedDept !== 'ALL'
                              ? () => {
                                  setSearch('');
                                  setStatusFilter('ALL');
                                  setSelectedDept('ALL');
                                  setMinDue('');
                                  setMaxDue('');
                                }
                              : undefined
                          }
                          className="py-14"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="bg-slate-50 dark:bg-[#171717] border-t border-slate-200 dark:border-[#242424] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-3 text-slate-500 dark:text-[#707070] font-mono">
                <span>
                  Showing{' '}
                  <strong className="text-slate-900 dark:text-white">{filteredAdvances.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong>{' '}
                  to <strong className="text-slate-900 dark:text-white">{Math.min(currentPage * pageSize, filteredAdvances.length)}</strong> of{' '}
                  <strong className="text-slate-900 dark:text-white">{filteredAdvances.length}</strong> records
                </span>

                <div className="flex items-center gap-1.5 ml-2 w-24">
                  <span>Rows:</span>
                  <div className="flex-1">
                    <SearchableSelect
                      size="sm"
                      options={[
                        { value: '10', label: '10' },
                        { value: '15', label: '15' },
                        { value: '25', label: '25' },
                        { value: '50', label: '50' },
                      ]}
                      value={String(pageSize)}
                      onChange={(val) => setPageSize(Number(val))}
                      allowCustom={false}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-[4px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] hover:border-[#3ecf8e] text-slate-700 dark:text-[#EDEDED] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-xs text-slate-600 dark:text-[#A1A1A1]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-[4px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] hover:border-[#3ecf8e] text-slate-700 dark:text-[#EDEDED] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Sub-View: HR Payroll Sync & Salary Deduction Schedule */}
        {activeSubTab === 'salary_payroll' && (
          <div className="space-y-4">
            {/* Top Payroll Control & Metric Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500 dark:text-[#888888] uppercase tracking-wider">
                    Flagged for Deduction
                  </span>
                  <span className="p-1.5 rounded-[4px] bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Flag className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {formatINR(
                    advances
                      .filter((a) => a.status === 'Flagged_Salary_Deduction')
                      .reduce((s, a) => s + (Number(a.unsettled_balance) || 0), 0)
                  )}
                </div>
                <p className="text-[11px] font-mono text-slate-400 dark:text-[#707070] mt-1">
                  {advances.filter((a) => a.status === 'Flagged_Salary_Deduction').length} staff advances queued
                </p>
              </div>

              <div className="p-4 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500 dark:text-[#888888] uppercase tracking-wider">
                    30+ Day Overdue (Eligible)
                  </span>
                  <span className="p-1.5 rounded-[4px] bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                  {formatINR(
                    advances
                      .filter(
                        (a) =>
                          a.status === 'Active_Unsettled' &&
                          differenceInDays(new Date(), new Date(a.advance_date)) >= 30
                      )
                      .reduce((s, a) => s + (Number(a.unsettled_balance) || 0), 0)
                  )}
                </div>
                <p className="text-[11px] font-mono text-slate-400 dark:text-[#707070] mt-1">
                  {
                    advances.filter(
                      (a) =>
                        a.status === 'Active_Unsettled' &&
                        differenceInDays(new Date(), new Date(a.advance_date)) >= 30
                    ).length
                  }{' '}
                  unsettled over 30 days
                </p>
              </div>

              <div className="p-4 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500 dark:text-[#888888] uppercase tracking-wider">
                    Cleared via Payroll
                  </span>
                  <span className="p-1.5 rounded-[4px] bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-600 dark:text-[#3ecf8e]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-emerald-600 dark:text-[#3ecf8e]">
                  {formatINR(
                    advances
                      .filter((a) => a.status === 'Cleared_Salary_Deduction')
                      .reduce((s, a) => s + (Number(a.advance_amount) || 0), 0)
                  )}
                </div>
                <p className="text-[11px] font-mono text-slate-400 dark:text-[#707070] mt-1">
                  {advances.filter((a) => a.status === 'Cleared_Salary_Deduction').length} advances settled via HR
                </p>
              </div>
            </div>

            {/* Actions Bar & Cycle Selector */}
            <div className="p-4 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="w-64">
                  <label className="text-[10px] uppercase font-mono text-slate-400 dark:text-[#707070] block mb-1">
                    Payroll Deduction Cycle
                  </label>
                  <SearchableSelect
                    size="sm"
                    options={[
                      'March 2026 Payroll (25th)',
                      'April 2026 Payroll (25th)',
                      'May 2026 Payroll (25th)',
                      'June 2026 Payroll (25th)',
                    ]}
                    value={selectedPayrollMonth}
                    onChange={(val) => setSelectedPayrollMonth(val)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <button
                  type="button"
                  disabled={isPayrollProcessing}
                  onClick={handleAutoFlag30DayOverdues}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#333333] hover:border-amber-500 text-slate-700 dark:text-[#EDEDED] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Automatically flag all advances older than 30 days"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Auto-Flag 30+ Day Overdues</span>
                </button>

                <button
                  type="button"
                  disabled={selectedPayrollIds.size === 0 || isPayrollProcessing}
                  onClick={handleBatchClearPayrollDeductions}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] bg-purple-600 hover:bg-purple-700 text-white text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Mark Selected Cleared ({selectedPayrollIds.size})</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportHRPayrollCSV}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#34b27b] text-[#171717] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export HR Payroll CSV</span>
                </button>
              </div>
            </div>

            {/* Payroll Schedule Table */}
            <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414] overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#3ecf8e]" />
                  <h3 className="text-xs font-mono font-medium text-slate-900 dark:text-white">
                    HR Payroll Schedule — {selectedPayrollMonth}
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-[#888888]">
                  {advances.filter((a) => a.status === 'Flagged_Salary_Deduction' || (a.status === 'Active_Unsettled' && differenceInDays(new Date(), new Date(a.advance_date)) >= 15)).length} eligible advances
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#707070] font-mono text-xs">
                      <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200 dark:border-[#242424]">
                        <input
                          type="checkbox"
                          checked={
                            advances
                              .filter((a) => a.status === 'Flagged_Salary_Deduction')
                              .length > 0 &&
                            advances
                              .filter((a) => a.status === 'Flagged_Salary_Deduction')
                              .every((a) => selectedPayrollIds.has(a.id))
                          }
                          onChange={(e) => {
                            const flagged = advances.filter(
                              (a) => a.status === 'Flagged_Salary_Deduction'
                            );
                            if (e.target.checked) {
                              setSelectedPayrollIds(new Set(flagged.map((a) => a.id)));
                            } else {
                              setSelectedPayrollIds(new Set());
                            }
                          }}
                          className="rounded-[4px] border-slate-300 dark:border-[#383838] bg-white dark:bg-[#171717] text-[#3ecf8e] focus:ring-[#3ecf8e]"
                        />
                      </th>
                      <th className="py-2.5 px-3 border-r border-slate-200 dark:border-[#242424] w-28">
                        Receipt #
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424]">
                        Staff Member
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] w-28">
                        Advance Date
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center w-24">
                        Ageing
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-28">
                        Advance (₹)
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-28">
                        Settled (₹)
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-32 font-semibold">
                        Deduction Due (₹)
                      </th>
                      <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center w-40">
                        Status / Cycle
                      </th>
                      <th className="py-2.5 px-3 text-right w-28">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1f1f1f] font-mono">
                    {advances
                      .filter(
                        (a) =>
                          a.status === 'Flagged_Salary_Deduction' ||
                          (a.status === 'Active_Unsettled' &&
                            differenceInDays(new Date(), new Date(a.advance_date)) >= 15)
                      )
                      .map((adv) => {
                        const days = differenceInDays(new Date(), new Date(adv.advance_date));
                        const isFlagged = adv.status === 'Flagged_Salary_Deduction';
                        const isSelected = selectedPayrollIds.has(adv.id);

                        return (
                          <tr
                            key={adv.id}
                            className={cn(
                              'hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] transition-colors',
                              isSelected ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''
                            )}
                          >
                            <td className="py-2 px-3 text-center border-r border-slate-100 dark:border-[#1f1f1f]">
                              {isFlagged ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const next = new Set(selectedPayrollIds);
                                    if (next.has(adv.id)) next.delete(adv.id);
                                    else next.add(adv.id);
                                    setSelectedPayrollIds(next);
                                  }}
                                  className="rounded-[4px] border-slate-300 dark:border-[#383838] bg-white dark:bg-[#171717] text-[#3ecf8e] focus:ring-[#3ecf8e]"
                                />
                              ) : (
                                <span className="text-slate-300 dark:text-[#444444]">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-100 dark:border-[#1f1f1f] text-slate-800 dark:text-[#EDEDED] font-medium">
                              {adv.receipt_number}
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f]">
                              <div className="font-sans font-medium text-slate-900 dark:text-white">
                                {adv.staff_name}
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-[#707070]">
                                {adv.staff_code} • {adv.department_name}
                              </div>
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-slate-600 dark:text-[#A1A1A1]">
                              {formatDate(adv.advance_date)}
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-center">
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-[4px] text-[10px] font-mono',
                                  days >= 30
                                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                                )}
                              >
                                {days}d overdue
                              </span>
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right text-slate-900 dark:text-white tabular-nums">
                              {formatINR(adv.advance_amount)}
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right text-emerald-600 dark:text-[#3ecf8e] tabular-nums">
                              {formatINR(adv.bills_submitted_amount + adv.cash_returned_amount)}
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums text-sm">
                              {formatINR(adv.unsettled_balance)}
                            </td>
                            <td className="py-2 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-center">
                              {isFlagged ? (
                                <span className="px-2 py-0.5 rounded-[4px] text-[10px] bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                                  {adv.salary_deduction_month || selectedPayrollMonth}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-[4px] text-[10px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                                  Eligible for Cut
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {isFlagged ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedSlipAdvance(adv)}
                                  className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#222222]"
                                  title="View Slip"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-[#3ecf8e]" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionModal({
                                      type: 'flag_salary',
                                      advance: adv,
                                      reason: '',
                                      month: selectedPayrollMonth,
                                      isSubmitting: false,
                                    });
                                  }}
                                  className="px-2 py-1 rounded-[4px] bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 border border-purple-200 dark:border-purple-500/20 text-[11px]"
                                >
                                  Flag Cut
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                    {advances.filter(
                      (a) =>
                        a.status === 'Flagged_Salary_Deduction' ||
                        (a.status === 'Active_Unsettled' &&
                          differenceInDays(new Date(), new Date(a.advance_date)) >= 15)
                    ).length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-[#888888] font-sans">
                          <CheckCircle2 className="w-8 h-8 text-[#3ecf8e] mx-auto mb-2 opacity-80" />
                          <div className="font-medium text-slate-900 dark:text-white">
                            No overdue or flagged salary deductions
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            All staff advances are currently settled or within the normal advance cycle.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. Sub-View: By Staff Member */}
        {activeSubTab === 'analytics_staff' && (
          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414] overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-xs font-mono font-medium text-slate-900 dark:text-white">
                  Advances Aggregated by Staff Member ({staffMemberAnalytics.length} staff)
                </h3>
              </div>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-medium tabular-nums">
                Due: {formatINR(metrics.totalUnsettled)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#707070] font-mono text-xs">
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424]">
                      <span>staff_member</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424]">
                      <span>department</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center w-24">
                      <span>advance_count</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-32">
                      <span>total_given_inr</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-32">
                      <span>settled_inr</span>
                    </th>
                    <th className="py-2.5 px-3.5 text-right w-36">
                      <span>remaining_due_inr</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1f1f1f] font-mono">
                  {staffMemberAnalytics.map((st) => (
                    <tr
                      key={st.code}
                      onClick={() => {
                        setSearch(st.name);
                        setActiveSubTab('grid');
                      }}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] font-sans font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{st.name}</span>
                          <span className="text-xs font-mono text-slate-400 dark:text-[#707070]">({st.code})</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-slate-600 dark:text-[#A1A1A1] font-sans text-xs">
                        {st.dept}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-center text-slate-800 dark:text-[#EDEDED]">
                        {st.count}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatINR(st.totalReceived)}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right text-emerald-600 dark:text-[#3ecf8e] font-medium tabular-nums">
                        {formatINR(st.totalSettled)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                        {formatINR(st.unsettled)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. Sub-View: By Department */}
        {activeSubTab === 'analytics_dept' && (
          <div className="rounded-[12px] border border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414] overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#3ecf8e]" />
                <h3 className="text-xs font-mono font-medium text-slate-900 dark:text-white">
                  Advances Aggregated by Department ({departmentAnalytics.length} departments)
                </h3>
              </div>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-medium tabular-nums">
                Due: {formatINR(metrics.totalUnsettled)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#707070] font-mono text-xs">
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424]">
                      <span>department</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center w-24">
                      <span>advance_count</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-36">
                      <span>total_given_inr</span>
                    </th>
                    <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right w-36">
                      <span>settled_inr</span>
                    </th>
                    <th className="py-2.5 px-3.5 text-right w-36">
                      <span>remaining_due_inr</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1f1f1f] font-mono">
                  {departmentAnalytics.map((dept) => (
                    <tr
                      key={dept.dept}
                      onClick={() => {
                        setSelectedDept(dept.dept);
                        setActiveSubTab('grid');
                      }}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] font-sans font-medium text-slate-900 dark:text-white">
                        {dept.dept}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-center text-slate-800 dark:text-[#EDEDED]">
                        {dept.count}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatINR(dept.totalReceived)}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-100 dark:border-[#1f1f1f] text-right text-emerald-600 dark:text-[#3ecf8e] font-medium tabular-nums">
                        {formatINR(dept.totalSettled)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                        {formatINR(dept.unsettled)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. Action Confirmation Modal (Salary Deduction / Waive / Delete - iOS 16 Dialog) */}
        {actionModal.type && actionModal.advance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border border-slate-200/80 dark:border-white/15 rounded-[18px] shadow-2xl p-5 space-y-4 text-xs font-sans">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/10">
                <div
                  className={cn(
                    'flex items-center gap-2 font-mono font-medium',
                    actionModal.type === 'delete'
                      ? 'text-rose-600 dark:text-rose-400'
                      : actionModal.type === 'waive'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-purple-600 dark:text-purple-400'
                  )}
                >
                  {actionModal.type === 'delete' ? (
                    <Trash2 className="w-4 h-4" />
                  ) : actionModal.type === 'waive' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <Flag className="w-4 h-4" />
                  )}
                  <span>
                    {actionModal.type === 'delete'
                      ? 'Delete Advance Record'
                      : actionModal.type === 'waive'
                      ? 'Waive / Forgive Remaining Advance'
                      : 'Mark for Salary Deduction'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionModal({ type: null, advance: null, reason: '', month: '', isSubmitting: false })}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-[12px] bg-slate-50/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-500 dark:text-[#707070]">
                  <span>Staff:</span>
                  <span className="text-slate-900 dark:text-white font-sans font-medium">{actionModal.advance.staff_name}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-[#707070]">
                  <span>Advance Receipt:</span>
                  <span className="text-slate-900 dark:text-white">{actionModal.advance.receipt_number}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-[#707070]">
                  <span>Unsettled Amount:</span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold text-sm tabular-nums">{formatINR(actionModal.advance.unsettled_balance)}</span>
                </div>
              </div>

              <form onSubmit={handleActionSubmit} className="space-y-3">
                {actionModal.type === 'flag_salary' && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-[#A1A1A1] block font-mono">
                      Payroll Month for Deduction *
                    </label>
                    <SearchableSelect
                      options={[
                        'March 2026 Payroll (25th)',
                        'April 2026 Payroll (25th)',
                        'May 2026 Payroll (25th)',
                        'June 2026 Payroll (25th)',
                      ]}
                      value={actionModal.month}
                      onChange={(val) => setActionModal((prev) => ({ ...prev, month: val }))}
                      searchPlaceholder="Search payroll month..."
                    />
                  </div>
                )}

                {(actionModal.type === 'waive' || actionModal.type === 'delete') && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-[#A1A1A1] block font-mono">
                      {actionModal.type === 'waive'
                        ? 'Manager Approval / Waiver Justification *'
                        : 'Mandatory Reason for Audit Trail *'}
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={actionModal.reason}
                      onChange={(e) => setActionModal((prev) => ({ ...prev, reason: e.target.value }))}
                      placeholder={
                        actionModal.type === 'waive'
                          ? 'e.g. Approved by Showroom Director for festival bonus adjustment'
                          : 'e.g. Duplicate entry voided by Store Manager'
                      }
                      className="w-full bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 rounded-[10px] p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] resize-none font-mono shadow-2xs"
                    />
                  </div>
                )}

                {actionModal.error && (
                  <div className="p-2.5 rounded-[10px] bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-mono border border-rose-200 dark:border-rose-500/20">
                    {actionModal.error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setActionModal({ type: null, advance: null, reason: '', month: '', isSubmitting: false })}
                    className="px-3.5 py-2 rounded-[10px] bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-[#A1A1A1] border border-slate-200/80 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/15 hover:text-slate-900 dark:hover:text-white cursor-pointer font-sans text-xs font-medium transition-all ios-press"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionModal.isSubmitting}
                    className={cn(
                      'px-4 py-2 rounded-[10px] font-sans text-xs font-semibold cursor-pointer transition-all shadow-xs text-white ios-press',
                      actionModal.type === 'delete'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : actionModal.type === 'waive'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-purple-600 hover:bg-purple-700'
                    )}
                  >
                    {actionModal.isSubmitting
                      ? 'Processing...'
                      : actionModal.type === 'delete'
                      ? 'Confirm Deletion'
                      : actionModal.type === 'waive'
                      ? 'Confirm Waiver'
                      : 'Confirm Salary Deduction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Thermal Receipt Slip Modal (With Digital Touch Signature) */}
        {selectedSlipAdvance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md select-none font-sans overflow-y-auto">
            <div className="relative w-full max-w-md bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] rounded-[12px] p-6 shadow-2xl flex flex-col items-center space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between w-full pb-3 border-b border-slate-200 dark:border-[#282828]">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#3ecf8e]" />
                  <h3 className="text-sm font-mono font-medium text-slate-900 dark:text-white">
                    Advance Receipt #{selectedSlipAdvance.receipt_number}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSlipAdvance(null)}
                  className="p-1 rounded text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="w-full flex justify-center py-2">
                <ThermalReceiptSlip
                  data={{
                    title: 'Staff Advance Payout Slip',
                    storeName: 'Asopalav Silk & Sarees',
                    storeCode: selectedSlipAdvance.branch_code,
                    storeCity: 'Ahmedabad',
                    referenceNo: selectedSlipAdvance.receipt_number,
                    dateTime: formatDate(selectedSlipAdvance.advance_date),
                    cashierName: selectedSlipAdvance.disbursed_by_name || 'Cashier',
                    walletType:
                      selectedSlipAdvance.payment_method === 'Physical_Cash'
                        ? 'Physical_Cash'
                        : 'Online_UPI',
                    totalAmount: Number(selectedSlipAdvance.advance_amount) || 0,
                    items: [
                      {
                        label: 'Staff Member:',
                        value: `${selectedSlipAdvance.staff_name} (${selectedSlipAdvance.staff_code})`,
                        isBold: true,
                      },
                      {
                        label: 'Department:',
                        value: selectedSlipAdvance.department_name || 'Showroom',
                      },
                      {
                        label: 'Designation:',
                        value: selectedSlipAdvance.designation || 'Showroom Staff',
                      },
                      { label: 'Reason / Purpose:', value: selectedSlipAdvance.purpose },
                      {
                        label: 'Remaining Due:',
                        value: formatINR(selectedSlipAdvance.unsettled_balance),
                      },
                    ],
                    doubleEntry: {
                      dr: 'Staff Imprest Advance A/c',
                      cr:
                        selectedSlipAdvance.payment_method === 'Physical_Cash'
                          ? 'Cash Drawer A/c'
                          : 'Bank UPI A/c',
                    },
                    stampText:
                      selectedSlipAdvance.unsettled_balance === 0
                        ? 'SETTLED'
                        : selectedSlipAdvance.status === 'Flagged_Salary_Deduction'
                        ? 'SALARY CUT'
                        : 'GIVEN',
                    stampVariant:
                      selectedSlipAdvance.unsettled_balance === 0 ? 'approved' : 'injected',
                    signatureUrl: selectedSlipAdvance.signature_image_url || undefined,
                    signeeName: selectedSlipAdvance.staff_name,
                  }}
                  onPrint={() => window.print()}
                />
              </div>

              <div className="w-full pt-3 flex justify-end border-t border-slate-200 dark:border-[#282828]">
                <button
                  type="button"
                  onClick={() => setSelectedSlipAdvance(null)}
                  className="px-4 py-1.5 rounded-[6px] bg-slate-100 dark:bg-[#202020] text-slate-700 dark:text-[#A1A1A1] hover:bg-slate-200 dark:hover:bg-[#282828] hover:text-slate-900 dark:hover:text-white text-xs font-mono cursor-pointer transition-colors"
                >
                  Close Slip
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

