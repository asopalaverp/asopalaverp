import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ExpenseVoucher, ExpenseCategory, Department } from '@/types/database';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { formatINR, formatDate, cn, triggerHaptic } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Search,
  Plus,
  Filter,
  Receipt,
  Download,
  CheckSquare,
  Square,
  Eye,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  X,
  Sparkles,
  Layers,
  Banknote,
  Smartphone,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
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
  Maximize2,
  Minimize2,
  CornerDownRight,
  RotateCcw,
  Calendar,
  User,
  Tag,
  ShieldCheck,
  HandCoins,
  Coffee,
  Truck,
  Wrench,
  Store,
  Zap,
  PieChart,
  Wallet,
  CheckCircle2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { openExclusivePopover } from '@/lib/popoverManager';
import { erpService } from '@/lib/erpService';

const VoucherCategoryAvatar: React.FC<{ category?: string | null; className?: string }> = ({ category, className }) => {
  const cat = (category || '').toLowerCase();
  
  if (cat.includes('food') || cat.includes('meal') || cat.includes('tea') || cat.includes('snack') || cat.includes('welfare')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0", className)}>
        <Coffee className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  if (cat.includes('courier') || cat.includes('postage') || cat.includes('shipping') || cat.includes('delivery') || cat.includes('transport') || cat.includes('parcel')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-sky-500/10 dark:bg-sky-400/15 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0", className)}>
        <Truck className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  if (cat.includes('repair') || cat.includes('maintenance') || cat.includes('hardware') || cat.includes('civil') || cat.includes('upkeep')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0", className)}>
        <Wrench className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  if (cat.includes('electric') || cat.includes('power') || cat.includes('utility') || cat.includes('fuel') || cat.includes('petrol')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-yellow-500/10 dark:bg-yellow-400/15 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 flex items-center justify-center shrink-0", className)}>
        <Zap className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  if (cat.includes('staff') || cat.includes('advance') || cat.includes('salary') || cat.includes('bonus')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0", className)}>
        <HandCoins className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  if (cat.includes('shop') || cat.includes('vendor') || cat.includes('store') || cat.includes('purchase')) {
    return (
      <div className={cn("w-10 h-10 rounded-[10px] bg-purple-500/10 dark:bg-purple-400/15 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0", className)}>
        <Store className="w-5 h-5 stroke-[2]" />
      </div>
    );
  }
  return (
    <div className={cn("w-10 h-10 rounded-[10px] bg-slate-100 dark:bg-[#202020] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-zinc-300 flex items-center justify-center shrink-0", className)}>
      <Receipt className="w-5 h-5 stroke-[2]" />
    </div>
  );
};

interface VoucherTableProps {
  vouchers: ExpenseVoucher[];
  categories: ExpenseCategory[];
  departments: Department[];
  showActionBanner?: boolean;
  hideTelemetry?: boolean;
}

type SortField =
  | 'date'
  | 'amount'
  | 'voucher_number'
  | 'recipient_name'
  | 'category'
  | 'department'
  | 'method'
  | 'status';
type SortOrder = 'asc' | 'desc';
type ViewPreset = 'all' | 'cash' | 'upi' | 'high_value' | 'pending';
type TableDensity = 'compact' | 'normal' | 'relaxed';
type SubViewTab = 'grid' | 'analytics_category' | 'analytics_dept' | 'analytics_payee';

type ColumnKey =
  | 'voucher_number'
  | 'date'
  | 'recipient_name'
  | 'category_name'
  | 'department_name'
  | 'payment_method'
  | 'total_amount'
  | 'status'
  | 'actions';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'voucher_number', label: 'Bill No.' },
  { key: 'date', label: 'Date' },
  { key: 'recipient_name', label: 'Paid To' },
  { key: 'category_name', label: 'Category' },
  { key: 'department_name', label: 'Department' },
  { key: 'payment_method', label: 'Mode' },
  { key: 'total_amount', label: 'Amount (₹)' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Tools' },
];

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

export const VoucherTable: React.FC<VoucherTableProps> = ({
  vouchers,
  categories,
  departments,
  showActionBanner = true,
  hideTelemetry = false,
}) => {
  const { openDrawer, setActivePage } = useUIStore();
  const { user } = useAuthStore();
  const isDeveloper = user?.role_code === 'Developer' || user?.role_code === 'Super_Admin';

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<ViewPreset>('all');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // Sub-view tab
  const [activeSubTab, setActiveSubTab] = useState<SubViewTab>('grid');

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Selection & Focus State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Pro Developer Controls
  const [tableDensity, setTableDensity] = useState<TableDensity>('normal');
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set([
      'voucher_number',
      'date',
      'recipient_name',
      'category_name',
      'department_name',
      'payment_method',
      'total_amount',
      'status',
      'actions',
    ])
  );
  const [showTelemetryBar, setShowTelemetryBar] = useState(true);
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Popovers & Feedback State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [activeRowDropdownId, setActiveRowDropdownId] = useState<string | null>(null);
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);

  const categorySelectOptions = useMemo(() => [
    { value: 'ALL', label: `All Categories (${categories.length})` },
    ...categories.map((c) => ({ value: c.category_name, label: c.category_name })),
  ], [categories]);

  const departmentSelectOptions = useMemo(() => [
    { value: 'ALL', label: `All Departments (${departments.length})` },
    ...departments.map((d) => ({ value: d.department_name, label: d.department_name })),
  ], [departments]);

  const paymentModeSelectOptions = useMemo(() => [
    { value: 'ALL', label: 'All Payment Modes' },
    { value: 'Physical_Cash', label: 'Physical Cash' },
    { value: 'Online_UPI', label: 'Bank / UPI' },
  ], []);

  const statusSelectOptions = useMemo(() => [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Pending_Approval', label: 'Waiting Approval' },
    { value: 'Voided', label: 'Cancelled' },
  ], []);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const columnPickerRef = useRef<HTMLDivElement | null>(null);

  // Global mutual exclusivity dropdown listener
  useEffect(() => {
    const handleGlobalDropdownOpen = (e: Event) => {
      const customEvt = e as CustomEvent<string>;
      if (customEvt.detail !== 'voucher-export') {
        setIsExportMenuOpen(false);
      }
      if (customEvt.detail !== 'voucher-columns') {
        setIsColumnPickerOpen(false);
      }
      if (customEvt.detail !== 'voucher-row') {
        setActiveRowDropdownId(null);
      }
    };
    window.addEventListener('asopalav:dropdown-open', handleGlobalDropdownOpen);
    return () => window.removeEventListener('asopalav:dropdown-open', handleGlobalDropdownOpen);
  }, []);

  // Close popovers on outside click and ESC key
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

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsFilterOpen(false);
        setIsExportMenuOpen(false);
        setIsColumnPickerOpen(false);
        setActiveRowDropdownId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeRowDropdownId]);

  const handleToggleColumnPicker = () => {
    if (isColumnPickerOpen) {
      setIsColumnPickerOpen(false);
    } else {
      setIsFilterOpen(false);
      setIsExportMenuOpen(false);
      setActiveRowDropdownId(null);
      setIsColumnPickerOpen(true);
      openExclusivePopover('voucher-columns');
    }
  };

  const handleToggleFilter = () => {
    if (isFilterOpen) {
      setIsFilterOpen(false);
    } else {
      setIsColumnPickerOpen(false);
      setIsExportMenuOpen(false);
      setActiveRowDropdownId(null);
      setIsFilterOpen(true);
      openExclusivePopover('voucher-filter');
    }
  };

  const handleToggleExport = () => {
    if (isExportMenuOpen) {
      setIsExportMenuOpen(false);
    } else {
      setIsFilterOpen(false);
      setIsColumnPickerOpen(false);
      setActiveRowDropdownId(null);
      setIsExportMenuOpen(true);
      openExclusivePopover('voucher-export');
    }
  };

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
    setFocusedIndex(-1);
  }, [
    search,
    activeView,
    selectedCategory,
    selectedDept,
    selectedMode,
    selectedStatus,
    minAmount,
    maxAmount,
    pageSize,
  ]);

  // Copy helper with feedback
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setClipboardToast(label);
    setTimeout(() => setClipboardToast(null), 2500);
  }, []);

  // Sorting helper
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'amount' || field === 'date' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-primary shrink-0 stroke-[2.5]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary shrink-0 stroke-[2.5]" />
    );
  };

  // Filtered & Sorted Records
  const filteredVouchers = useMemo(() => {
    let result = [...vouchers];

    // Preset view filter
    if (activeView === 'cash') {
      result = result.filter((v) => v.payment_method === 'Physical_Cash');
    } else if (activeView === 'upi') {
      result = result.filter((v) => v.payment_method === 'Online_UPI');
    } else if (activeView === 'high_value') {
      result = result.filter((v) => (Number(v.total_amount) || 0) >= 10000 || v.is_high_value);
    } else if (activeView === 'pending') {
      result = result.filter((v) => v.status === 'Pending_Approval');
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.voucher_number.toLowerCase().includes(q) ||
          v.recipient_name?.toLowerCase().includes(q) ||
          v.category_name?.toLowerCase().includes(q) ||
          v.department_name?.toLowerCase().includes(q) ||
          v.remarks?.toLowerCase().includes(q) ||
          v.branch_code?.toLowerCase().includes(q)
      );
    }

    // Dropdown filters
    if (selectedCategory !== 'ALL') {
      result = result.filter((v) => v.category_name === selectedCategory);
    }
    if (selectedDept !== 'ALL') {
      result = result.filter((v) => v.department_name === selectedDept);
    }
    if (selectedMode !== 'ALL') {
      result = result.filter((v) => v.payment_method === selectedMode);
    }
    if (selectedStatus !== 'ALL') {
      result = result.filter((v) => (v.status || 'Approved') === selectedStatus);
    }

    // Amount range filter
    if (minAmount !== '' && !isNaN(Number(minAmount))) {
      result = result.filter((v) => (Number(v.total_amount) || 0) >= Number(minAmount));
    }
    if (maxAmount !== '' && !isNaN(Number(maxAmount))) {
      result = result.filter((v) => (Number(v.total_amount) || 0) <= Number(maxAmount));
    }

    // Sorting logic
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison =
          new Date(a.payment_date || '').getTime() - new Date(b.payment_date || '').getTime();
      } else if (sortField === 'amount') {
        comparison = (Number(a.total_amount) || 0) - (Number(b.total_amount) || 0);
      } else if (sortField === 'voucher_number') {
        comparison = a.voucher_number.localeCompare(b.voucher_number);
      } else if (sortField === 'recipient_name') {
        comparison = (a.recipient_name || '').localeCompare(b.recipient_name || '');
      } else if (sortField === 'category') {
        comparison = (a.category_name || '').localeCompare(b.category_name || '');
      } else if (sortField === 'department') {
        comparison = (a.department_name || '').localeCompare(b.department_name || '');
      } else if (sortField === 'method') {
        comparison = (a.payment_method || '').localeCompare(b.payment_method || '');
      } else if (sortField === 'status') {
        comparison = (a.status || 'Approved').localeCompare(b.status || 'Approved');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [
    vouchers,
    search,
    activeView,
    selectedCategory,
    selectedDept,
    selectedMode,
    selectedStatus,
    minAmount,
    maxAmount,
    sortField,
    sortOrder,
  ]);

  // Telemetry Aggregates
  const telemetry = useMemo(() => {
    const count = filteredVouchers.length;
    const totalAmount = filteredVouchers.reduce(
      (sum, v) => sum + (Number(v.total_amount) || 0),
      0
    );

    let min = count > 0 ? Infinity : 0;
    let max = 0;
    let cashSum = 0;
    let upiSum = 0;

    filteredVouchers.forEach((v) => {
      const amt = Number(v.total_amount) || 0;
      if (amt < min) min = amt;
      if (amt > max) max = amt;
      if (v.payment_method === 'Physical_Cash') cashSum += amt;
      else upiSum += amt;
    });

    if (min === Infinity) min = 0;

    const cashPercent = totalAmount > 0 ? Math.round((cashSum / totalAmount) * 100) : 0;
    const upiPercent = totalAmount > 0 ? Math.round((upiSum / totalAmount) * 100) : 0;

    return {
      count,
      totalAmount,
      min,
      max,
      cashSum,
      upiSum,
      cashPercent,
      upiPercent,
    };
  }, [filteredVouchers]);

  // Grouped Analytics Breakdowns
  const categoryAnalytics = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredVouchers.forEach((v) => {
      const cat = v.category_name || 'Uncategorized';
      const amt = Number(v.total_amount) || 0;
      const prev = map.get(cat) || { count: 0, total: 0 };
      map.set(cat, { count: prev.count + 1, total: prev.total + amt });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
        percentage: telemetry.totalAmount > 0 ? (data.total / telemetry.totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredVouchers, telemetry.totalAmount]);

  const departmentAnalytics = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredVouchers.forEach((v) => {
      const dept = v.department_name || 'General Operations';
      const amt = Number(v.total_amount) || 0;
      const prev = map.get(dept) || { count: 0, total: 0 };
      map.set(dept, { count: prev.count + 1, total: prev.total + amt });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
        percentage: telemetry.totalAmount > 0 ? (data.total / telemetry.totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredVouchers, telemetry.totalAmount]);

  const payeeAnalytics = useMemo(() => {
    const map = new Map<string, { count: number; total: number; category: string }>();
    filteredVouchers.forEach((v) => {
      const name = v.recipient_name || 'Cash Disbursal';
      const amt = Number(v.total_amount) || 0;
      const prev = map.get(name) || { count: 0, total: 0, category: v.category_name || 'General' };
      map.set(name, { count: prev.count + 1, total: prev.total + amt, category: prev.category });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        category: data.category,
        count: data.count,
        total: data.total,
        percentage: telemetry.totalAmount > 0 ? (data.total / telemetry.totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);
  }, [filteredVouchers, telemetry.totalAmount]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / pageSize));
  const paginatedVouchers = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredVouchers.slice(startIdx, startIdx + pageSize);
  }, [filteredVouchers, currentPage, pageSize]);

  // Grouped records by date for WhatsApp-style chat ledger stream
  const groupedMobileVouchers = useMemo(() => {
    const groups: Array<{ label: string; items: ExpenseVoucher[] }> = [];
    const map: Record<string, ExpenseVoucher[]> = {};
    const now = new Date();
    const todayStr = formatDate(now, 'yyyy-MM-dd');
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = formatDate(yesterday, 'yyyy-MM-dd');

    paginatedVouchers.forEach((v) => {
      const rawDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      let label = rawDate ? formatDate(rawDate, 'dd MMMM yyyy') : 'Recent';
      if (rawDate === todayStr) label = 'TODAY';
      else if (rawDate === yesterdayStr) label = 'YESTERDAY';

      if (!map[label]) {
        map[label] = [];
        groups.push({ label, items: map[label] });
      }
      map[label].push(v);
    });
    return groups;
  }, [paginatedVouchers]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllCurrentPage = () => {
    const pageIds = paginatedVouchers.map((v) => v.id);
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

  // Export handlers
  const getExportData = () => {
    return selectedIds.size > 0
      ? filteredVouchers.filter((v) => selectedIds.has(v.id))
      : filteredVouchers;
  };

  const handleExportCSV = () => {
    const list = getExportData();
    const csvContent =
      'Date,Voucher Number,Branch,Paid To,Category,Department,Payment Mode,Amount,Remarks,Status\n' +
      list
        .map(
          (v) =>
            `"${v.payment_date}","${v.voucher_number}","${v.branch_code}","${v.recipient_name}","${v.category_name}","${v.department_name}","${v.payment_method}","${v.total_amount}","${(v.remarks || '').replace(/"/g, '""')}","${v.status || 'Approved'}"`
        )
        .join('\n');
    downloadBlob(
      `Asopalav_Expenses_${new Date().toISOString().slice(0, 10)}.csv`,
      csvContent,
      'text/csv;charset=utf-8;'
    );
    setIsExportMenuOpen(false);
  };

  const handleExportJSON = () => {
    const list = getExportData();
    const jsonContent = JSON.stringify(list, null, 2);
    downloadBlob(
      `Asopalav_Expenses_${new Date().toISOString().slice(0, 10)}.json`,
      jsonContent,
      'application/json;charset=utf-8;'
    );
    setIsExportMenuOpen(false);
  };

  const handleExportTallyCSV = () => {
    const list = getExportData();
    const csvDataUri = erpService.generateTallyExportCSV(list);
    const cleanCsv = csvDataUri.replace(/^data:text\/csv;charset=utf-8,/, '');
    downloadBlob(
      `Asopalav_Tally_Prime_Export_${new Date().toISOString().slice(0, 10)}.csv`,
      cleanCsv,
      'text/csv;charset=utf-8;'
    );
    setIsExportMenuOpen(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing inside an input/select/textarea, ignore global single keys unless ESC
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive =
        activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (isFilterOpen) setIsFilterOpen(false);
        if (isExportMenuOpen) setIsExportMenuOpen(false);
        if (isColumnPickerOpen) setIsColumnPickerOpen(false);
        if (activeRowDropdownId) setActiveRowDropdownId(null);
        if (search) setSearch('');
        return;
      }

      if (isInputActive) return;

      if (activeSubTab === 'grid' && paginatedVouchers.length > 0) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1 >= paginatedVouchers.length ? 0 : prev + 1));
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 < 0 ? paginatedVouchers.length - 1 : prev - 1));
        } else if (e.key === ' ' && focusedIndex >= 0) {
          e.preventDefault();
          const targetVoucher = paginatedVouchers[focusedIndex];
          if (targetVoucher) handleToggleSelect(targetVoucher.id);
        } else if (e.key === 'Enter' && focusedIndex >= 0) {
          e.preventDefault();
          const targetVoucher = paginatedVouchers[focusedIndex];
          if (targetVoucher) openDrawer(targetVoucher);
        } else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          setIsExportMenuOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFilterOpen,
    isExportMenuOpen,
    isColumnPickerOpen,
    activeRowDropdownId,
    search,
    activeSubTab,
    paginatedVouchers,
    focusedIndex,
    openDrawer,
  ]);

  const activeFilterCount =
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (selectedDept !== 'ALL' ? 1 : 0) +
    (selectedMode !== 'ALL' ? 1 : 0) +
    (selectedStatus !== 'ALL' ? 1 : 0) +
    (minAmount !== '' ? 1 : 0) +
    (maxAmount !== '' ? 1 : 0) +
    (activeView !== 'all' ? 1 : 0);

  const isAllCurrentPageSelected =
    paginatedVouchers.length > 0 && paginatedVouchers.every((v) => selectedIds.has(v.id));

  const toggleColumn = (key: ColumnKey) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setVisibleColumns(next);
  };

  // Density styling tokens
  const densityStyles = {
    compact: {
      header: 'py-2 px-2.5 text-[10px]',
      cell: 'py-1.5 px-2.5 text-xs',
      avatar: 'w-5 h-5',
    },
    normal: {
      header: 'py-3 px-3.5 text-[11px]',
      cell: 'py-2.5 px-3.5 text-xs',
      avatar: 'w-6 h-6',
    },
    relaxed: {
      header: 'py-3.5 px-4 text-xs',
      cell: 'py-3.5 px-4 text-sm',
      avatar: 'w-7 h-7',
    },
  }[tableDensity];

  return (
    <div
      ref={tableContainerRef}
      className="w-full space-y-3 font-sans select-none outline-none"
      tabIndex={0}
    >
      {/* ========================================================================= */}
      {/* 1. TOAST NOTIFICATION FOR CLIPBOARD ACTIONS                              */}
      {/* ========================================================================= */}
      {clipboardToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-[6px] bg-[#171717] text-white border border-[#2e2e2e] shadow-level-3 animate-in fade-in slide-in-from-bottom-3 duration-200 text-xs font-mono">
          <Check className="w-3.5 h-3.5 text-primary stroke-[2.5]" />
          <span>{clipboardToast}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. REAL-TIME TELEMETRY & LIVE FINANCIAL ANALYTICS BAR                     */}
      {/* ========================================================================= */}
      {!hideTelemetry && showTelemetryBar && (
        <div className="hidden lg:block rounded-[14px] bg-white/90 dark:bg-[#18181a]/90 border border-slate-200/80 dark:border-white/10 p-3.5 shadow-xs space-y-2.5 ios-card">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200/70 dark:border-white/10">
            {/* Metrics Ribbon */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-[#8e8e93]">Total:</span>
                <span className="font-bold text-emerald-600 dark:text-primary text-sm tabular-nums">
                  {formatINR(telemetry.totalAmount)}
                </span>
              </div>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-[#8e8e93]">Highest:</span>
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {formatINR(telemetry.max)}
                </span>
              </div>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-[#8e8e93]">Range:</span>
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {formatINR(telemetry.min)} - {formatINR(telemetry.max)}
                </span>
              </div>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-[#8e8e93]">Bills:</span>
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {telemetry.count}
                </span>
              </div>
            </div>

            {/* Sub-View Mode Switcher */}
            <div className="inline-flex rounded-[8px] p-0.5 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08]">
              {[
                { id: 'grid', label: 'Ledger', icon: Layers },
                { id: 'analytics_category', label: 'By Category', icon: BarChart3 },
                { id: 'analytics_dept', label: 'By Dept', icon: Building2 },
                { id: 'analytics_payee', label: 'Top Payees', icon: Users },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSubTab(tab.id as SubViewTab)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-sans transition-all cursor-pointer font-medium ios-press',
                      isActive
                        ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white font-semibold shadow-xs border border-slate-200/80 dark:border-[#383838]'
                        : 'text-slate-500 dark:text-[#8e8e93] hover:text-slate-900 dark:hover:text-white border border-transparent'
                    )}
                  >
                    <Icon className={cn('w-3 h-3', isActive ? 'text-[#3ecf8e]' : 'opacity-70')} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash vs UPI Ratio Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-[#8e8e93]">
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <Banknote className="w-3 h-3" />
                Cash: {telemetry.cashPercent}% ({formatINR(telemetry.cashSum)})
              </span>
              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                <Smartphone className="w-3 h-3" />
                UPI: {telemetry.upiPercent}% ({formatINR(telemetry.upiSum)})
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden bg-black/[0.04] dark:bg-white/[0.06] flex border border-black/[0.04] dark:border-white/[0.06]">
              <div
                className="bg-amber-500 transition-all duration-300"
                style={{ width: `${telemetry.cashPercent}%` }}
                title={`Cash: ${telemetry.cashPercent}%`}
              />
              <div
                className="bg-sky-500 transition-all duration-300"
                style={{ width: `${telemetry.upiPercent}%` }}
                title={`UPI: ${telemetry.upiPercent}%`}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ENTERPRISE ADVANCED TOOLBAR (Controls, Filters, Pro Dev Tools)           */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-[14px] bg-white/90 dark:bg-[#18181a]/90 border border-slate-200/80 dark:border-white/10 shadow-xs ios-card">
        {/* Left: Sub-View Mode Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <div className="inline-flex rounded-[8px] p-0.5 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] shrink-0">
            {[
              { id: 'grid', label: 'Ledger', icon: Layers },
              { id: 'analytics_category', label: 'By Category', icon: PieChart },
              { id: 'analytics_dept', label: 'By Dept', icon: Building2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as SubViewTab)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-sans transition-all cursor-pointer font-medium ios-press',
                    isActive
                      ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white font-semibold shadow-xs border border-slate-200/80 dark:border-[#383838]'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                  )}
                >
                  <Icon
                    className={cn('w-3 h-3', isActive ? 'text-primary' : 'opacity-70')}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Search, Multi-Filter, Column Picker, Pro Export Menu, Action CTA */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-52">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search expense vouchers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bills..."
              className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-9 pr-7 h-10 min-h-[40px] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 w-full transition-all font-sans shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Advanced Multi-Filter Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 h-10 min-h-[40px] rounded-[6px] text-xs font-semibold font-sans border transition-all cursor-pointer shadow-2xs',
                isFilterOpen || activeFilterCount > 0
                  ? 'bg-[#3ecf8e]/15 text-emerald-800 dark:text-[#3ecf8e] border-[#3ecf8e]/40 font-semibold'
                  : 'bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-900 dark:text-zinc-200 border-slate-200 dark:border-[#282828]'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#3ecf8e] text-[#171717] text-[10px] font-mono flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Column Picker Popover */}
          <div className="hidden sm:block relative" ref={columnPickerRef}>
            <button
              type="button"
              onClick={handleToggleColumnPicker}
              title="Manage Columns"
              className="flex items-center gap-1.5 px-3 h-10 min-h-[40px] rounded-[6px] bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] text-xs font-semibold font-sans text-slate-900 dark:text-white border border-slate-200 dark:border-[#282828] cursor-pointer shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
              <span>Columns</span>
            </button>

            {isColumnPickerOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-[8px] bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] shadow-xl p-3 z-40 space-y-2 text-xs font-sans">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#282828]">
                  <span className="font-medium text-slate-900 dark:text-white">Visible Columns</span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400">
                    {visibleColumns.size}/{ALL_COLUMNS.length}
                  </span>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {ALL_COLUMNS.map((col) => {
                    const isChecked = visibleColumns.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 p-1.5 rounded-[4px] hover:bg-slate-100 dark:hover:bg-[#282828] cursor-pointer text-slate-900 dark:text-zinc-200 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded text-primary focus:ring-0 cursor-pointer"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Pro Developer & Data Export Menu (Desktop Only) */}
          <div className="hidden lg:block relative" ref={exportRef}>
            <button
              type="button"
              onClick={handleToggleExport}
              className="flex items-center gap-1.5 px-3 h-10 min-h-[40px] rounded-[6px] bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] text-xs font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-[#282828] transition-colors cursor-pointer font-sans shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-[8px] bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] shadow-xl p-1.5 z-40 space-y-1 text-xs font-sans">
                <div className="px-2.5 py-1 text-[10px] font-mono text-slate-400 dark:text-zinc-400 uppercase border-b border-slate-200 dark:border-[#282828]">
                  Export {selectedIds.size > 0 ? `Selected (${selectedIds.size})` : `All (${filteredVouchers.length})`}
                </div>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-[6px] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-900 dark:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    <span>Export CSV Spreadsheet</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400">.csv</span>
                </button>

                {isDeveloper && (
                  <>
                    <button
                      type="button"
                      onClick={handleExportJSON}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-[6px] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-900 dark:text-white cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-sky-500" />
                        <span>Export JSON Dataset</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400">.json</span>
                    </button>

                  </>
                )}

                <button
                  type="button"
                  onClick={handleExportTallyCSV}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-[6px] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-900 dark:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-500" />
                    <span>Export Tally Prime (CSV)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400">.csv</span>
                </button>

                <div className="pt-1 border-t border-slate-200 dark:border-[#282828]">
                  <button
                    type="button"
                    onClick={() => {
                      window.print();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-[6px] hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-900 dark:text-white cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                    <span>Print Ledger Sheet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Primary Create New Voucher CTA (Desktop Only) */}
          {showActionBanner && (
            <button
              type="button"
              onClick={() => setActivePage('new-voucher')}
              className="hidden lg:flex items-center gap-1.5 px-4 h-10 min-h-[40px] rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold transition-colors cursor-pointer font-sans shadow-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Record Expense</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3.1 DESKTOP INLINE COLLAPSIBLE FILTER RIBBON (lg:+)                       */}
      {/* ========================================================================= */}
      {isFilterOpen && (
        <div className="hidden lg:block p-4 rounded-[12px] bg-slate-50/80 dark:bg-[#181818] border border-slate-200 dark:border-[#2a2a2a] shadow-xs space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#242424]">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-primary" />
              <span className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                Filter Bills
              </span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-primary/15 text-emerald-700 dark:text-primary font-bold">
                  {activeFilterCount} active
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setSelectedDept('ALL');
                    setSelectedMode('ALL');
                    setSelectedStatus('ALL');
                    setMinAmount('');
                    setMaxAmount('');
                    setActiveView('all');
                  }}
                  className="text-xs font-mono text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:underline cursor-pointer flex items-center gap-1 px-2 py-1 rounded-[4px] hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="p-1 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#282828] transition-colors cursor-pointer"
                title="Close filter ribbon"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {/* Amount Range */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-500 dark:text-gray-400 block font-medium">
                Amount Range (₹)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  placeholder="Min ₹"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="w-full h-10 min-h-[40px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-mono shadow-2xs"
                />
                <input
                  type="number"
                  placeholder="Max ₹"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="w-full h-10 min-h-[40px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-mono shadow-2xs"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-500 dark:text-gray-400 block font-medium">
                Category
              </label>
              <SearchableSelect
                size="sm"
                options={categorySelectOptions}
                value={selectedCategory}
                onChange={setSelectedCategory}
                placeholder="All Categories"
                searchPlaceholder="Search category..."
                allowCustom={false}
              />
            </div>

            {/* Department */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-500 dark:text-gray-400 block font-medium">
                Department
              </label>
              <SearchableSelect
                size="sm"
                options={departmentSelectOptions}
                value={selectedDept}
                onChange={setSelectedDept}
                placeholder="All Departments"
                searchPlaceholder="Search department..."
                allowCustom={false}
              />
            </div>

            {/* Payment Mode */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-500 dark:text-gray-400 block font-medium">
                Payment Mode
              </label>
              <SearchableSelect
                size="sm"
                options={paymentModeSelectOptions}
                value={selectedMode}
                onChange={setSelectedMode}
                placeholder="All Payment Modes"
                searchPlaceholder="Search payment mode..."
                allowCustom={false}
              />
            </div>

            {/* Approval Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-500 dark:text-gray-400 block font-medium">
                Approval Status
              </label>
              <SearchableSelect
                size="sm"
                options={statusSelectOptions}
                value={selectedStatus}
                onChange={setSelectedStatus}
                placeholder="All Statuses"
                searchPlaceholder="Search status..."
                allowCustom={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3.2 MOBILE FIXED BOTTOM SHEET MODAL (< lg)                                */}
      {/* ========================================================================= */}
      {isFilterOpen && (
        <div className="lg:hidden">
          <div
            onClick={() => setIsFilterOpen(false)}
            className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-md z-50 transition-opacity animate-in fade-in duration-200"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 max-h-[88vh] rounded-t-[28px] bg-white dark:bg-[#181818] border-t border-slate-200/90 dark:border-[#2e2e2e] shadow-2xl z-50 font-sans p-5 sm:p-6 pb-8 overflow-y-auto overscroll-contain space-y-5 animate-in slide-in-from-bottom duration-250"
          >
            {/* Android M3 Top Drag Handle */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto -mt-1 mb-2" />

            {/* Header with Title & Reset */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-[#282828]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center">
                  <SlidersHorizontal className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white font-sans tracking-tight">
                    Advanced Filters
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Filter by amount range, category, department & status
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedCategory('ALL');
                      setSelectedDept('ALL');
                      setSelectedMode('ALL');
                      setSelectedStatus('ALL');
                      setMinAmount('');
                      setMaxAmount('');
                      setActiveView('all');
                    }}
                    className="text-xs font-sans font-medium text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:underline cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-rose-50/60 dark:bg-rose-950/20 active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-3 h-3 stroke-[2.2]" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#242424] hover:bg-slate-200 dark:hover:bg-[#2c2c2c] text-slate-600 dark:text-zinc-300 flex items-center justify-center cursor-pointer transition-colors active:scale-90"
                  aria-label="Close filters"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Field 1: Amount Range with Numeric Keypad Support */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-sans flex items-center gap-1.5">
                <span className="font-mono text-emerald-600 dark:text-[#3ecf8e] text-sm">₹</span>
                <span>Amount Range (INR)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 font-mono text-xs font-medium pointer-events-none">
                    Min ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-14 pr-3.5 h-10 min-h-[40px] text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 transition-all shadow-2xs"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 font-mono text-xs font-medium pointer-events-none">
                    Max ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="50,000"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-14 pr-3.5 h-10 min-h-[40px] text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 transition-all shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* Field 2: Expense Category */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-sans flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Expense Category</span>
              </label>
              <SearchableSelect
                size="lg"
                options={categorySelectOptions}
                value={selectedCategory}
                onChange={setSelectedCategory}
                placeholder="All Categories"
                searchPlaceholder="Search category..."
                allowCustom={false}
              />
            </div>

            {/* Field 3: Department */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-sans flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Department</span>
              </label>
              <SearchableSelect
                size="lg"
                options={departmentSelectOptions}
                value={selectedDept}
                onChange={setSelectedDept}
                placeholder="All Departments"
                searchPlaceholder="Search department..."
                allowCustom={false}
              />
            </div>

            {/* Field 4: Payment Mode (Android Material 3 Quick-Tap Chips) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-sans flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-slate-400" />
                <span>Payment Mode</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'ALL', label: 'All Modes' },
                  { id: 'Physical_Cash', label: 'Cash' },
                  { id: 'Online_UPI', label: 'Bank / UPI' },
                ].map((m) => {
                  const isSel = selectedMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedMode(m.id);
                      }}
                      className={cn(
                        'min-h-[46px] px-3 py-2 rounded-[10px] text-xs font-medium font-sans border transition-all cursor-pointer flex items-center justify-center text-center select-none active:scale-95',
                        isSel
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-[#3ecf8e] font-semibold ring-1 ring-emerald-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-[#202020] border-slate-200 dark:border-[#333] text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-[#444]'
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Field 5: Approval Status (Android Material 3 Quick-Tap Chips) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-sans flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Approval Status</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'Approved', label: 'Approved' },
                  { id: 'Pending_Approval', label: 'Pending' },
                ].map((st) => {
                  const isSel = selectedStatus === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedStatus(st.id);
                      }}
                      className={cn(
                        'min-h-[46px] px-3 py-2 rounded-[10px] text-xs font-medium font-sans border transition-all cursor-pointer flex items-center justify-center text-center select-none active:scale-95',
                        isSel
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-[#3ecf8e] font-semibold ring-1 ring-emerald-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-[#202020] border-slate-200 dark:border-[#333] text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-[#444]'
                      )}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sticky Apply Filters CTA */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#282828] sticky bottom-0 bg-white/95 dark:bg-[#181818]/95 backdrop-blur-md -mx-5 px-5 -mb-2 pb-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setIsFilterOpen(false);
                }}
                className="w-full py-3.5 min-h-[52px] rounded-[14px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#141414] font-semibold text-sm cursor-pointer shadow-lg shadow-emerald-950/15 dark:shadow-[#3ecf8e]/15 transition-all flex items-center justify-center gap-2 font-sans active:scale-[0.98] select-none"
              >
                <span>Apply Filters ({filteredVouchers.length} matches)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FLOATING BATCH SELECTION DOCK (When Rows Selected)                    */}
      {/* ========================================================================= */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-[8px] bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-slate-900 dark:text-white shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 text-xs font-medium font-sans">
            <span className="w-6 h-6 rounded-full bg-[#3ecf8e] text-[#171717] font-mono text-xs flex items-center justify-center font-medium">
              {selectedIds.size}
            </span>
            <span>
              {selectedIds.size} expense{selectedIds.size > 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-[6px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] text-xs font-sans text-slate-900 dark:text-white hover:border-primary transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="px-3 py-1.5 rounded-[6px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] text-xs font-sans text-slate-900 dark:text-white hover:border-primary transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Code className="w-3.5 h-3.5 text-sky-500" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="px-2.5 py-1.5 rounded-[6px] text-xs font-sans text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ACTIVE SUB-VIEW CONTENT (Grid vs Analytics Breakdowns)                */}
      {/* ========================================================================= */}
      {activeSubTab === 'grid' && (
        <div className="rounded-[8px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#161616] overflow-hidden shadow-2xs">
          {/* Mobile Card Feed (< lg when mobileViewMode === 'cards') */}
          {mobileViewMode === 'cards' && (
            <div className="lg:hidden p-2 space-y-3">
              {groupedMobileVouchers.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  {/* Studio Sticky Date Divider Pill */}
                  <div className="flex justify-center my-1.5 sticky top-14 z-10">
                    <span className="px-2.5 py-0.5 rounded-[4px] text-[10px] font-semibold font-mono tracking-wider uppercase bg-slate-100 dark:bg-[#202020] text-slate-600 dark:text-zinc-300 border border-slate-200/80 dark:border-[#2a2a2a] shadow-2xs">
                      {group.label}
                    </span>
                  </div>

                  {/* Group Items */}
                  <div className="space-y-1.5">
                    {group.items.map((v) => {
                      const isSelected = selectedIds.has(v.id);
                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            triggerHaptic('light');
                            openDrawer(v);
                          }}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-[8px] bg-white dark:bg-[#181818] border border-slate-200/80 dark:border-[#282828] hover:border-emerald-500/40 active:scale-[0.99] transition-all cursor-pointer shadow-2xs gap-3 select-none min-h-[56px]',
                            isSelected && 'ring-1 ring-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20'
                          )}
                        >
                          {/* Left: Category Avatar */}
                          <VoucherCategoryAvatar category={v.category_name} />

                          {/* Center: Payee Name, Category, Timestamp, Mode */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                {v.recipient_name || 'General Expense'}
                              </h4>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate font-sans">
                              <span>{v.category_name}</span>
                              <span>•</span>
                              <span className="font-mono text-[10px]">{formatDate(v.payment_date, 'HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-[4px] bg-slate-100 dark:bg-[#222222] text-slate-600 dark:text-zinc-300 font-mono text-[10px] font-medium border border-slate-200/80 dark:border-[#2a2a2a]">
                                {v.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI'}
                              </span>
                              {v.branch_code && (
                                <span className="px-1.5 py-0.2 rounded-[4px] bg-slate-100 dark:bg-[#222222] text-slate-500 dark:text-zinc-400 font-mono text-[10px] border border-slate-200/80 dark:border-[#2a2a2a]">
                                  {v.branch_code}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                                #{v.voucher_number}
                              </span>
                            </div>
                          </div>

                          {/* Right: Tabular Amount & Status */}
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                              -{formatINR(v.total_amount)}
                            </span>
                            <span
                              className={cn(
                                'px-2 py-0.2 rounded-[4px] text-[10px] font-mono border font-medium',
                                v.status === 'Approved' || !v.status
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-500/20'
                                  : v.status === 'Voided'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              )}
                            >
                              {v.status === 'Pending_Approval'
                                ? 'Waiting'
                                : v.status === 'Voided'
                                ? 'Cancelled'
                                : 'Approved'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {paginatedVouchers.length === 0 && (
                <EmptyState
                  icon={Receipt}
                  title="No expense vouchers found"
                  description="No records match your active search or filters."
                  actionLabel="Record Expense Voucher"
                  onAction={() => setActivePage('new-voucher')}
                  className="py-8"
                />
              )}
            </div>
          )}

          {/* Desktop / Full Table View */}
          <div className={cn(mobileViewMode === 'cards' ? 'hidden lg:block' : 'block', 'overflow-x-auto min-h-[320px]')}>
            <table className="w-full text-left border-collapse text-xs">
              {/* Interactive Sortable Header */}
              <thead>
                <tr className="bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#2e2e2e] text-slate-700 dark:text-gray-300 font-sans font-semibold select-none">
                  {/* Selection Checkbox */}
                  <th
                    className={cn(
                      'w-11 border-r border-slate-200 dark:border-[#2e2e2e] text-center',
                      densityStyles.header
                    )}
                  >
                    <button
                      type="button"
                      onClick={handleSelectAllCurrentPage}
                      aria-label="Select all rows on current page"
                      className="cursor-pointer text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center"
                    >
                      {isAllCurrentPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>

                  {/* Voucher # */}
                  {visibleColumns.has('voucher_number') && (
                    <th
                      onClick={() => handleSort('voucher_number')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Bill #</span>
                        {getSortIcon('voucher_number')}
                      </div>
                    </th>
                  )}

                  {/* Date */}
                  {visibleColumns.has('date') && (
                    <th
                      onClick={() => handleSort('date')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors w-32',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Date</span>
                        {getSortIcon('date')}
                      </div>
                    </th>
                  )}

                  {/* Recipient / Vendor */}
                  {visibleColumns.has('recipient_name') && (
                    <th
                      onClick={() => handleSort('recipient_name')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Paid To</span>
                        {getSortIcon('recipient_name')}
                      </div>
                    </th>
                  )}

                  {/* Category */}
                  {visibleColumns.has('category_name') && (
                    <th
                      onClick={() => handleSort('category')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Category</span>
                        {getSortIcon('category')}
                      </div>
                    </th>
                  )}

                  {/* Department */}
                  {visibleColumns.has('department_name') && (
                    <th
                      onClick={() => handleSort('department')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Department</span>
                        {getSortIcon('department')}
                      </div>
                    </th>
                  )}

                  {/* Payment Mode */}
                  {visibleColumns.has('payment_method') && (
                    <th
                      onClick={() => handleSort('method')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Mode</span>
                        {getSortIcon('method')}
                      </div>
                    </th>
                  )}

                  {/* Amount */}
                  {visibleColumns.has('total_amount') && (
                    <th
                      onClick={() => handleSort('amount')}
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors w-32',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Amount (₹)</span>
                        {getSortIcon('amount')}
                      </div>
                    </th>
                  )}

                  {/* Status */}
                  {visibleColumns.has('status') && (
                    <th
                      className={cn(
                        'border-r border-slate-200 dark:border-[#242424] text-center w-28',
                        densityStyles.header
                      )}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono text-slate-800 dark:text-white font-medium">Status</span>
                      </div>
                    </th>
                  )}

                  {/* Actions */}
                  {visibleColumns.has('actions') && (
                    <th className={cn('text-center w-20 select-none font-mono text-slate-400 dark:text-[#737373]', densityStyles.header)}>
                      <span>Tools</span>
                    </th>
                  )}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200 dark:divide-[#242424] font-mono">
                {paginatedVouchers.map((v, idx) => {
                  const isSelected = selectedIds.has(v.id);
                  const isFocused = focusedIndex === idx;
                  const isDropdownOpen = activeRowDropdownId === v.id;

                  return (
                    <tr
                      key={v.id}
                      onClick={() => openDrawer(v)}
                      className={cn(
                        'group transition-colors duration-100 cursor-pointer select-none',
                        isSelected
                          ? 'bg-emerald-50 hover:bg-emerald-100/60 dark:bg-primary/10 dark:hover:bg-primary/15'
                          : isFocused
                          ? 'bg-slate-100 dark:bg-[#242424] ring-1 ring-inset ring-primary/40'
                          : 'hover:bg-slate-50 dark:hover:bg-[#202020]'
                      )}
                    >
                      {/* Selection Checkbox */}
                      <td
                        className={cn(
                          'border-r border-slate-200 dark:border-[#242424] text-center',
                          densityStyles.cell
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(v.id);
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Select receipt ${v.voucher_number}`}
                          className="cursor-pointer text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white inline-flex items-center justify-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 hover:text-slate-700" />
                          )}
                        </button>
                      </td>

                      {/* Voucher Number */}
                      {visibleColumns.has('voucher_number') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] font-semibold text-emerald-700 dark:text-primary',
                            densityStyles.cell
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 shrink-0 opacity-75" />
                            <span>{v.voucher_number}</span>
                          </div>
                        </td>
                      )}

                      {/* Date */}
                      {visibleColumns.has('date') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-slate-700 dark:text-gray-300 tabular-nums font-medium',
                            densityStyles.cell
                          )}
                        >
                          {formatDate(v.payment_date)}
                        </td>
                      )}

                      {/* Recipient / Vendor */}
                      {visibleColumns.has('recipient_name') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] font-sans font-semibold text-slate-900 dark:text-white',
                            densityStyles.cell
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate max-w-[180px]">{v.recipient_name}</span>
                            {v.bill_photo_urls && v.bill_photo_urls.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDrawer(v);
                                }}
                                title="View Attached Bill Photo"
                                aria-label={`View bill photo for ${v.voucher_number}`}
                                className="p-1 rounded text-emerald-600 dark:text-primary hover:bg-emerald-50 dark:hover:bg-primary/10 transition-colors ml-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Category */}
                      {visibleColumns.has('category_name') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-slate-700 dark:text-gray-300 font-sans',
                            densityStyles.cell
                          )}
                        >
                          <span className="inline-block px-2 py-0.5 rounded-[4px] badge-status-neutral text-[11px] font-medium font-sans">
                            {v.category_name}
                          </span>
                        </td>
                      )}

                      {/* Department */}
                      {visibleColumns.has('department_name') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-slate-600 dark:text-gray-400 font-sans text-xs',
                            densityStyles.cell
                          )}
                        >
                          {v.department_name || 'General'}
                        </td>
                      )}

                      {/* Payment Mode */}
                      {visibleColumns.has('payment_method') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-xs',
                            densityStyles.cell
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-medium">
                            {v.payment_method === 'Physical_Cash' ? (
                              <>
                                <Banknote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 shrink-0" />
                                <span className="text-slate-800 dark:text-gray-300">Physical Cash</span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3.5 h-3.5 text-sky-600 dark:text-sky-500 shrink-0" />
                                <span className="text-slate-800 dark:text-gray-300">Bank / UPI</span>
                              </>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Amount */}
                      {visibleColumns.has('total_amount') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-right font-bold text-slate-900 dark:text-white tabular-nums',
                            densityStyles.cell
                          )}
                        >
                          {formatINR(v.total_amount)}
                        </td>
                      )}

                      {/* Status */}
                      {visibleColumns.has('status') && (
                        <td
                          className={cn(
                            'border-r border-slate-200 dark:border-[#242424] text-center',
                            densityStyles.cell
                          )}
                        >
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-[4px] text-[10px] font-mono border font-semibold inline-block',
                              v.status === 'Approved' || !v.status
                                ? 'badge-status-emerald'
                                : v.status === 'Voided'
                                ? 'badge-status-rose'
                                : 'badge-status-amber'
                            )}
                          >
                            {v.status === 'Pending_Approval'
                              ? 'Waiting'
                              : v.status === 'Voided'
                              ? 'Cancelled'
                              : 'Approved'}
                          </span>
                        </td>
                      )}

                      {/* Pro Dev Row Tools */}
                      {visibleColumns.has('actions') && (
                        <td
                          className={cn('text-center relative', densityStyles.cell)}
                          data-dropdown-id={v.id}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  v.voucher_number,
                                  `Voucher #${v.voucher_number} copied`
                                )
                              }
                              title="Copy Voucher #"
                              className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#282828] transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setActiveRowDropdownId(isDropdownOpen ? null : v.id)
                              }
                              title="Developer Tools"
                              className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#282828] transition-colors"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Row Context Menu with Smart Vertical Placement */}
                          {isDropdownOpen && (
                            <div
                              className={cn(
                                'absolute right-2 w-48 rounded-[8px] bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] shadow-2xl p-1 z-50 space-y-0.5 text-xs text-left font-sans animate-in fade-in zoom-in-95 duration-100',
                                idx >= Math.max(1, paginatedVouchers.length - 2) ? 'bottom-8' : 'top-8'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  openDrawer(v);
                                  setActiveRowDropdownId(null);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-800 dark:text-white cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-primary" />
                                <span>Inspect Voucher</span>
                              </button>

                              {isDeveloper && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      copyToClipboard(
                                        JSON.stringify(v, null, 2),
                                        'Voucher JSON copied'
                                      );
                                      setActiveRowDropdownId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-800 dark:text-white cursor-pointer"
                                  >
                                    <Code className="w-3.5 h-3.5 text-sky-500" />
                                    <span>Copy as JSON</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const tsCode = `const voucher: ExpenseVoucher = ${JSON.stringify(v, null, 2)};`;
                                      copyToClipboard(tsCode, 'TypeScript object copied');
                                      setActiveRowDropdownId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#282828] text-slate-800 dark:text-white cursor-pointer"
                                  >
                                    <Activity className="w-3.5 h-3.5 text-purple-500" />
                                    <span>Copy as TS Object</span>
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

                {paginatedVouchers.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.size + 1} className="p-0 border-none">
                      <EmptyState
                        icon={Receipt}
                        title="No expense vouchers found"
                        description={
                          search || activeFilterCount > 0
                            ? 'No records match your active search or filter criteria. Try resetting filters or clearing search.'
                            : 'No expense vouchers recorded for this branch yet. Create your first voucher to begin.'
                        }
                        actionLabel="Record Expense Voucher"
                        onAction={() => setActivePage('new-voucher')}
                        secondaryActionLabel={activeFilterCount > 0 ? 'Reset Filters' : undefined}
                        onSecondaryAction={
                          activeFilterCount > 0
                            ? () => {
                                setSelectedCategory('ALL');
                                setSelectedDept('ALL');
                                setSelectedMode('ALL');
                                setSelectedStatus('ALL');
                                setMinAmount('');
                                setMaxAmount('');
                                setActiveView('all');
                                setSearch('');
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

          {/* ========================================================================= */}
          {/* 6. TABLE PAGINATION & TOTAL SUMMARY FOOTER                                */}
          {/* ========================================================================= */}
          <div className="bg-slate-50 dark:bg-[#171717] border-t border-slate-200 dark:border-[#2e2e2e] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans">
            {/* Left: Record Count & Page Size Selector */}
            <div className="flex items-center gap-3 text-slate-600 dark:text-gray-400 font-mono">
              <span>
                Showing{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {filteredVouchers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
                </strong>{' '}
                to{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {Math.min(currentPage * pageSize, filteredVouchers.length)}
                </strong>{' '}
                of{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">{filteredVouchers.length}</strong>{' '}
                records
              </span>

              <div className="flex items-center gap-1.5 ml-2 w-24">
                <span>Rows:</span>
                <div className="flex-1">
                  <SearchableSelect
                    size="sm"
                    placement="top"
                    options={[
                      { value: '10', label: '10' },
                      { value: '15', label: '15' },
                      { value: '25', label: '25' },
                      { value: '50', label: '50' },
                      { value: '100', label: '100' },
                    ]}
                    value={String(pageSize)}
                    onChange={(val) => setPageSize(Number(val))}
                    allowCustom={false}
                    popupClassName="min-w-[76px]"
                  />
                </div>
              </div>
            </div>

            {/* Right: Page Stepper Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-[4px] bg-white dark:bg-[#202020] border border-slate-300 dark:border-[#2e2e2e] hover:border-slate-400 text-slate-700 dark:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 font-mono text-xs text-slate-700 dark:text-gray-300 font-medium">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-[4px] bg-white dark:bg-[#202020] border border-slate-300 dark:border-[#2e2e2e] hover:border-slate-400 text-slate-700 dark:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. GROUPED ANALYTICS BREAKDOWN: BY CATEGORY                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'analytics_category' && (
        <div className="rounded-[12px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#2e2e2e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                Expenses Aggregated by Category ({categoryAnalytics.length} categories)
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-600 dark:text-primary font-bold">
              Σ {formatINR(telemetry.totalAmount)}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-[#2e2e2e] text-slate-700 dark:text-gray-400 font-mono text-[11px] font-semibold">
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e]">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Category Name</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-center w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Vouchers</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-right w-36">
                  <div className="flex items-center justify-end gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Total Spend (₹)</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 text-left w-64">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Spend Share (%)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#242424] font-mono">
              {categoryAnalytics.map((item) => (
                <tr
                  key={item.name}
                  onClick={() => {
                    setSelectedCategory(item.name);
                    setActiveSubTab('grid');
                  }}
                  className="hover:bg-slate-50 dark:hover:bg-[#202020] cursor-pointer transition-colors"
                  title="Click to filter by this category"
                >
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] font-sans font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <CornerDownRight className="w-3 h-3 text-slate-400 opacity-50" />
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center text-slate-700 dark:text-gray-300 font-medium">
                    {item.count}
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right font-bold text-emerald-700 dark:text-primary tabular-nums">
                    {formatINR(item.total)}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-[#141414] h-2 rounded-full overflow-hidden border border-slate-200 dark:border-[#2e2e2e]">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. GROUPED ANALYTICS BREAKDOWN: BY DEPARTMENT                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'analytics_dept' && (
        <div className="rounded-[12px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#2e2e2e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                Expenses Aggregated by Department ({departmentAnalytics.length} departments)
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-600 dark:text-primary font-bold">
              Σ {formatINR(telemetry.totalAmount)}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-[#2e2e2e] text-slate-700 dark:text-gray-400 font-mono text-[11px] font-semibold">
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e]">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Department</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-center w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Vouchers</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-right w-36">
                  <div className="flex items-center justify-end gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Total Spend (₹)</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 text-left w-64">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Spend Share (%)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#242424] font-mono">
              {departmentAnalytics.map((item) => (
                <tr
                  key={item.name}
                  onClick={() => {
                    setSelectedDept(item.name);
                    setActiveSubTab('grid');
                  }}
                  className="hover:bg-slate-50 dark:hover:bg-[#202020] cursor-pointer transition-colors"
                  title="Click to filter by this department"
                >
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] font-sans font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <CornerDownRight className="w-3 h-3 text-slate-400 opacity-50" />
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center text-slate-700 dark:text-gray-300 font-medium">
                    {item.count}
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right font-bold text-emerald-700 dark:text-primary tabular-nums">
                    {formatINR(item.total)}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-[#141414] h-2 rounded-full overflow-hidden border border-slate-200 dark:border-[#2e2e2e]">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. GROUPED ANALYTICS BREAKDOWN: BY TOP PAYEES                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'analytics_payee' && (
        <div className="rounded-[12px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#2e2e2e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                Top Vendors & People Paid (Top {payeeAnalytics.length})
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-600 dark:text-primary font-bold">
              Σ {formatINR(telemetry.totalAmount)}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-[#2e2e2e] text-slate-700 dark:text-gray-400 font-mono text-[11px] font-semibold">
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e]">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Recipient / Vendor Name</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] w-40">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Primary Category</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-center w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Vouchers</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#2e2e2e] text-right w-36">
                  <div className="flex items-center justify-end gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Total Disbursed (₹)</span>
                  </div>
                </th>
                <th className="py-2.5 px-3.5 text-left w-48">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span>Share (%)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#242424] font-mono">
              {payeeAnalytics.map((item, idx) => (
                <tr
                  key={item.name}
                  onClick={() => {
                    setSearch(item.name);
                    setActiveSubTab('grid');
                  }}
                  className="hover:bg-slate-50 dark:hover:bg-[#202020] cursor-pointer transition-colors"
                  title="Click to search all records for this payee"
                >
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] font-sans font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs w-5 font-mono">#{idx + 1}</span>
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-slate-600 dark:text-zinc-400 font-sans text-xs">
                    {item.category}
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-center text-slate-700 dark:text-gray-300 font-medium">
                    {item.count}
                  </td>
                  <td className="py-2.5 px-3.5 border-r border-slate-200 dark:border-[#242424] text-right font-bold text-emerald-700 dark:text-primary tabular-nums">
                    {formatINR(item.total)}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-[#141414] h-2 rounded-full overflow-hidden border border-slate-200 dark:border-[#2e2e2e]">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

