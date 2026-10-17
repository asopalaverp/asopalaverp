import React, { useState, useMemo, useRef } from 'react';
import { format as formatDateFns, subDays, startOfMonth } from 'date-fns';
import { WalletLedger } from '@/types/database';
import { formatINR, cn, triggerHaptic, formatDate } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Layers,
  Search,
  X,
  Calendar,
  Download,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Clock,
  Building2,
  Coins,
} from 'lucide-react';

export interface TreasuryPassbookTableProps {
  entries: WalletLedger[];
  currentCashBalance: number;
  currentUpiBalance: number;
  selectedBranchId?: string;
  selectedDayFilter?: string | null;
  onClearDayFilter?: () => void;
  voucherMap?: Map<string, { category_name: string; recipient_name: string; total_amount: number; payment_method: string }>;
  className?: string;
}

type DateFilterOption = 'this_month' | 'today' | 'yesterday' | 'week' | 'all' | 'custom';
type ScopeFilterOption = 'ALL' | 'INFLOW' | 'OUTFLOW' | 'Float_Topup' | 'Expense_Voucher' | 'Safe_Drop';
type WalletChannelFilter = 'ALL' | 'Cash' | 'UPI';
type SortOption = 'newest' | 'oldest' | 'highest_amount' | 'lowest_amount';

function parseLedgerNotes(remarks?: string | null) {
  if (!remarks) return { title: 'Cash Flow Entry', chips: [], modeDetails: null };

  let title = remarks;
  const chips: string[] = [];
  let modeDetails: string | null = null;

  const modeMatch = title.match(/\[Transfer Mode:\s*([^\]]+)\]/i);
  if (modeMatch) {
    modeDetails = modeMatch[1].trim();
    title = title.replace(modeMatch[0], '').trim();
  }

  const dateMatch = title.match(/\[Date:\s*([^\]]+)\]/i);
  if (dateMatch) {
    title = title.replace(dateMatch[0], '').trim();
  }

  const notesMatch = title.match(/\[(?:Notes:\s*)?([^\]]+)\]/i);
  if (notesMatch) {
    const rawBreakdown = notesMatch[1];
    if (rawBreakdown.includes('₹') || rawBreakdown.includes('x') || rawBreakdown.includes('×') || rawBreakdown.includes('=')) {
      const parts = rawBreakdown.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      parts.forEach((p) => {
        chips.push(p);
      });
      title = title.replace(notesMatch[0], '').trim();
    }
  }

  if (!title) {
    title = 'Showroom Float Movement';
  }

  return { title, chips, modeDetails };
}

