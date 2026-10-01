import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { format, startOfWeek, startOfMonth, startOfQuarter } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore } from '@/store/uiStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { StaffAdvance, ExpenseVoucher } from '@/types/database';
import { VoucherTable } from '@/components/vouchers/VoucherTable';
import { LogsBarChart } from '@/components/fragments/LogsBarChart';
import { MetricCard } from '@/components/ui/MetricCard';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SegmentedControl } from '@/components/ui';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { useOverrideStore } from '@/store/overrideStore';
import {
  Wallet,
  ArrowRight,
  FileSpreadsheet,
  Check,
  PieChart,
  Building2,
  TrendingUp,
  HandCoins,
  Receipt,
  Calendar,
  Filter,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CreditCard,
  Coins,
  Layers,
  Tag,
  Activity,
  CheckCircle2,
  ArrowUpRight,
  Plus,
  Sparkles,
  Lock,
  Unlock,
  ChevronDown,
  X,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, can, isBranchAllowed } = useAuthStore();
  const { selectedBranchId, branches, getActiveBranch } = useBranchStore();
  const { setActivePage, setAdvanceModalOpen } = useUIStore();
  const { vouchers, categories, departments, loading, refresh } = useVouchers();

  // Wallet & Liquidity State
  const [cashBalance, setCashBalance] = useState(0);
  const [upiBalance, setUpiBalance] = useState(0);
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [isPeriodLocked, setIsPeriodLocked] = useState(false);

  // Slicers State (Interactive Multi-Dimensional Filtering)
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'all' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMode, setSelectedMode] = useState<'ALL' | 'Physical_Cash' | 'Online_UPI'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);

  const { isCeilingExceededAllowed } = useOverrideStore();

  const activeBranch = getActiveBranch();
  const maxCashCeiling = activeBranch?.max_cash_ceiling || 25000;
  const minCashThreshold = activeBranch?.min_cash_threshold || 3000;
  const isSafeDropAlert = cashBalance > maxCashCeiling && !isCeilingExceededAllowed();
  const isLowFloatAlert = cashBalance < minCashThreshold;

  // Load branch wallet balances
  const loadWallet = useCallback(async () => {
    if (!selectedBranchId) return;
    if (selectedBranchId !== 'ALL' && !isBranchAllowed(selectedBranchId)) return;
    try {
      const w = await erpService.getBranchWallet(selectedBranchId);
      setCashBalance(w.cash_balance);
      setUpiBalance(w.upi_balance);
    } catch (err) {
      console.warn('Error loading branch wallet:', err);
    }
  }, [selectedBranchId, isBranchAllowed]);

  // Load staff advances
  const loadAdvances = useCallback(async () => {
    if (selectedBranchId !== 'ALL' && !isBranchAllowed(selectedBranchId)) return;
    try {
      const data = await erpService.getStaffAdvances(selectedBranchId);
      setAdvances(data);
    } catch (err) {
      console.warn('Error loading staff advances:', err);
    }
  }, [selectedBranchId, isBranchAllowed]);

  // Check period lock status
  useEffect(() => {
    async function checkLock() {
      try {
        const locked = await erpService.checkIsPeriodLocked(format(new Date(), 'yyyy-MM-dd'));
        setIsPeriodLocked(locked);
      } catch (err) {
        setIsPeriodLocked(false);
      }
    }
    checkLock();
  }, []);

  useEffect(() => {
    loadWallet();
    loadAdvances();
    const handleUpdates = () => {
      loadWallet();
      loadAdvances();
    };
    window.addEventListener('asopalav:wallet-updated', handleUpdates);
    window.addEventListener('asopalav:advances-updated', handleUpdates);
    return () => {
      window.removeEventListener('asopalav:wallet-updated', handleUpdates);
      window.removeEventListener('asopalav:advances-updated', handleUpdates);
    };
  }, [selectedBranchId, loadWallet, loadAdvances]);

  // Slicer Filter Pipeline
  const filteredVouchers = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeekStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');
    const startOfQuarterStr = format(startOfQuarter(now), 'yyyy-MM-dd');

    return vouchers.filter((v) => {
      const vDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      if (timeRange === 'today' && vDate !== todayStr) return false;
      if (timeRange === 'week' && vDate < startOfWeekStr) return false;
      if (timeRange === 'month' && vDate < startOfMonthStr) return false;
      if (timeRange === 'quarter' && vDate < startOfQuarterStr) return false;
      if (timeRange === 'custom') {
        if (customStartDate && vDate < customStartDate) return false;
        if (customEndDate && vDate > customEndDate) return false;
      }

      if (selectedMode !== 'ALL' && v.payment_method !== selectedMode) return false;
      if (selectedCategory !== 'ALL' && v.category_name !== selectedCategory) return false;
      if (selectedDept !== 'ALL' && v.department_name !== selectedDept) return false;

      return true;
    });
  }, [vouchers, timeRange, customStartDate, customEndDate, selectedMode, selectedCategory, selectedDept]);

  // Active Slicer Count
  const activeSlicerCount = useMemo(() => {
    let count = 0;
    if (timeRange !== 'today') count++;
    if (selectedMode !== 'ALL') count++;
    if (selectedCategory !== 'ALL') count++;
    if (selectedDept !== 'ALL') count++;
    return count;
  }, [timeRange, selectedMode, selectedCategory, selectedDept]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const active = filteredVouchers.filter((v) => v.status !== 'Voided');
    const totalSpend = active.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
    const cashSpend = active
      .filter((v) => v.payment_method === 'Physical_Cash')
      .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
    const upiSpend = active
      .filter((v) => v.payment_method === 'Online_UPI')
      .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);

    const amounts = active.map((v) => Number(v.total_amount) || 0);
    const maxTicket = amounts.length > 0 ? Math.max(...amounts) : 0;
    const avgTicket = amounts.length > 0 ? Math.round(totalSpend / amounts.length) : 0;

    return {
      totalSpend,
      cashSpend,
      upiSpend,
      cashPaid: cashSpend,
      upiPaid: upiSpend,
      maxTicket,
      avgTicket,
      totalBills: filteredVouchers.length,
      cashBills: active.filter((v) => v.payment_method === 'Physical_Cash').length,
      upiBills: active.filter((v) => v.payment_method === 'Online_UPI').length,
    };
  }, [filteredVouchers]);

  // Staff Advances Metrics
  const advanceMetrics = useMemo(() => {
    const pending = advances.filter((a) => a.status === 'Active_Unsettled' || a.status === 'Flagged_Salary_Deduction');
    const totalUnsettled = pending.reduce((acc, curr) => acc + (Number(curr.unsettled_balance) || 0), 0);
    return {
      totalUnsettled,
      pendingCount: pending.length,
    };
  }, [advances]);

  // Department Allocation Stats
  const departmentStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    filteredVouchers
      .filter((v) => v.status !== 'Voided')
      .forEach((v) => {
        const dept = v.department_name || 'General Operations';
        const cur = map.get(dept) || { count: 0, amount: 0 };
        map.set(dept, {
          count: cur.count + 1,
          amount: cur.amount + (Number(v.total_amount) || 0),
        });
      });

    const palette = ['#3ecf8e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];
    return Array.from(map.entries())
      .map(([name, stat], idx) => ({
        name,
        count: stat.count,
        amount: stat.amount,
        percentage: metrics.totalSpend > 0 ? Math.round((stat.amount / metrics.totalSpend) * 100) : 0,
        color: palette[idx % palette.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredVouchers, metrics.totalSpend]);

  // Category Spend Stats
  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    filteredVouchers
      .filter((v) => v.status !== 'Voided')
      .forEach((v) => {
        const cat = v.category_name || 'Other';
        const cur = map.get(cat) || { count: 0, amount: 0 };
        map.set(cat, {
          count: cur.count + 1,
          amount: cur.amount + (Number(v.total_amount) || 0),
        });
      });

    const palette = ['#3ecf8e', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4'];
    return Array.from(map.entries())
      .map(([name, stat], idx) => ({
        name,
        count: stat.count,
        amount: stat.amount,
        percentage: metrics.totalSpend > 0 ? Math.round((stat.amount / metrics.totalSpend) * 100) : 0,
        color: palette[idx % palette.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredVouchers, metrics.totalSpend]);

  const handleExportTally = () => {
    if (!can('can_export_tally')) {
      showToast({
        type: 'error',
        title: 'Access Restricted',
        message: 'Your role does not have permission to export Tally financial data.',
      });
      return;
    }
    const csvContent = erpService.generateTallyExportCSV(filteredVouchers);
    const cleanCsv = csvContent.replace(/^data:text\/csv;charset=utf-8,/, '');
    const blob = new Blob([cleanCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Asopalav_Tally_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const showroomTitle = selectedBranchId === 'ALL' ? 'All Showrooms' : (activeBranch?.branch_name || 'Satellite Road Showroom');
  const showroomCode = selectedBranchId === 'ALL' ? 'ALL' : (activeBranch?.branch_code || 'ASI');
  const timeRangeLabel = timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This Week' : timeRange === 'month' ? 'This Month' : timeRange === 'quarter' ? 'This Quarter' : timeRange === 'custom' ? 'Custom Range' : 'All Time';

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Dashboard Header (2-Layer Layout: Left Title & Subtitle, Right Actions) */}
      <div className="px-4 lg:px-6 py-4 border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Layer: Title, Count Badge & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-[#3ecf8e]" />
                <span>Dashboard</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-[4px] text-[11px] font-medium font-mono tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center">
                {filteredVouchers.length} bills
              </span>
              {isPeriodLocked && (
                <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Day Locked
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
              Live showroom liquidity, daily expenses, cash till telemetry, and staff advances in one place.
            </p>
          </div>

          {/* Right Layer: Action Buttons & Signature Emerald CTA */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {can('can_create_voucher') && (
              <button
                type="button"
                onClick={() => setActivePage('new-voucher')}
                className="h-9 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
              >
                <Plus className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                <span>New Expense (F4)</span>
              </button>
            )}

            {can('can_disburse_advance') && (
              <button
                type="button"
                onClick={() => setAdvanceModalOpen(true)}
                className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <HandCoins className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Give Advance</span>
              </button>
            )}

            {can('can_export_tally') && (
              <button
                type="button"
                onClick={handleExportTally}
                className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Export all vouchers in Tally Prime compatible CSV format"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span className="hidden sm:inline">Tally Export</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="h-9 w-9 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] transition-colors cursor-pointer"
              title="Refresh Dashboard"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[#3ecf8e]")} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Studio Content Area */}
      <div className="px-4 lg:px-6 py-4 space-y-4 flex-1">
        {/* Period Locked Notice Banner */}
        {isPeriodLocked && (
          <div className="p-3 rounded-[12px] bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 text-xs font-sans">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Day-End Period Locked:</strong> Today's register has been closed by the cashier. New expenses are disabled until the next session is unlocked.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('closing')}
              className="px-2.5 py-1 rounded-[6px] bg-amber-500/20 hover:bg-amber-500/30 font-medium text-[11px] shrink-0 transition-colors"
            >
              View Closing (F9)
            </button>
          </div>
        )}

        {/* Safe Drop Alert Banner */}
        {isSafeDropAlert && (
          <div className="p-3 rounded-[12px] bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 text-xs font-sans">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Cash Ceiling Exceeded:</strong> Cash in box ({formatINR(cashBalance)}) exceeds branch threshold ({formatINR(maxCashCeiling)}). Please transfer surplus cash to the safe.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('treasury')}
              className="px-2.5 py-1 rounded-[6px] bg-amber-500/20 hover:bg-amber-500/30 font-medium text-[11px] shrink-0 transition-colors"
            >
              Transfer to Safe
            </button>
          </div>
        )}

        {/* Tier 2: Supabase Studio Filter & Period Slicers Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-[8px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#161616] shadow-2xs">
          {/* Time-Range & Mode Slicers */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time-Range Segmented Group */}
            <SegmentedControl
              options={[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'quarter', label: 'Quarter' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom' },
              ]}
              value={timeRange}
              onChange={(val) => {
                setTimeRange(val as typeof timeRange);
                if (val === 'custom') setIsCustomDateOpen(true);
                else setIsCustomDateOpen(false);
              }}
              size="sm"
            />

            {/* Payment Mode Segmented Group */}
            <SegmentedControl
              options={[
                { id: 'ALL', label: 'All Modes' },
                { id: 'Physical_Cash', label: 'Cash' },
                { id: 'Online_UPI', label: 'UPI' },
              ]}
              value={selectedMode}
              onChange={(val) => setSelectedMode(val as typeof selectedMode)}
              size="sm"
            />
          </div>

          {/* Category & Department Filters + Active Count */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Select */}
            <div className="w-38 sm:w-44">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: 'All Categories' },
                  ...categories.map((c) => ({ value: c.category_name, label: c.category_name })),
                ]}
                value={selectedCategory}
                onChange={setSelectedCategory}
                allowCustom={false}
                placeholder="Category"
                triggerClassName="!rounded-[6px] !bg-slate-50/80 dark:!bg-[#1a1a1a] !border-slate-200/80 dark:!border-[#282828] hover:!border-slate-300 dark:hover:!border-[#383838] !h-8 !text-xs !shadow-2xs text-slate-800 dark:text-zinc-200"
              />
            </div>

            {/* Department Select */}
            <div className="w-38 sm:w-44">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: 'All Departments' },
                  ...departments.map((d) => ({ value: d.department_name, label: d.department_name })),
                ]}
                value={selectedDept}
                onChange={setSelectedDept}
                allowCustom={false}
                placeholder="Department"
                triggerClassName="!rounded-[6px] !bg-slate-50/80 dark:!bg-[#1a1a1a] !border-slate-200/80 dark:!border-[#282828] hover:!border-slate-300 dark:hover:!border-[#383838] !h-8 !text-xs !shadow-2xs text-slate-800 dark:text-zinc-200"
              />
            </div>

            {/* Reset Filters Chip */}
            {activeSlicerCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTimeRange('today');
                  setSelectedMode('ALL');
                  setSelectedCategory('ALL');
                  setSelectedDept('ALL');
                  setIsCustomDateOpen(false);
                }}
                className="h-8 px-2.5 rounded-[6px] text-xs font-sans font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ({activeSlicerCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Picker Drawer/Bar */}
        {isCustomDateOpen && (
          <div className="p-3 bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] rounded-[12px] flex flex-wrap items-center gap-3 animate-in fade-in duration-100 shadow-xs relative z-10">
            <span className="text-xs text-slate-600 dark:text-[#A1A1A1] font-sans font-medium">Select Range:</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40 sm:w-44">
                <DatePicker
                  value={customStartDate}
                  onChange={setCustomStartDate}
                  placeholder="Start date"
                  allowPastDatesOverride={true}
                  size="sm"
                />
              </div>
              <span className="text-xs text-slate-400 dark:text-[#737373] font-mono">to</span>
              <div className="w-40 sm:w-44">
                <DatePicker
                  value={customEndDate}
                  onChange={setCustomEndDate}
                  placeholder="End date"
                  allowPastDatesOverride={true}
                  size="sm"
                />
              </div>
            </div>
            {(customStartDate || customEndDate) && (
              <span className="text-[11px] font-mono text-emerald-700 dark:text-[#3ecf8e] font-semibold">
                Filtered: {filteredVouchers.length} vouchers
              </span>
            )}
          </div>
        )}

        {/* 2. 4 Metric Cards Telemetry Matrix */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI 1: Total Spend */}
          <MetricCard
            label="Total Expenses"
            value={formatINR(metrics.totalSpend)}
            subValue={`${metrics.totalBills} bills recorded`}
            badge={timeRangeLabel}
            badgeColor="neutral"
            icon={Receipt}
            onClick={() => setActivePage('expenses')}
          />

          {/* KPI 2: Cash in Drawer */}
          <MetricCard
            label="Cash in Box"
            value={formatINR(cashBalance)}
            statusText={isSafeDropAlert ? 'Move Extra Cash to Safe' : 'Cash Box Normal'}
            statusDotColor={isSafeDropAlert ? '#f59e0b' : '#3ecf8e'}
            badge={isSafeDropAlert ? 'ALERT' : undefined}
            badgeColor={isSafeDropAlert ? 'amber' : undefined}
            icon={Wallet}
            onClick={() => setActivePage('treasury')}
          />

          {/* KPI 3: Bank Account / UPI */}
          <MetricCard
            label="Bank UPI"
            value={formatINR(upiBalance)}
            subValue={`${metrics.upiBills} online payments`}
            statusDotColor="#3b82f6"
            icon={Building2}
            onClick={() => setActivePage('treasury')}
          />

          {/* KPI 4: Staff Advances Due */}
          <MetricCard
            label="Staff Advances Due"
            value={formatINR(advanceMetrics.totalUnsettled)}
            statusText={`${advanceMetrics.pendingCount} staff advances pending`}
            statusDotColor={advanceMetrics.pendingCount > 0 ? '#f59e0b' : '#3ecf8e'}
            badge={advanceMetrics.pendingCount > 0 ? `${advanceMetrics.pendingCount} PENDING` : 'CLEARED'}
            badgeColor={advanceMetrics.pendingCount > 0 ? 'amber' : 'emerald'}
            icon={HandCoins}
            onClick={() => setActivePage('advances')}
          />
        </div>

        {/* 3. Main Visual 1: Spend Velocity & 24h Activity Histogram */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#3ecf8e]" />
              <h2 className="text-sm font-medium text-slate-900 dark:text-white font-sans">
                Expenses Over Time & Activity
              </h2>
              <span className="text-xs font-mono text-slate-500 dark:text-[#737373]">
                ({metrics.totalBills} bills · {timeRangeLabel})
              </span>
            </div>
          </div>

          <LogsBarChart metrics={metrics} vouchers={filteredVouchers} />
        </div>

        {/* 4. Main Visual 2: Department Allocation & Category Spend Flow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Department Allocation Breakdown */}
          <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-[#3ecf8e]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                    Department Expenses
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1A1]">
                    Expenses by floor team & department
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                Total: {formatINR(metrics.totalSpend)}
              </span>
            </div>

            {/* Continuous Multi-Segment Bar */}
            {departmentStats.length > 0 && metrics.totalSpend > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="w-full h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-[#1f1f1f] flex border border-slate-200 dark:border-[#2e2e2e]">
                  {departmentStats.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: item.color }}
                      className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`${item.name}: ${formatINR(item.amount)} (${item.percentage}%)`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Department Breakdown List */}
            <div className="space-y-2">
              {departmentStats.length === 0 ? (
                <div className="py-8 text-center text-slate-500 dark:text-[#737373] text-xs font-sans">
                  No department expense records in selected period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#242424]">
                  {departmentStats.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 px-2 flex flex-col gap-1.5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] rounded-[6px] transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium font-sans text-slate-900 dark:text-white truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] text-[10px] font-mono text-slate-600 dark:text-[#A1A1A1] font-medium shrink-0">
                            {item.count} {item.count === 1 ? 'bill' : 'bills'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatINR(item.amount)}
                          </span>
                          <span className="w-12 text-right px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono font-medium text-slate-600 dark:text-[#A1A1A1] tabular-nums">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {departmentStats.length > 0 && (
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-[#A1A1A1] pt-2.5 border-t border-slate-100 dark:border-[#242424]">
                <span>{departmentStats.length} Active Departments</span>
                <span className="truncate ml-2 text-right">
                  Top: <strong className="text-slate-900 dark:text-white">{departmentStats[0]?.name}</strong> ({departmentStats[0]?.percentage}%)
                </span>
              </div>
            )}
          </div>

          {/* Category Spend Distribution */}
          <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
                  <PieChart className="w-4 h-4 text-[#3ecf8e]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                    Where Was Money Spent?
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                    Expenses by category
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                {categoryStats.length} Categories
              </span>
            </div>

            {/* Continuous Multi-Segment Bar */}
            {categoryStats.length > 0 && metrics.totalSpend > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="w-full h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-[#1f1f1f] flex border border-slate-200 dark:border-[#2e2e2e]">
                  {categoryStats.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: item.color }}
                      className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`${item.name}: ${formatINR(item.amount)} (${item.percentage}%)`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Category Breakdown List */}
            <div className="space-y-2">
              {categoryStats.length === 0 ? (
                <div className="py-8 text-center text-slate-500 dark:text-[#737373] text-xs font-sans">
                  No category expense records found in selected period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#242424]">
                  {categoryStats.slice(0, 7).map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 px-2 flex flex-col gap-1.5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] rounded-[6px] transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium font-sans text-slate-900 dark:text-white truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] text-[10px] font-mono text-slate-600 dark:text-[#A1A1A1] font-medium shrink-0">
                            {item.count} {item.count === 1 ? 'bill' : 'bills'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatINR(item.amount)}
                          </span>
                          <span className="w-12 text-right px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono font-medium text-slate-600 dark:text-[#A1A1A1] tabular-nums">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {categoryStats.length > 0 && (
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-[#A1A1A1] pt-2.5 border-t border-slate-100 dark:border-[#242424]">
                <span>100% Accounted</span>
                <span className="truncate ml-2 text-right">
                  Top: <strong className="text-slate-900 dark:text-white">{categoryStats[0]?.name}</strong> ({categoryStats[0]?.percentage}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5. Recent Expense Records Table */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#3ecf8e]" />
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-white font-sans">Recent Expenses & Bills</h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Latest payments ({filteredVouchers.length} bills in selected timeframe)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('expenses')}
              className="px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-100 dark:bg-[#1a1a1a] hover:bg-slate-200 dark:hover:bg-[#222222] text-xs font-medium text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer font-sans"
            >
              <span>View All Expenses</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <VoucherTable
              vouchers={filteredVouchers}
              categories={categories}
              departments={departments}
              hideTelemetry={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
