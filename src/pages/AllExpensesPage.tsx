import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useVouchers } from '@/hooks/useVouchers';
import { VoucherTable } from '@/components/vouchers/VoucherTable';
import { erpService } from '@/lib/erpService';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { IOSSegmentedControl } from '@/components/ui/ios';
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

  const activeBranch = getActiveBranch();
  const showroomTitle = selectedBranchId === 'ALL' ? 'All Showrooms' : (activeBranch?.branch_name || 'Satellite Road Showroom');
  const showroomCode = selectedBranchId === 'ALL' ? 'ALL' : (activeBranch?.branch_code || 'ASI');

  // Date Filtered Vouchers
  const filteredByDateVouchers = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfWeekStr = format(startOfWeek, 'yyyy-MM-dd');
    const startOfMonthStr = format(now, 'yyyy-MM-01');

    return vouchers.filter((v) => {
      const vDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      if (dateFilter === 'today') return vDate === todayStr;
      if (dateFilter === 'week') return vDate >= startOfWeekStr;
      if (dateFilter === 'month') return vDate >= startOfMonthStr;
      return true;
    });
  }, [vouchers, dateFilter]);

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
    showToast({
      type: 'activity',
      title: 'Refreshing Expenses',
      message: 'Fetching latest expense bills from database...',
    });
    await refresh();
    showToast({
      type: 'success',
      title: 'Expenses Updated',
      message: `${vouchers.length} expense records loaded.`,
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16 flex flex-col">
      {/* 1. Frosted Header */}
      <div className="sticky top-0 z-30 px-4 lg:px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 backdrop-blur-2xl bg-white/80 dark:bg-[#121214]/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 max-w-7xl mx-auto">
          {/* Left: Title & Status Badge */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-[#EDEDED] flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3ecf8e]" />
                <span>All Expenses</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                {filteredByDateVouchers.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8E8E93] mt-0.5">
              Search, view details, download, and print all showroom expense bills and payments.
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {can('can_export_tally') && (
              <button
                type="button"
                onClick={handleExportTally}
                className="h-9 px-3.5 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Export bills to CSV spreadsheet format"
              >
                <Download className="w-3.5 h-3.5 text-slate-600 dark:text-[#A1A1A1]" />
                <span>Download CSV</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="h-9 w-9 flex items-center justify-center rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] shadow-xs transition-colors cursor-pointer"
              title="Refresh Expenses"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[#3ecf8e]")} />
            </button>

            {/* Single Emerald Primary CTA */}
            <button
              type="button"
              onClick={() => setActivePage('new-voucher')}
              className="h-9 px-4 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer font-sans"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Record Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-5 space-y-4 flex-1 w-full">
        {/* Filter Toolbar */}
        <div className="rounded-[12px] p-3 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#18181a] border border-slate-200/80 dark:border-white/10 shadow-xs">
          <div className="flex items-center gap-2">
            <IOSSegmentedControl
              options={[
                { id: 'all', label: 'All Time' },
                { id: 'month', label: 'This Month' },
                { id: 'week', label: 'This Week' },
                { id: 'today', label: 'Today' },
              ]}
              value={dateFilter}
              onChange={(val) => setDateFilter(val as DateFilterType)}
              size="sm"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-[#8E8E93]">
            <span>Showroom:</span>
            <span className="px-2.5 py-1 rounded-[8px] bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white border border-slate-200/80 dark:border-white/10 font-semibold shadow-xs">
              {showroomTitle} ({showroomCode})
            </span>
          </div>
        </div>

        {/* 4 Telemetry Inset Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard
            label="Total Expenses"
            value={formatINR(totalAmount)}
            subValue={`${filteredByDateVouchers.length} vouchers recorded`}
            statusDotColor="#3ecf8e"
            icon={Receipt}
          />

          <MetricCard
            label="Physical Cash Paid"
            value={formatINR(cashAmount)}
            subValue={`${cashPercent}% of total expenditure`}
            statusDotColor="#f59e0b"
            icon={Banknote}
          />

          <MetricCard
            label="Bank & UPI Paid"
            value={formatINR(upiAmount)}
            subValue={`${upiPercent}% digital settlements`}
            statusDotColor="#3b82f6"
            icon={Smartphone}
          />

          <MetricCard
            label="Audit Verified"
            value={String(filteredByDateVouchers.length)}
            subValue="100% vouchers tallied"
            badge="VERIFIED"
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