export const TreasuryPassbookTable: React.FC<TreasuryPassbookTableProps> = ({
  entries,
  currentCashBalance,
  currentUpiBalance,
  selectedBranchId = 'Aellp-ASI',
  selectedDayFilter,
  onClearDayFilter,
  voucherMap = new Map(),
  className,
}) => {
  const [scopeFilter, setScopeFilter] = useState<ScopeFilterOption>('ALL');
  const [channelFilter, setChannelFilter] = useState<WalletChannelFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleCopy = (refText: string) => {
    triggerHaptic('success');
    navigator.clipboard.writeText(refText);
    setCopiedRef(refText);
    showToast({
      type: 'success',
      title: 'Reference Copied',
      message: `Copied #${refText} to clipboard.`,
    });
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const dateBounds = useMemo(() => {
    const now = new Date();
    const todayStr = formatDateFns(now, 'yyyy-MM-dd');

    if (selectedDayFilter) {
      return { start: selectedDayFilter, end: selectedDayFilter, label: selectedDayFilter };
    }

    switch (dateFilter) {
      case 'today':
        return { start: todayStr, end: todayStr, label: 'Today' };
      case 'yesterday': {
        const yStr = formatDateFns(subDays(now, 1), 'yyyy-MM-dd');
        return { start: yStr, end: yStr, label: 'Yesterday' };
      }
      case 'week': {
        const wStr = formatDateFns(subDays(now, 7), 'yyyy-MM-dd');
        return { start: wStr, end: todayStr, label: 'Last 7 Days' };
      }
      case 'this_month': {
        const mStr = formatDateFns(startOfMonth(now), 'yyyy-MM-dd');
        return { start: mStr, end: todayStr, label: 'This Month' };
      }
      case 'custom':
        return {
          start: customStartDate || undefined,
          end: customEndDate || undefined,
          label: customStartDate && customEndDate ? `${customStartDate} to ${customEndDate}` : 'Custom Range',
        };
      case 'all':
      default:
        return { start: undefined, end: undefined, label: 'All Time' };
    }
  }, [dateFilter, customStartDate, customEndDate, selectedDayFilter]);

  const entriesWithRunningBalance = useMemo(() => {
    const chronological = [...entries].sort(
      (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
    );

    const totalCashNet = chronological
      .filter((e) => e?.wallet_type === 'Cash' || !e?.wallet_type)
      .reduce((sum, e) => sum + ((Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0)), 0);

    const totalUpiNet = chronological
      .filter((e) => e?.wallet_type === 'UPI')
      .reduce((sum, e) => sum + ((Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0)), 0);

    let runningCash = currentCashBalance - totalCashNet;
    let runningUpi = currentUpiBalance - totalUpiNet;
    const balanceMap = new Map<string, { runningCash: number; runningUpi: number }>();

    chronological.forEach((entry) => {
      if (!entry) return;
      const credit = Number(entry.credit_amount) || 0;
      const debit = Number(entry.debit_amount) || 0;
      const isUpi = entry.wallet_type === 'UPI';

      if (isUpi) {
        runningUpi += credit - debit;
      } else {
        runningCash += credit - debit;
      }

      const key = entry.id || `${entry.created_at}-${entry.credit_amount}-${entry.debit_amount}`;
      balanceMap.set(key, { runningCash, runningUpi });
    });

    return balanceMap;
  }, [entries, currentCashBalance, currentUpiBalance]);

  const filteredEntries = useMemo(() => {
    let list = entries;

    if (scopeFilter === 'INFLOW') {
      list = list.filter((l) => (Number(l.credit_amount) || 0) > 0);
    } else if (scopeFilter === 'OUTFLOW') {
      list = list.filter((l) => (Number(l.debit_amount) || 0) > 0);
    } else if (scopeFilter !== 'ALL') {
      list = list.filter((l) => l.transaction_type === scopeFilter);
    }

    if (channelFilter !== 'ALL') {
      list = list.filter((l) => l.wallet_type === channelFilter);
    }

    if (selectedDayFilter) {
      list = list.filter((l) => (l.created_at || '').slice(0, 10) === selectedDayFilter);
    } else {
      if (dateBounds.start) {
        list = list.filter((l) => (l.created_at || '').slice(0, 10) >= dateBounds.start!);
      }
      if (dateBounds.end) {
        list = list.filter((l) => (l.created_at || '').slice(0, 10) <= dateBounds.end!);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((l) => {
        const vInfo = l.reference_number ? voucherMap.get(l.reference_number) : null;
        return (
          (l.remarks && l.remarks.toLowerCase().includes(q)) ||
          (l.cashier_name && l.cashier_name.toLowerCase().includes(q)) ||
          (l.authorized_by_name && l.authorized_by_name.toLowerCase().includes(q)) ||
          (l.reference_number && l.reference_number.toLowerCase().includes(q)) ||
          (vInfo?.recipient_name && vInfo.recipient_name.toLowerCase().includes(q)) ||
          (vInfo?.category_name && vInfo.category_name.toLowerCase().includes(q)) ||
          String(l.credit_amount || l.debit_amount || '').includes(q)
        );
      });
    }

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
  }, [entries, scopeFilter, channelFilter, selectedDayFilter, dateBounds, searchQuery, sortBy, voucherMap]);

  const summaryTotals = useMemo(() => {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let cashCount = 0;
    let upiCount = 0;

    filteredEntries.forEach((e) => {
      const credit = Number(e.credit_amount) || 0;
      const debit = Number(e.debit_amount) || 0;
      totalDeposits += credit;
      totalWithdrawals += debit;
      if (e.wallet_type === 'UPI') upiCount++;
      else cashCount++;
    });

    return {
      totalDeposits,
      totalWithdrawals,
      netFlow: totalDeposits - totalWithdrawals,
      cashCount,
      upiCount,
      totalCount: filteredEntries.length,
    };
  }, [filteredEntries]);

  const paginatedEntries = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredEntries.slice(startIdx, startIdx + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));

  const handleExportPassbookCSV = () => {
    triggerHaptic('success');

    let csv = `ASOPALAV ENDEAVOURS LLP - TREASURY PASSBOOK REGISTER\n`;
    csv += `Exported On: ${formatDateFns(new Date(), 'dd-MMM-yyyy HH:mm:ss')}\n`;
    csv += `Branch: ${selectedBranchId} | Verified Drawer Cash: ${formatINR(currentCashBalance)} | Bank UPI: ${formatINR(currentUpiBalance)}\n`;
    csv += `Filter Scope: ${scopeFilter} | Channel: ${channelFilter} | Date: ${dateBounds.label}\n\n`;

    csv += `Line #,Date & Time,Account Channel,Voucher / Slip #,Particulars & Description,Category,Payee / Vendor,Withdrawal Debit (INR),Deposit Credit (INR),Running Balance (INR),Cashier / Handled By\n`;

    filteredEntries.forEach((entry, idx) => {
      const credit = Number(entry.credit_amount) || 0;
      const debit = Number(entry.debit_amount) || 0;
      const parsed = parseLedgerNotes(entry.remarks);
      const isUpi = entry.wallet_type === 'UPI';
      const entryKey = entry.id || `${entry.created_at}-${entry.credit_amount}-${entry.debit_amount}`;
      const balances = entriesWithRunningBalance.get(entryKey);
      const runningBal = isUpi ? balances?.runningUpi : balances?.runningCash;
      const vInfo = entry.reference_number ? voucherMap.get(entry.reference_number) : null;

      const dateStr = formatDate(entry.created_at, 'dd-MMM-yyyy HH:mm:ss');
      const channel = isUpi ? 'Bank UPI' : 'Cash Drawer Till';
      const refNo = entry.reference_number || entry.id || '';
      const particular = (parsed.title || '').replace(/"/g, '""');
      const category = (vInfo?.category_name || '').replace(/"/g, '""');
      const payee = (vInfo?.recipient_name || '').replace(/"/g, '""');
      const cashier = (entry.cashier_name || '').replace(/"/g, '""');

      csv += `${idx + 1},"${dateStr}","${channel}","${refNo}","${particular}","${category}","${payee}",${debit.toFixed(2)},${credit.toFixed(2)},${(runningBal || 0).toFixed(2)},"${cashier}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `asopalav_treasury_passbook_${formatDateFns(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast({
      type: 'success',
      title: 'Passbook CSV Exported',
      message: `${filteredEntries.length} records downloaded.`,
    });
  };

  const handlePrint = () => {
    triggerHaptic('selection');
    window.print();
  };

  return (
    <div
      className={cn(
        'rounded-[12px] bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-xs space-y-3.5 overflow-hidden',
        className
      )}
    >
      {/* 1. Header & Actions */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#242424] bg-slate-50/70 dark:bg-[#1b1b1e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 text-[#3ecf8e] flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white font-sans">
                Treasury Passbook &amp; Flow Register
              </h2>
              <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20">
                {filteredEntries.length} records
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8E8E93] font-sans mt-0.5">
              Double-entry passbook statement with real-time running balance per channel.
            </p>
          </div>
        </div>

        {/* Action Controls: Export CSV & Print */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={handleExportPassbookCSV}
            className="h-8 px-2.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202024] text-slate-700 dark:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#282828] text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            title="Export as CSV for Excel / CA"
          >
            <Download className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="h-8 px-2.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202024] text-slate-700 dark:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-[#282828] text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            title="Print Passbook"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* 2. Filters Toolbar */}
      <div className="px-3.5 sm:px-4 space-y-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by bill #, payee, category, remarks, cashier..."
              className="w-full h-8 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-[6px] pl-8 pr-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#737373] focus:outline-none focus:border-[#3ecf8e] transition-colors font-sans shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Account Channel Selector (Cash Drawer vs Bank UPI) */}
          <div className="inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] shrink-0 text-xs">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setChannelFilter('ALL');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2.5 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer',
                channelFilter === 'ALL'
                  ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              All Accounts
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setChannelFilter('Cash');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2.5 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer flex items-center gap-1',
                channelFilter === 'Cash'
                  ? 'bg-white dark:bg-[#282828] text-emerald-700 dark:text-[#3ecf8e] shadow-2xs'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Coins className="w-3 h-3 text-emerald-500" />
              <span>Cash Drawer</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setChannelFilter('UPI');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2.5 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer flex items-center gap-1',
                channelFilter === 'UPI'
                  ? 'bg-white dark:bg-[#282828] text-blue-700 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Building2 className="w-3 h-3 text-blue-500" />
              <span>Bank UPI</span>
            </button>
          </div>
        </div>

        {/* Row 2: Flow Direction & Date Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Flow Direction */}
          <div className="inline-flex rounded-[6px] p-0.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeFilter('ALL');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer whitespace-nowrap',
                scopeFilter === 'ALL'
                  ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              All Flows
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeFilter('INFLOW');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer flex items-center gap-1 text-emerald-700 dark:text-[#3ecf8e] whitespace-nowrap',
                scopeFilter === 'INFLOW'
                  ? 'bg-white dark:bg-[#282828] shadow-2xs font-semibold'
                  : 'hover:bg-slate-200/50 dark:hover:bg-[#222]'
              )}
            >
              <ArrowDownLeft className="w-3 h-3 stroke-[2.5]" />
              <span>+ Inflows</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeFilter('OUTFLOW');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer flex items-center gap-1 text-rose-700 dark:text-rose-400 whitespace-nowrap',
                scopeFilter === 'OUTFLOW'
                  ? 'bg-white dark:bg-[#282828] shadow-2xs font-semibold'
                  : 'hover:bg-slate-200/50 dark:hover:bg-[#222]'
              )}
            >
              <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
              <span>- Outflows</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeFilter('Float_Topup');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer whitespace-nowrap',
                scopeFilter === 'Float_Topup'
                  ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              Top-ups
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeFilter('Expense_Voucher');
                setCurrentPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-[4px] font-sans font-medium transition-all cursor-pointer whitespace-nowrap',
                scopeFilter === 'Expense_Voucher'
                  ? 'bg-white dark:bg-[#282828] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-white'
              )}
            >
              Bills
            </button>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: '7 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom...' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  if (onClearDayFilter) onClearDayFilter();
                  setDateFilter(d.id as DateFilterOption);
                  setCurrentPage(1);
                }}
                className={cn(
                  'h-7 px-2.5 rounded-[4px] text-[11px] font-medium border transition-all cursor-pointer',
                  dateFilter === d.id && !selectedDayFilter
                    ? 'bg-[#3ecf8e] text-[#171717] border-[#3ecf8e] font-semibold'
                    : 'bg-white dark:bg-[#202024] text-slate-600 dark:text-[#A1A1A1] border-slate-200 dark:border-[#2e2e2e] hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === 'custom' && !selectedDayFilter && (
          <div className="p-2.5 rounded-[6px] bg-slate-50 dark:bg-[#1a1a1e] border border-slate-200 dark:border-[#282828] flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Custom Range:</span>
            <div className="w-32">
              <DatePicker
                value={customStartDate}
                onChange={(val) => {
                  setCustomStartDate(val);
                  setCurrentPage(1);
                }}
                placeholder="From Date"
              />
            </div>
            <span className="text-slate-400">to</span>
            <div className="w-32">
              <DatePicker
                value={customEndDate}
                onChange={(val) => {
                  setCustomEndDate(val);
                  setCurrentPage(1);
                }}
                placeholder="To Date"
              />
            </div>
          </div>
        )}

        {/* Selected Day Inspector Alert */}
        {selectedDayFilter && (
          <div className="p-2.5 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 text-xs font-sans">
            <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-medium">
              <Calendar className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>
                Inspecting single day: <strong className="underline text-slate-900 dark:text-white">{selectedDayFilter}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onClearDayFilter && onClearDayFilter()}
              className="px-2 py-0.5 rounded-[4px] border border-emerald-500/30 bg-white dark:bg-[#202024] text-[11px] font-semibold text-slate-800 dark:text-white hover:bg-emerald-50 dark:hover:bg-[#282828] cursor-pointer"
            >
              Show All Days
            </button>
          </div>
        )}
      </div>

      {/* 3. Passbook Table */}
      <div className="border-t border-b border-slate-200 dark:border-[#242424] overflow-hidden bg-white dark:bg-[#171717]">
        <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50 dark:bg-[#141414] text-[11px] text-slate-500 dark:text-[#A1A1A1] font-sans font-medium">
                <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Date &amp; Time</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Account</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Voucher / Slip #</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap text-rose-600 dark:text-rose-400">Withdrawal (-)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap text-emerald-600 dark:text-[#3ecf8e]">Deposit (+)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap text-slate-900 dark:text-white">Running Balance</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Handled By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#242424]">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center">
                    <EmptyState
                      icon={RotateCcw}
                      title="No passbook records found"
                      description="No transactions match the selected filter criteria."
                      actionLabel="Reset Filters"
                      onAction={() => {
                        setSearchQuery('');
                        setScopeFilter('ALL');
                        setChannelFilter('ALL');
                        setDateFilter('this_month');
                        if (onClearDayFilter) onClearDayFilter();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry, idx) => {
                  const credit = Number(entry.credit_amount) || 0;
                  const debit = Number(entry.debit_amount) || 0;
                  const parsed = parseLedgerNotes(entry.remarks);
                  const isUpi = entry.wallet_type === 'UPI';
                  const isSafeDrop = entry.transaction_type === 'Safe_Drop';
                  const entryKey = entry.id || `${entry.created_at}-${entry.credit_amount}-${entry.debit_amount}`;
                  const balances = entriesWithRunningBalance.get(entryKey);
                  const runningBal = isUpi ? balances?.runningUpi : balances?.runningCash;
                  const rowSeq = (currentPage - 1) * pageSize + idx + 1;
                  const refCode = entry.reference_number || (entry.id ? String(entry.id).slice(0, 8).toUpperCase() : 'TRZ-AUTO');
                  const vInfo = entry.reference_number ? voucherMap.get(entry.reference_number) : null;

                  return (
                    <tr
                      key={entryKey}
                      className="hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors"
                    >
                      {/* # */}
                      <td className="py-2.5 px-3 text-slate-400 dark:text-zinc-500 font-mono text-[11px] whitespace-nowrap">
                        #{rowSeq}
                      </td>

                      {/* Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-900 dark:text-white font-mono text-xs">
                            {formatDate(entry.created_at, 'dd MMM yyyy')}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDate(entry.created_at, 'HH:mm')} ({formatDate(entry.created_at, 'EEE')})
                          </span>
                        </div>
                      </td>

                      {/* Account Channel */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] font-sans font-medium text-[11px] border',
                            isUpi
                              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                              : 'bg-emerald-50 dark:bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-200 dark:border-[#3ecf8e]/20'
                          )}
                        >
                          {isUpi ? <Building2 className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                          <span>{entry.wallet_type === 'UPI' ? 'Bank UPI' : 'Cash Drawer'}</span>
                        </span>
                      </td>

                      {/* Voucher / Slip # */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopy(refCode)}
                          className="inline-flex items-center gap-1 font-mono font-medium text-slate-700 dark:text-[#EDEDED] hover:text-[#3ecf8e] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202024] border border-slate-200 dark:border-[#2e2e34] transition-colors cursor-pointer text-xs"
                          title="Copy reference number"
                        >
                          <span>{refCode}</span>
                          {copiedRef === refCode ? (
                            <Check className="w-2.5 h-2.5 text-[#3ecf8e]" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-400" />
                          )}
                        </button>
                      </td>

                      {/* Withdrawal (-) */}
                      <td className="py-2.5 px-3 text-right font-medium tabular-nums whitespace-nowrap">
                        {debit > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold font-mono text-xs">
                            -{formatINR(debit)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-zinc-600 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Deposit (+) */}
                      <td className="py-2.5 px-3 text-right font-medium tabular-nums whitespace-nowrap">
                        {credit > 0 ? (
                          <span className="text-emerald-600 dark:text-[#3ecf8e] font-bold font-mono text-xs">
                            +{formatINR(credit)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-zinc-600 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Running Balance */}
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-bold font-mono text-slate-900 dark:text-white text-xs">
                            {formatINR(runningBal !== undefined ? runningBal : (Number(entry.running_balance) || 0))}
                          </span>
                          <span className="text-[9.5px] font-sans text-slate-400 dark:text-[#737373]">
                            {isUpi ? 'Bank Bal' : 'Till Bal'}
                          </span>
                        </div>
                      </td>

                      {/* Handled By */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 font-sans text-xs text-slate-800 dark:text-zinc-200">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{entry.cashier_name || 'Cashier'}</span>
                          </div>
                          {entry.authorized_by_name && (
                            <span className="text-[10px] text-slate-400 dark:text-[#737373] block font-sans">
                              Auth: {entry.authorized_by_name}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Summary Footer Row */}
            <tfoot className="border-t-2 border-slate-300 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#121212] font-semibold text-slate-900 dark:text-white text-xs">
              <tr>
                <td colSpan={4} className="py-2.5 px-3 font-sans">
                  Total Selection ({filteredEntries.length} records)
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-rose-600 dark:text-rose-400 font-bold">
                  -{formatINR(summaryTotals.totalWithdrawals)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-[#3ecf8e] font-bold">
                  +{formatINR(summaryTotals.totalDeposits)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                  Net: {summaryTotals.netFlow >= 0 ? `+${formatINR(summaryTotals.netFlow)}` : formatINR(summaryTotals.netFlow)}
                </td>
                <td className="py-2.5 px-3 text-slate-500 font-sans text-[11px]">
                  {summaryTotals.cashCount} Cash · {summaryTotals.upiCount} UPI
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. Pagination */}
      <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-sans">
        <div className="flex items-center gap-2 text-slate-500 dark:text-[#8E8E93]">
          <span>
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong>{Math.min(currentPage * pageSize, filteredEntries.length)}</strong> of{' '}
            <strong>{filteredEntries.length}</strong> records
          </span>

          <div className="flex items-center gap-1 ml-2">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-7 px-1.5 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-[#3ecf8e] cursor-pointer"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => {
              triggerHaptic('selection');
              setCurrentPage((p) => Math.max(1, p - 1));
            }}
            className="h-7 px-2.5 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202024] text-slate-700 dark:text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="px-2 font-mono text-slate-700 dark:text-zinc-300">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => {
              triggerHaptic('selection');
              setCurrentPage((p) => Math.min(totalPages, p + 1));
            }}
            className="h-7 px-2.5 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202024] text-slate-700 dark:text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TreasuryPassbookTable;
