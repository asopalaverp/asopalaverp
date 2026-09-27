import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { Branch } from '@/types/database';
import { searchEngine, SearchResultItem, SearchCategory, SearchFilterOptions, SearchQueryResult } from '@/lib/searchEngine';
import { formatINR, formatDate, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { IOSSegmentedControl } from '@/components/ui/ios';
import {
  Search,
  Receipt,
  HandCoins,
  Users,
  Sliders,
  Filter,
  ArrowRight,
  ExternalLink,
  Printer,
  Copy,
  Check,
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  Download,
  X,
  Tag,
  Building2,
  Wallet,
  Coins,
  CornerDownLeft,
  ChevronRight,
  ShieldAlert,
  SlidersHorizontal,
  Info,
  FileSpreadsheet,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';

type DateFilterChip = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'last30';
type AmountFilterChip = 'all' | 'under1k' | '1k-5k' | '5k-25k' | 'over25k';
type SortOption = 'relevance' | 'newest' | 'oldest' | 'amount_desc' | 'amount_asc';

export const UniversalSearchPage: React.FC = () => {
  const { setActivePage, openDrawer, setSettleTargetAdvance, openLightbox } = useUIStore();
  const { branches, selectedBranchId, setSelectedBranchId, getActiveBranch } = useBranchStore();

  const { user, can, getAllowedBranches } = useAuthStore();
  const allowedBranches = getAllowedBranches(branches);
  const canViewAll = user?.role_code === 'Super_Admin' || user?.role_code === 'Developer' || can('can_view_all_branches');

  // Search Query & Filters State
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [branchFilter, setBranchFilter] = useState<string>(canViewAll ? (selectedBranchId || 'ALL') : (allowedBranches[0]?.branch_id || 'Aellp-ASI'));
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterChip>('all');
  const [amountFilter, setAmountFilter] = useState<AmountFilterChip>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');

  // Query Result State
  const [searchData, setSearchData] = useState<SearchQueryResult>({
    results: [],
    categoryCounts: {
      all: 0,
      vouchers: 0,
      advances: 0,
      treasury: 0,
      closings: 0,
      staff: 0,
      master: 0,
      actions: 0,
    },
    total: 0,
    totalFinancialVolume: 0,
    vouchersFinancialVolume: 0,
    advancesFinancialVolume: 0,
    vouchersCount: 0,
    advancesCount: 0,
    staffCount: 0,
    masterCount: 0,
    executionTimeMs: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeCardRef = useRef<HTMLDivElement | null>(null);

  // Read initial query from URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q');
    const catParam = params.get('category') as SearchCategory;
    const branchParam = params.get('branch');

    if (qParam) setQuery(qParam);
    if (catParam) setCategory(catParam);
    if (branchParam) setBranchFilter(branchParam);
  }, []);

  // Sync URL with current query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', 'search');
    if (query) {
      params.set('q', query);
    } else {
      params.delete('q');
    }
    if (category !== 'all') {
      params.set('category', category);
    } else {
      params.delete('category');
    }
    if (branchFilter !== 'ALL') {
      params.set('branch', branchFilter);
    } else {
      params.delete('branch');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [query, category, branchFilter]);

  // Derive Date Range
  const dateRange = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateFilter === 'today') {
      const todayStr = toYMD(now);
      return { from: todayStr, to: todayStr };
    }
    if (dateFilter === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = toYMD(y);
      return { from: yStr, to: yStr };
    }
    if (dateFilter === 'week') {
      const s = new Date(now);
      s.setDate(now.getDate() - now.getDay());
      return { from: toYMD(s), to: toYMD(now) };
    }
    if (dateFilter === 'month') {
      const mStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      return { from: mStr, to: toYMD(now) };
    }
    if (dateFilter === 'last30') {
      const s = new Date(now);
      s.setDate(now.getDate() - 30);
      return { from: toYMD(s), to: toYMD(now) };
    }
    return { from: undefined, to: undefined };
  }, [dateFilter]);

  // Derive Amount Range
  const amountRange = useMemo(() => {
    if (amountFilter === 'under1k') return { min: 0, max: 1000 };
    if (amountFilter === '1k-5k') return { min: 1000, max: 5000 };
    if (amountFilter === '5k-25k') return { min: 5000, max: 25000 };
    if (amountFilter === 'over25k') return { min: 25000, max: undefined };
    return { min: undefined, max: undefined };
  }, [amountFilter]);

  // Execute Search Engine
  const performSearch = useCallback(async () => {
    setIsLoading(true);
    try {
      const options: SearchFilterOptions = {
        category,
        branchId: branchFilter === 'ALL' ? undefined : branchFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        minAmount: amountRange.min,
        maxAmount: amountRange.max,
        paymentMethod: paymentMethodFilter === 'ALL' ? undefined : paymentMethodFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        sortBy,
      };

      const result = await searchEngine.search(query, options);
      setSearchData(result);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search error on UniversalSearchPage:', err);
      showToast({
        type: 'error',
        title: 'Search Query Failed',
        message: 'Could not load search index. Please refresh.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    query,
    category,
    branchFilter,
    statusFilter,
    amountRange,
    paymentMethodFilter,
    dateRange,
    sortBy,
  ]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Global Keyboard Shortcuts for Universal Search Hub
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search bar on '/' or 'Ctrl+F'
      if (
        (e.key === '/' && document.activeElement !== searchInputRef.current) ||
        (e.ctrlKey && e.key.toLowerCase() === 'f')
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // If user is inside an input, don't hijack arrow keys
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)) {
        if (e.key === 'Escape') {
          searchInputRef.current?.blur();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (searchData.results.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % searchData.results.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (searchData.results.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + searchData.results.length) % searchData.results.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = searchData.results[selectedIndex];
        if (selected) {
          handleDirectOpen(selected);
        }
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const selected = searchData.results[selectedIndex];
        if (selected && selected.actionType === 'open_voucher' && selected.rawItem) {
          handlePrintSlip(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchData.results, selectedIndex]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Direct Action Handlers
  const handleDirectOpen = (item: SearchResultItem) => {
    triggerHaptic('selection');
    if (item.actionType === 'open_voucher' && item.rawItem) {
      openDrawer(item.rawItem);
      showToast({
        type: 'info',
        title: 'Opening Voucher Detail',
        message: `Voucher #${item.rawItem.voucher_number}`,
      });
    } else if (item.actionType === 'open_advance' && item.rawItem) {
      setSettleTargetAdvance(item.rawItem);
      showToast({
        type: 'info',
        title: 'Opening Advance Settlement',
        message: `Advance #${item.rawItem.receipt_number} for ${item.rawItem.staff_name}`,
      });
    } else if (item.actionType === 'navigate' && item.actionPayload) {
      setActivePage(item.actionPayload.page);
    } else {
      setActivePage('dashboard');
    }
  };

  const handlePrintSlip = (item: SearchResultItem) => {
    triggerHaptic('selection');
    if (item.rawItem?.voucher_number) {
      showToast({
        type: 'info',
        title: 'Thermal Slip',
        message: `Preparing thermal print for Voucher #${item.rawItem.voucher_number}`,
      });
      window.print();
    } else if (item.rawItem?.receipt_number) {
      showToast({
        type: 'info',
        title: 'Advance Receipt Slip',
        message: `Printing Advance #${item.rawItem.receipt_number}`,
      });
      window.print();
    }
  };

  const handleCopyId = (idText: string) => {
    triggerHaptic('selection');
    navigator.clipboard.writeText(idText);
    setCopiedId(idText);
    showToast({
      type: 'success',
      title: 'Copied to Clipboard',
      message: `${idText} copied`,
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCSV = () => {
    triggerHaptic('selection');
    if (searchData.results.length === 0) {
      showToast({
        type: 'warning',
        title: 'No Data to Export',
        message: 'Refine your query to produce matching records.',
      });
      return;
    }

    const headers = ['Type', 'Identifier', 'Title', 'Amount', 'Date', 'Branch', 'Status', 'Subtitle'];
    const rows = searchData.results.map((r) => [
      `"${r.categoryLabel}"`,
      `"${r.rawItem?.voucher_number || r.rawItem?.receipt_number || r.id}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      r.amount || 0,
      `"${r.date || ''}"`,
      `"${r.branchCode || ''}"`,
      `"${r.badge?.text || ''}"`,
      `"${r.subtitle.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Asopalav_Search_Results_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast({
      type: 'success',
      title: 'CSV Export Complete',
      message: `Exported ${searchData.results.length} search records`,
    });
  };

  const handleResetFilters = () => {
    triggerHaptic('selection');
    setQuery('');
    setCategory('all');
    setBranchFilter('ALL');
    setStatusFilter('all');
    setDateFilter('all');
    setAmountFilter('all');
    setPaymentMethodFilter('ALL');
    setSortBy('relevance');
    searchInputRef.current?.focus();
  };

  const insertSyntax = (syntaxText: string) => {
    triggerHaptic('selection');
    setQuery((prev) => `${prev.trim()} ${syntaxText}`.trim());
    setShowSyntaxHelp(false);
    searchInputRef.current?.focus();
  };

  const selectedItem = searchData.results[selectedIndex] || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0d0e] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16 select-none flex flex-col">
      {/* 1. iOS 16 Frosted Header */}
      <div className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/10 backdrop-blur-2xl bg-white/80 dark:bg-[#121214]/80 px-4 lg:px-6 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 max-w-[1600px] mx-auto w-full">
          {/* Left Layer: Title, Status Badges & Subtitle */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-[#EDEDED] flex items-center gap-2">
                <Search className="w-5 h-5 text-[#3ecf8e]" />
                <span>Search Everything</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                Live Index
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8E8E93] mt-0.5">
              Search across all expense bills, staff advances, cash till float, team members, and settings.
            </p>
          </div>

          {/* Right Layer: Action Tools */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-9 px-3.5 py-1.5 rounded-[10px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#1C1C1E]/80 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-semibold flex items-center gap-1.5 shadow-xs ios-press transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              className="h-9 px-3.5 py-1.5 rounded-[10px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#1C1C1E]/80 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-semibold flex items-center gap-1.5 shadow-xs ios-press transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Workspace Canvas */}
      <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-5 flex-1 flex flex-col">
        {/* 2. Omnibar Search Control & Syntax Helper */}
        <div className="relative space-y-2">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-slate-400 dark:text-[#707070] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by bill number, person name, staff, amount, or shop branch..."
              className="w-full pl-12 pr-28 py-3.5 bg-white/80 dark:bg-[#1C1C1E]/80 border border-slate-200/80 dark:border-white/10 rounded-[14px] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-2 focus:ring-[#3ecf8e]/20 shadow-xs font-sans transition-all"
            />
            <div className="absolute right-3.5 flex items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-[6px] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-[#707070] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
                className={cn(
                  'px-2.5 py-1 rounded-[8px] text-[11px] font-mono border transition-all cursor-pointer flex items-center gap-1 ios-press',
                  showSyntaxHelp
                    ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#A1A1A1] border-slate-200/80 dark:border-white/10 hover:border-slate-300'
                )}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Filters</span>
              </button>
            </div>
          </div>

          {/* Syntax Help Popover Drawer */}
          {showSyntaxHelp && (
            <div className="p-4 ios-card rounded-[14px] text-xs font-sans space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150 shadow-md">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  Advanced Filter Syntax Quick-Insert
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#8E8E93]">Click any chip to append to search</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: 'Showroom: ASI', text: 'branch:ASI' },
                  { label: 'Showroom: SAT', text: 'branch:SAT' },
                  { label: 'Showroom: SUR', text: 'branch:SUR' },
                  { label: 'Amount > ₹5,000', text: 'amt:>5000' },
                  { label: 'Amount < ₹1,000', text: 'amt:<1000' },
                  { label: 'Status: Active', text: 'status:active' },
                  { label: 'Status: Settled', text: 'status:settled' },
                  { label: 'Payment: Cash', text: 'mode:cash' },
                  { label: 'Payment: UPI', text: 'mode:upi' },
                ].map((chip) => (
                  <button
                    key={chip.text}
                    type="button"
                    onClick={() => insertSyntax(chip.text)}
                    className="px-2.5 py-1 bg-slate-100/80 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-[8px] text-[11px] font-mono text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer ios-press"
                  >
                    + {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Telemetry Matrix Fragments */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <MetricCard
            label="Total Matches"
            value={searchData.total.toLocaleString()}
            subValue={`Executed in ${searchData.executionTimeMs}ms`}
            icon={Search}
          />
          <MetricCard
            label="Financial Volume"
            value={formatINR(searchData.totalFinancialVolume)}
            subValue="Combined Vouchers & Advances"
            icon={Wallet}
          />
          <MetricCard
            label="Expense Vouchers"
            value={searchData.vouchersCount.toString()}
            subValue={formatINR(searchData.vouchersFinancialVolume)}
            icon={Receipt}
          />
          <MetricCard
            label="Staff Advances"
            value={searchData.advancesCount.toString()}
            subValue={formatINR(searchData.advancesFinancialVolume)}
            icon={HandCoins}
          />
        </div>

        {/* 4. Multi-Faceted Filter Bar */}
        <div className="ios-card rounded-[16px] p-3.5 space-y-3">
          {/* Top Row: Category Tabs (iOS Segmented Control) */}
          <div className="w-full">
            <IOSSegmentedControl
              options={[
                { id: 'all', label: 'All Records', badge: searchData.categoryCounts.all, icon: <Sparkles className="w-3.5 h-3.5" /> },
                { id: 'vouchers', label: 'Expense Vouchers', badge: searchData.categoryCounts.vouchers, icon: <Receipt className="w-3.5 h-3.5" /> },
                { id: 'advances', label: 'Staff Advances', badge: searchData.categoryCounts.advances, icon: <HandCoins className="w-3.5 h-3.5" /> },
                { id: 'staff', label: 'Staff Directory', badge: searchData.categoryCounts.staff, icon: <Users className="w-3.5 h-3.5" /> },
                { id: 'master', label: 'Master Data', badge: searchData.categoryCounts.master, icon: <Sliders className="w-3.5 h-3.5" /> },
                { id: 'actions', label: 'Actions', badge: searchData.categoryCounts.actions, icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
              ]}
              value={category}
              onChange={(val) => setCategory(val as SearchCategory)}
              size="sm"
            />
          </div>

          {/* Bottom Row: Granular Filters */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-200/80 dark:border-white/10 text-xs">
            {/* Branch Filter */}
            <div className="w-48">
              <SearchableSelect
                size="sm"
                options={[
                  ...(canViewAll ? [{ value: 'ALL', label: 'All Showrooms' }] : []),
                  ...allowedBranches.map((b: Branch) => ({
                    value: b.branch_id,
                    label: b.branch_code,
                    sublabel: b.branch_name.replace(/^Asopalav\s*-\s*/i, ''),
                  })),
                ]}
                value={branchFilter}
                onChange={setBranchFilter}
                placeholder="All Showrooms"
                searchPlaceholder="Search branch..."
                allowCustom={false}
              />
            </div>

            {/* Date Range Chips */}
            <div className="w-36">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'all', label: 'All Dates' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'week', label: 'This Week' },
                  { value: 'month', label: 'This Month' },
                  { value: 'last30', label: 'Last 30 Days' },
                ]}
                value={dateFilter}
                onChange={(val) => setDateFilter(val as DateFilterChip)}
                placeholder="Date range"
                searchPlaceholder="Search dates..."
                allowCustom={false}
              />
            </div>

            {/* Amount Range Filter */}
            <div className="w-40">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'all', label: 'Any Amount' },
                  { value: 'under1k', label: '< ₹1,000' },
                  { value: '1k-5k', label: '₹1,000 - ₹5,000' },
                  { value: '5k-25k', label: '₹5,000 - ₹25,000' },
                  { value: 'over25k', label: '> ₹25,000' },
                ]}
                value={amountFilter}
                onChange={(val) => setAmountFilter(val as AmountFilterChip)}
                placeholder="Amount range"
                searchPlaceholder="Search amounts..."
                allowCustom={false}
              />
            </div>

            {/* Sort Filter */}
            <div className="w-40 ml-auto">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'relevance', label: 'Best Match' },
                  { value: 'newest', label: 'Newest Date' },
                  { value: 'oldest', label: 'Oldest Date' },
                  { value: 'amount_desc', label: 'Highest Amount' },
                  { value: 'amount_asc', label: 'Lowest Amount' },
                ]}
                value={sortBy}
                onChange={(val) => setSortBy(val as SortOption)}
                placeholder="Sort by"
                searchPlaceholder="Search sort..."
                allowCustom={false}
              />
            </div>
          </div>
        </div>

        {/* 5. Master-Detail Interactive Search Results & Context Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
          {/* LEFT: Search Results List */}
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-[#8E8E93] font-sans">
              <span>Showing {searchData.results.length} results</span>
              <span className="hidden sm:inline font-mono text-[11px]">↑ ↓ navigate · Enter open · P print</span>
            </div>

            <div ref={resultsContainerRef} className="space-y-2.5">
              {searchData.results.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                const isVoucher = item.category === 'vouchers';
                const isAdvance = item.category === 'advances';
                const isStaff = item.category === 'staff';

                return (
                  <div
                    key={item.id}
                    ref={isSelected ? activeCardRef : undefined}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => handleDirectOpen(item)}
                    className={cn(
                      'p-4 rounded-[14px] border transition-all cursor-pointer relative group flex flex-col sm:flex-row sm:items-center justify-between gap-3 ios-press',
                      isSelected
                        ? 'bg-slate-100/90 dark:bg-white/10 border-emerald-500/60 dark:border-[#3ecf8e]/60 shadow-xs'
                        : 'ios-card hover:border-slate-300 dark:hover:border-white/20'
                    )}
                  >
                    {/* Left: Metadata & Titles */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Category Icon & Label */}
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                          {isVoucher && <Receipt className="w-3.5 h-3.5 text-[#3ecf8e]" />}
                          {isAdvance && <HandCoins className="w-3.5 h-3.5 text-amber-500" />}
                          {isStaff && <Users className="w-3.5 h-3.5 text-blue-400" />}
                          {!isVoucher && !isAdvance && !isStaff && <Sliders className="w-3.5 h-3.5 text-slate-400" />}
                          <span>{item.categoryLabel}</span>
                        </span>

                        {/* Branch Code */}
                        {item.branchCode && (
                          <span className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-white/5 text-[10px] font-mono text-slate-600 dark:text-[#A1A1A1] border border-slate-200/80 dark:border-white/10">
                            {item.branchCode}
                          </span>
                        )}

                        {/* Status Badge */}
                        {item.badge && (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-[6px] text-[10px] font-mono font-semibold',
                              item.badge.variant === 'emerald' && 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20',
                              item.badge.variant === 'amber' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
                              item.badge.variant === 'rose' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
                              item.badge.variant === 'blue' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
                              item.badge.variant === 'neutral' && 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#A1A1A1] border border-slate-200/80 dark:border-white/10'
                            )}
                          >
                            {item.badge.text}
                          </span>
                        )}

                        {item.date && (
                          <span className="text-[11px] text-slate-400 dark:text-[#707070] font-mono">
                            {item.date}
                          </span>
                        )}
                      </div>

                      {/* Main Title */}
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate font-sans">
                        {item.title}
                      </h4>

                      {/* Subtitle Description */}
                      <p className="text-xs text-slate-500 dark:text-[#8E8E93] line-clamp-1 font-sans">
                        {item.subtitle}
                      </p>
                    </div>

                    {/* Right: Amount & Direct Action Triggers */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/5">
                      {item.amount !== undefined && item.amount > 0 && (
                        <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-[#3ecf8e] tabular-nums">
                          {formatINR(item.amount)}
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDirectOpen(item);
                          }}
                          className="px-2.5 py-1 rounded-[8px] text-[11px] font-sans font-semibold bg-[#3ecf8e] text-[#171717] hover:bg-[#3ecf8e]/90 transition-all cursor-pointer flex items-center gap-1 shadow-2xs ios-press"
                        >
                          <span>Open</span>
                          <CornerDownLeft className="w-2.5 h-2.5" />
                        </button>

                        {(isVoucher || isAdvance) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintSlip(item);
                            }}
                            title="Print Thermal Slip"
                            className="p-1.5 rounded-[8px] text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-all cursor-pointer ios-press"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {searchData.results.length === 0 && !isLoading && (
                <div className="py-16 text-center text-slate-400 dark:text-[#707070] font-sans space-y-3 ios-card rounded-[16px] p-6">
                  <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-[#555555]" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                      No matching records found for "{query}"
                    </p>
                    <p className="text-xs text-slate-400 dark:text-[#8E8E93] max-w-md mx-auto">
                      Try searching with voucher serial (e.g. ASI-6590), payee name, staff code, or clear filters.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-3.5 py-1.5 rounded-[10px] text-xs font-sans font-semibold text-emerald-600 dark:text-[#3ecf8e] bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all cursor-pointer inline-flex items-center gap-1.5 ios-press"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Clear All Filters</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Live Context Inspector Panel */}
          <div className="lg:col-span-5 sticky top-20">
            {selectedItem ? (
              <div className="ios-card rounded-[18px] p-5 space-y-5 shadow-sm">
                {/* Inspector Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-[6px] bg-slate-100 dark:bg-white/10 text-[10px] font-mono font-semibold text-[#3ecf8e] border border-slate-200/80 dark:border-white/10">
                        {selectedItem.categoryLabel}
                      </span>
                      {selectedItem.branchCode && (
                        <span className="px-2 py-0.5 rounded-[6px] bg-slate-100 dark:bg-white/5 text-[10px] font-mono text-slate-600 dark:text-[#A1A1A1]">
                          Branch: {selectedItem.branchCode}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate font-sans">
                      {selectedItem.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyId(selectedItem.rawItem?.voucher_number || selectedItem.rawItem?.receipt_number || selectedItem.id)}
                    title="Copy Reference ID"
                    className="p-2 rounded-[8px] text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 transition-all cursor-pointer shrink-0 ios-press"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Amount Banner */}
                {selectedItem.amount !== undefined && selectedItem.amount > 0 && (
                  <div className="p-3.5 rounded-[14px] bg-emerald-500/10 dark:bg-[#3ecf8e]/10 border border-emerald-500/20 dark:border-[#3ecf8e]/20 flex items-center justify-between">
                    <span className="text-xs text-slate-600 dark:text-[#A1A1A1] font-sans font-medium">Total Transaction Value</span>
                    <span className="text-lg font-mono font-semibold text-emerald-600 dark:text-[#3ecf8e] tabular-nums">
                      {formatINR(selectedItem.amount)}
                    </span>
                  </div>
                )}

                {/* Metadata Details Grid */}
                <div className="space-y-2.5 text-xs font-sans">
                  {selectedItem.badge && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Status</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                        {selectedItem.badge.text}
                      </span>
                    </div>
                  )}

                  {selectedItem.date && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Date</span>
                      <span className="font-mono text-slate-800 dark:text-zinc-200">
                        {selectedItem.date}
                      </span>
                    </div>
                  )}

                  {selectedItem.metadata?.category && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Expense Category</span>
                      <span className="text-slate-800 dark:text-zinc-200 font-semibold">
                        {selectedItem.metadata.category}
                      </span>
                    </div>
                  )}

                  {selectedItem.metadata?.department && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Department</span>
                      <span className="text-slate-800 dark:text-zinc-200">
                        {selectedItem.metadata.department}
                      </span>
                    </div>
                  )}

                  {selectedItem.metadata?.payment_method && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Payment Mode</span>
                      <span className="text-slate-800 dark:text-zinc-200">
                        {selectedItem.metadata.payment_method === 'Physical_Cash' ? 'Cash Till Float' : 'Online Bank'}
                      </span>
                    </div>
                  )}

                  {selectedItem.metadata?.created_by && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 dark:text-[#707070]">Recorded By</span>
                      <span className="text-slate-800 dark:text-zinc-200">
                        {selectedItem.metadata.created_by}
                      </span>
                    </div>
                  )}

                  {selectedItem.metadata?.purpose && (
                    <div className="py-1.5 border-b border-slate-100 dark:border-white/5 space-y-1">
                      <span className="text-slate-400 dark:text-[#707070] block font-medium">Advance Purpose</span>
                      <p className="text-slate-800 dark:text-zinc-200">{selectedItem.metadata.purpose}</p>
                    </div>
                  )}

                  {selectedItem.metadata?.remarks && (
                    <div className="py-1.5 border-b border-slate-100 dark:border-white/5 space-y-1">
                      <span className="text-slate-400 dark:text-[#707070] block font-medium">Notes & Purpose</span>
                      <p className="text-slate-800 dark:text-zinc-200 italic">{selectedItem.metadata.remarks}</p>
                    </div>
                  )}

                  {/* Attached Bill Receipt Thumbnail */}
                  {selectedItem.rawItem?.bill_image_url && (
                    <div className="py-2 space-y-1.5">
                      <span className="text-slate-400 dark:text-[#707070] block font-medium">Attached Bill Invoice</span>
                      <div
                        onClick={() => openLightbox(selectedItem.rawItem.bill_image_url)}
                        className="relative w-full h-32 rounded-[12px] overflow-hidden border border-slate-200/80 dark:border-white/10 cursor-pointer group"
                      >
                        <img
                          src={selectedItem.rawItem.bill_image_url}
                          alt="Bill preview"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[11px] font-sans font-semibold text-white px-2.5 py-1 rounded-[6px] bg-black/60 backdrop-blur-md">
                            Click to Enlarge
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Direct Action Drawer Triggers */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDirectOpen(selectedItem)}
                    className="w-full py-2.5 px-4 rounded-[10px] bg-[#3ecf8e] text-[#171717] hover:bg-[#3ecf8e]/90 text-xs font-sans font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs ios-press"
                  >
                    <span>Open Full Record in Drawer</span>
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintSlip(selectedItem)}
                      className="flex-1 py-2 px-3 rounded-[10px] border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-sans font-semibold text-slate-800 dark:text-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 ios-press"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Slip (P)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedItem.rawItem?.voucher_number || selectedItem.rawItem?.receipt_number || selectedItem.id)}
                      className="flex-1 py-2 px-3 rounded-[10px] border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-sans font-semibold text-slate-800 dark:text-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 ios-press"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy ID</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ios-card rounded-[18px] p-8 text-center text-xs text-slate-400 dark:text-[#707070] font-sans space-y-2">
                <Search className="w-6 h-6 mx-auto text-slate-300 dark:text-[#555555]" />
                <p className="font-semibold text-slate-700 dark:text-zinc-300">No Item Selected</p>
                <p>Click on any search match in the list to inspect full live metadata and take actions.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

