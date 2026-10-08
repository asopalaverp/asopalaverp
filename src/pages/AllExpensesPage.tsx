import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useVouchers } from '@/hooks/useVouchers';
import { VoucherTable } from '@/components/vouchers/VoucherTable';
import { erpService } from '@/lib/erpService';
import { formatINR, formatCompactINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { SegmentedControl } from '@/components/ui';
import {
  Download,
  Plus,
  Receipt,
  Banknote,
  Smartphone,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';

type DateFilterType = 'today' | 'week' | 'month' | 'all';

export const AllExpensesPage: React.FC = () => {
  const { setActivePage } = useUIStore();
  const { can } = useAuthStore();
  const { selectedBranchId, getActiveBranch } = useBranchStore();
  const { vouchers, categories, departments, loading, refresh } = useVouchers();
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [selectedMode, setSelectedMode] = useState<'ALL' | 'Physical_Cash' | 'Online_UPI'>('ALL');

  const activeBranch = getActiveBranch();
  const showroomTitle = selectedBranchId === 'ALL' ? 'All Showrooms' : (activeBranch?.branch_name || 'Satellite Road Showroom');
  const showroomCode = selectedBranchId === 'ALL' ? 'ALL' : (activeBranch?.branch_code || 'ASI');

  // Filtered Vouchers by Date and Payment Mode
  const filteredByDateVouchers = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfWeekStr = format(startOfWeek, 'yyyy-MM-dd');
    const startOfMonthStr = format(now, 'yyyy-MM-01');

    return vouchers.filter((v) => {
      const vDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      if (dateFilter === 'today' && vDate !== todayStr) return false;
      if (dateFilter === 'week' && vDate < startOfWeekStr) return false;
      if (dateFilter === 'month' && vDate < startOfMonthStr) return false;
      if (selectedMode !== 'ALL' && v.payment_method !== selectedMode) return false;
      return true;
    });
  }, [vouchers, dateFilter, selectedMode]);

  // Totals calculations (active valid vouchers only)
  const activeValidVouchers = useMemo(() => {
    return filteredByDateVouchers.filter((v) => v.status !== 'Voided');
  }, [filteredByDateVouchers]);

  const totalAmount = useMemo(() => {
    return activeValidVouchers.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  }, [activeValidVouchers]);

  const cashAmount = useMemo(() => {
    return activeValidVouchers
      .filter((v) => v.payment_method === 'Physical_Cash')
      .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  }, [activeValidVouchers]);

  const upiAmount = useMemo(() => {
    return activeValidVouchers
      .filter((v) => v.payment_method === 'Online_UPI')
      .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  }, [activeValidVouchers]);

  const cashPercent = totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : 0;
  const upiPercent = totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;

  const handleExportTally = () => {
    try {
      const csvDataUri = erpService.generateTallyExportCSV(filteredByDateVouchers);
      const cleanCsv = csvDataUri.replace(/^data:text\/csv;charset=utf-8,/, '');
      const blob = new Blob([cleanCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Tally_Prime_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({
        type: 'success',
        title: 'Tally CSV Exported',
        message: `Exported ${filteredByDateVouchers.length} expense records for Tally Prime.`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Download Failed',
        message: err?.message || 'Could not export expense data.',
      });
    }
  };

  const handleRefresh = async () => {
    await refresh();
    showToast({
      type: 'success',
      title: 'Expenses Updated',
      message: `${vouchers.length} expense records loaded.`,
    });
  };

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16">
      {/* 1. Header (2-Layer Layout: Left Title & Subtitle, Right Actions) */}
      <div className="px-4 lg:px-6 py-3.5 border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left: Title & Status Badge */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3ecf8e]" />
                <span>All Expenses</span>
              </h1>
              <span className="px-2 py-0.5 rounded-[4px] text-[10px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                {filteredByDateVouchers.length} bills
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8E8E93] mt-0.5">
              View, search, and download all showroom expense bills.
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {can('can_export_tally') && (
              <button
                type="button"
                onClick={handleExportTally}
                className="h-8 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Download CSV for Excel or Tally"
              >
                <Download className="w-3.5 h-3.5 text-slate-600 dark:text-[#A1A1A1]" />
                <span>Download CSV</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="h-8 w-8 flex items-center justify-center rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#242428] shadow-2xs transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[#3ecf8e]")} />
            </button>

            {/* Single Emerald Primary CTA */}
            <button
              type="button"
              onClick={() => setActivePage('new-voucher')}
              className="h-9 px-4 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer font-sans select-none"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="px-4 lg:px-6 py-4 space-y-4 flex-1 w-full">
        {/* Filter Toolbar */}
        <div className="rounded-[12px] p-2.5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#18181a]/70 border border-slate-200 dark:border-[#242424] shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <SegmentedControl
              options={[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'all', label: 'All Time' },
              ]}
              value={dateFilter}
              onChange={(val) => setDateFilter(val as DateFilterType)}
              size="sm"
            />

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

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-[#8E8E93]">
            <span>Branch:</span>
            <span className="px-2 py-0.5 rounded-[4px] bg-white dark:bg-[#202024] text-slate-900 dark:text-white border border-slate-200 dark:border-[#2e2e32] font-semibold text-[11px]">
              {showroomTitle} ({showroomCode})
            </span>
          </div>
        </div>

        {/* 4 Inset Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total Spent"
            value={
              <>
                <span className="sm:hidden">{formatCompactINR(totalAmount)}</span>
                <span className="hidden sm:inline">{formatINR(totalAmount)}</span>
              </>
            }
            subValue={`${filteredByDateVouchers.length} bills recorded`}
            statusDotColor="#3ecf8e"
            icon={Receipt}
          />

          <MetricCard
            label="Cash Paid"
            value={
              <>
                <span className="sm:hidden">{formatCompactINR(cashAmount)}</span>
                <span className="hidden sm:inline">{formatINR(cashAmount)}</span>
              </>
            }
            subValue={`${cashPercent}% of total`}
            statusDotColor="#f59e0b"
            icon={Banknote}
          />

          <MetricCard
            label="UPI Paid"
            value={
              <>
                <span className="sm:hidden">{formatCompactINR(upiAmount)}</span>
                <span className="hidden sm:inline">{formatINR(upiAmount)}</span>
              </>
            }
            subValue={`${upiPercent}% of total`}
            statusDotColor="#3b82f6"
            icon={Smartphone}
          />

          <MetricCard
            label="Total Bills"
            value={String(filteredByDateVouchers.length)}
            subValue="All recorded bills"
            badge="ALL OK"
            badgeColor="emerald"
            statusDotColor="#3ecf8e"
            icon={Layers}
          />
        </div>

        {/* Voucher Data Grid */}
        <VoucherTable
          vouchers={filteredByDateVouchers}
          categories={categories}
          departments={departments}
        />
      </div>
    </div>
  );
};

export default AllExpensesPage;


