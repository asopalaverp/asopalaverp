import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfWeek, startOfMonth, startOfQuarter, subDays, subMonths } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore } from '@/store/uiStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { calculateDailyCashBalances, DayCashRecord } from '@/lib/dailyCashBalance';
import { WalletLedger } from '@/types/database';
import { MetricCard } from '@/components/ui/MetricCard';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import {
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  Wallet,
  RefreshCw,
  Copy,
  Calendar,
  Building2,
  Receipt,
  Check,
  CalendarDays,
  Coins,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type ReportTab = 'daily_cash' | 'tally';
type TimeRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'all'
  | 'custom';

function downloadBlob(filename: string, content: string, mimeType: string = 'text/csv;charset=utf-8;') {
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

export const ReportsPage: React.FC = () => {
  const { user, can } = useAuthStore();
  const { selectedBranchId, branches, getActiveBranch, wallets } = useBranchStore();
  const { setActivePage } = useUIStore();
  const { vouchers, loading: vouchersLoading, refresh: refreshVouchers } = useVouchers();

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReportTab>('daily_cash');

  // Filters State
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMode, setSelectedMode] = useState<'ALL' | 'Physical_Cash' | 'Online_UPI'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(selectedBranchId || 'ALL');

  // Supplementary data states
  const [ledgerEntries, setLedgerEntries] = useState<WalletLedger[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [copiedTally, setCopiedTally] = useState(false);

  // Sync selected branch filter if topbar branch changes
  useEffect(() => {
    if (selectedBranchId) {
      setSelectedBranchFilter(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Current physical cash in branch wallet
  const currentBranchCash = useMemo(() => {
    const targetKey = selectedBranchFilter === 'ALL' ? 'ALL' : selectedBranchFilter;
    const w = wallets[targetKey] || wallets['Aellp-ASI'];
    return w ? Number(w.cash_balance) || 100000 : 100000;
  }, [wallets, selectedBranchFilter]);

  // Load wallet ledger
  const loadExtras = useCallback(async () => {
    setLoadingExtras(true);
    try {
      const branchToQuery = selectedBranchFilter === 'ALL' ? undefined : selectedBranchFilter;
      const ledgerData = await erpService.getWalletLedger(branchToQuery);
      setLedgerEntries(ledgerData);
    } catch (err) {
      console.warn('Error loading ledger data:', err);
    } finally {
      setLoadingExtras(false);
    }
  }, [selectedBranchFilter]);

  useEffect(() => {
    loadExtras();
    const handleWalletUpdate = () => loadExtras();
    window.addEventListener('asopalav:wallet-updated', handleWalletUpdate);
    return () => {
      window.removeEventListener('asopalav:wallet-updated', handleWalletUpdate);
    };
  }, [loadExtras]);

  // Date Range Bounds
  const dateBounds = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    switch (timeRange) {
      case 'today':
        return { start: todayStr, end: todayStr };
      case 'yesterday': {
        const yest = format(subDays(now, 1), 'yyyy-MM-dd');
        return { start: yest, end: yest };
      }
      case 'this_week':
        return {
          start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          end: todayStr,
        };
      case 'this_month':
        return {
          start: format(startOfMonth(now), 'yyyy-MM-dd'),
          end: todayStr,
        };
      case 'last_month': {
        const prevMonth = subMonths(now, 1);
        return {
          start: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
          end: format(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0), 'yyyy-MM-dd'),
        };
      }
      case 'this_quarter':
        return {
          start: format(startOfQuarter(now), 'yyyy-MM-dd'),
          end: todayStr,
        };
      case 'custom':
        return {
          start: customStartDate || '1970-01-01',
          end: customEndDate || '2099-12-31',
        };
      case 'all':
      default:
        return { start: '1970-01-01', end: '2099-12-31' };
    }
  }, [timeRange, customStartDate, customEndDate]);

  // Daily Cash Opening & Closing Engine
  const dailyCashFlow = useMemo(() => {
    return calculateDailyCashBalances(
      ledgerEntries,
      currentBranchCash,
      dateBounds.start !== '1970-01-01' ? dateBounds.start : undefined,
      dateBounds.end !== '2099-12-31' ? dateBounds.end : undefined
    );
  }, [ledgerEntries, currentBranchCash, dateBounds]);

  // Filtered Expense Vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      // 1. Branch filter
      if (selectedBranchFilter !== 'ALL') {
        const branchMatch =
          v.branch_id === selectedBranchFilter ||
          v.branch_code === selectedBranchFilter ||
          (selectedBranchFilter === 'Aellp-ASI' && (v.branch_code === 'ASI' || v.branch_id === 'ASI')) ||
          (selectedBranchFilter === 'Aellp-CG' && (v.branch_code === 'CG' || v.branch_id === 'CG')) ||
          (selectedBranchFilter === 'Aellp-NAV' && (v.branch_code === 'NAV' || v.branch_id === 'NAV')) ||
          (selectedBranchFilter === 'Aellp-SUR' && (v.branch_code === 'SUR' || v.branch_id === 'SUR'));
        if (!branchMatch) return false;
      }

      // 2. Date filter
      const vDate = v.payment_date ? v.payment_date.slice(0, 10) : '';
      if (vDate < dateBounds.start || vDate > dateBounds.end) {
        return false;
      }

      // 3. Payment Mode filter
      if (selectedMode !== 'ALL' && v.payment_method !== selectedMode) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const num = (v.voucher_number || '').toLowerCase();
        const payee = (v.recipient_name || '').toLowerCase();
        const cat = (v.category_name || '').toLowerCase();
        const bill = (v.bill_number || '').toLowerCase();
        const remarks = (v.remarks || '').toLowerCase();
        const staffCode = (v.requested_by_staff_code || '').toLowerCase();
        if (
          !num.includes(query) &&
          !payee.includes(query) &&
          !cat.includes(query) &&
          !bill.includes(query) &&
          !remarks.includes(query) &&
          !staffCode.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [vouchers, selectedBranchFilter, dateBounds, selectedMode, searchQuery]);

  // Active Approved Vouchers (Excluding Voided)
  const approvedVouchers = useMemo(() => {
    return filteredVouchers.filter((v) => v.status !== 'Voided');
  }, [filteredVouchers]);

  // --------------------------------------------------------------------------
  // EXPORT GENERATORS
  // --------------------------------------------------------------------------

  // 1. Daily Cash Statement CSV Export
  const handleExportDailyCashStatement = () => {
    triggerHaptic();
    const headers = [
      'Date',
      'Calendar Day',
      'Opening Cash (INR)',
      'Cash Inflows (+) Float (INR)',
      'Cash Outflows (-) Expenses (INR)',
      'Net Movement (INR)',
      'Closing Cash (INR)',
      'Transaction Count',
      'Status',
    ];

    const rows = dailyCashFlow.days.map((d) => [
      `"${d.date}"`,
      `"${d.displayDate}"`,
      Number(d.opening) || 0,
      Number(d.inflow) || 0,
      Number(d.outflow) || 0,
      Number(d.net) || 0,
      Number(d.closing) || 0,
      d.count,
      `"Balanced"`,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Daily_Cash_Statement_${selectedBranchFilter}_${dateBounds.start}_to_${dateBounds.end}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Cash Statement Exported',
      message: 'Downloaded verified daily opening and closing cash statement.',
    });
  };

  // 2. Tally Prime Master CSV Export
  const handleExportTally = () => {
    triggerHaptic();
    const headers = [
      'Vch Date (YYYY-MM-DD)',
      'Voucher Type',
      'Voucher Number',
      'Reference / Bill No',
      'Cost Centre (Branch)',
      'Department',
      'Debit Ledger (Expense Account)',
      'Debit Amount (INR)',
      'Credit Ledger (Cash / UPI Account)',
      'Credit Amount (INR)',
      'Beneficiary / Payee Name',
      'Payment Mode',
      'Narration / Purpose',
    ];

    const exportRows = approvedVouchers.filter((v) => v.payment_type !== 'Advance_Settlement');

    const rows = exportRows.map((v) => {
      const vDate = v.payment_date ? v.payment_date.slice(0, 10) : '';
      const vType = 'Payment';
      const vNum = v.voucher_number || '';
      const refBill = v.bill_number ? `Bill: ${v.bill_number}` : 'Cash Voucher';
      const branchCode = v.branch_code || (v.branch_id ? v.branch_id.replace(/^Aellp-/, '') : 'ASI');
      const costCentre = `Showroom ${branchCode}`;
      const department = v.department_name || 'General Operations';
      const debitLedger = `${v.category_name || 'General Store Expense'} A/c`;
      const amount = Number(v.total_amount) || 0;
      const creditLedger =
        v.payment_method === 'Physical_Cash'
          ? `Cash on Hand - ${branchCode} A/c`
          : `UPI Current A/c - ${branchCode}`;
      const payee = (v.recipient_name || 'Counter Expense').replace(/"/g, '""');
      const mode = v.payment_method === 'Physical_Cash' ? 'Physical Cash' : 'Online UPI';
      const narration = (v.remarks || `Expense disbursement for ${v.category_name || 'Store Operations'}`).replace(
        /"/g,
        '""'
      );

      return [
        `"${vDate}"`,
        `"${vType}"`,
        `"${vNum}"`,
        `"${refBill}"`,
        `"${costCentre}"`,
        `"${department}"`,
        `"${debitLedger}"`,
        amount,
        `"${creditLedger}"`,
        amount,
        `"${payee}"`,
        `"${mode}"`,
        `"${narration}"`,
      ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    downloadBlob(
      `Asopalav_Tally_Prime_Export_${selectedBranchFilter}_${dateBounds.start}_to_${dateBounds.end}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Tally Prime Export Ready',
      message: `Exported ${exportRows.length} vouchers for accounting entry.`,
    });
  };

  // 2B. Official Tally Prime XML Export (Native Tally Ingestion)
  const handleExportTallyXML = () => {
    triggerHaptic();
    const exportRows = approvedVouchers.filter((v) => v.payment_type !== 'Advance_Settlement');

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const voucherXmls = exportRows
      .map((v) => {
        const vDateStr = v.payment_date ? v.payment_date.slice(0, 10).replace(/-/g, '') : '20261019';
        const branchCode = v.branch_code || (v.branch_id ? v.branch_id.replace(/^Aellp-/, '') : 'ASI');
        const debitLedger = `${v.category_name || 'General Store Expense'} A/c`;
        const creditLedger =
          v.payment_method === 'Physical_Cash'
            ? `Cash on Hand - ${branchCode} A/c`
            : `UPI Current A/c - ${branchCode}`;
        const amount = Number(v.total_amount) || 0;
        const narration = escapeXml(
          v.remarks ||
            `Expense disbursement for ${v.category_name || 'Store Operations'} to ${v.recipient_name || 'Vendor'}`
        );

        return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Payment" ACTION="Create">
          <DATE>${vDateStr}</DATE>
          <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(v.voucher_number || '')}</VOUCHERNUMBER>
          <REFERENCE>${escapeXml(v.bill_number || '')}</REFERENCE>
          <PARTYLEDGERNAME>${escapeXml(creditLedger)}</PARTYLEDGERNAME>
          <NARRATION>${narration}</NARRATION>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(debitLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(creditLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${amount.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
${voucherXmls}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    downloadBlob(
      `Asopalav_Tally_Prime_Import_${selectedBranchFilter}_${dateBounds.start}_to_${dateBounds.end}.xml`,
      xml,
      'application/xml;charset=utf-8;'
    );

    showToast({
      type: 'success',
      title: 'Tally Prime XML Exported',
      message: `Exported ${exportRows.length} vouchers in native Tally Prime XML format.`,
    });
  };

  // 3. Copy Tally Data to Clipboard
  const handleCopyTallyToClipboard = () => {
    triggerHaptic();
    const headers = [
      'Date',
      'Voucher #',
      'Expense Ledger',
      'Debit (₹)',
      'Credit Ledger',
      'Credit (₹)',
      'Branch',
      'Payee',
      'Mode',
      'Narration',
    ];

    const exportRows = approvedVouchers.filter((v) => v.payment_type !== 'Advance_Settlement');

    const lines = exportRows.map((v) => {
      const vDate = v.payment_date ? v.payment_date.slice(0, 10) : '';
      const vNum = v.voucher_number || '';
      const branchCode = v.branch_code || (v.branch_id ? v.branch_id.replace(/^Aellp-/, '') : 'ASI');
      const debitLedger = `${v.category_name || 'Expense'} A/c`;
      const amount = Number(v.total_amount) || 0;
      const creditLedger =
        v.payment_method === 'Physical_Cash'
          ? `Cash on Hand - ${branchCode}`
          : `UPI Current - ${branchCode}`;
      const payee = v.recipient_name || '';
      const mode = v.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI';
      const narration = v.remarks || '';

      return [vDate, vNum, debitLedger, amount, creditLedger, amount, branchCode, payee, mode, narration].join('\t');
    });

    const tsv = [headers.join('\t'), ...lines].join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedTally(true);
      setTimeout(() => setCopiedTally(false), 2500);
      showToast({
        type: 'success',
        title: 'Copied to Clipboard',
        message: 'Paste directly into Excel or Tally import sheets.',
      });
    });
  };

  // Tally preview rows
  const tallyPreviewRows = useMemo(() => {
    return approvedVouchers
      .filter((v) => v.payment_type !== 'Advance_Settlement')
      .slice(0, 100)
      .map((v) => {
        const creditLedger =
          v.payment_method === 'Physical_Cash'
            ? `Cash on Hand - ${v.branch_code || 'ASI'} A/c`
            : `UPI Current A/c - ${v.branch_code || 'ASI'}`;
        const debitLedger = `${v.category_name || 'Expense'} A/c`;
        const costCenter = `Showroom ${v.branch_code || 'ASI'}`;
        const dept = v.department_name || 'General';

        return {
          id: v.id,
          date: v.payment_date ? v.payment_date.slice(0, 10) : '',
          voucherNumber: v.voucher_number,
          debitLedger,
          creditLedger,
          amount: Number(v.total_amount) || 0,
          costCenter,
          department: dept,
          payee: v.recipient_name,
          paymentMode: v.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
          billNumber: v.bill_number || 'N/A',
          narration: v.remarks || `Expense disbursement for ${v.category_name}`,
        };
      });
  }, [approvedVouchers]);

  const currentBranchLabel =
    selectedBranchFilter === 'ALL'
      ? 'All Showrooms'
      : branches.find((b) => b.branch_id === selectedBranchFilter || b.branch_code === selectedBranchFilter)
          ?.branch_name || selectedBranchFilter;

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Header Toolbar */}
      <div className="px-4 lg:px-6 py-4 border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Title & Status */}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#3ecf8e]" />
                <span>Financial Reports</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-[4px] text-[11px] font-mono tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center gap-1 font-medium">
                <Building2 className="w-3 h-3" />
                {currentBranchLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
              Daily cash passbook statement and Tally Prime accounting export.
            </p>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                refreshVouchers();
                loadExtras();
              }}
              disabled={vouchersLoading || loadingExtras}
              className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] hover:bg-slate-100 dark:hover:bg-[#242428] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5 text-[#3ecf8e]', (vouchersLoading || loadingExtras) && 'animate-spin')}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Primary Action Button */}
            {activeTab === 'daily_cash' ? (
              <button
                type="button"
                onClick={handleExportDailyCashStatement}
                className="h-9 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
              >
                <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                <span>Export Cash Statement (CSV)</span>
              </button>
            ) : (
              can('can_export_tally') && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportTallyXML}
                    className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-white hover:border-[#3ecf8e] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="Export in native Tally Prime XML schema for direct import"
                  >
                    <Download className="w-3.5 h-3.5 text-[#3ecf8e]" />
                    <span>Tally XML</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportTally}
                    className="h-9 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                  >
                    <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                    <span>Export Tally CSV</span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Body Content */}
      <div className="px-4 lg:px-6 py-4 space-y-4 flex-1 w-full">
        {/* Filters Toolbar */}
        <div className="rounded-[12px] p-3 bg-slate-50/80 dark:bg-[#18181a]/80 border border-slate-200 dark:border-[#242424] shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Time Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'this_week', label: 'This Week' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'this_quarter', label: 'This Quarter' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom Date' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setTimeRange(preset.id)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-[6px] transition-all cursor-pointer font-sans select-none',
                    timeRange === preset.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-[#171717] shadow-xs'
                      : 'text-slate-600 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-200/60 dark:hover:bg-[#222222]'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Showroom & Payment Mode Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Showroom Dropdown */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e] rounded-[6px] px-2.5 h-8.5 shadow-2xs">
                <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-[#707070]" />
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 dark:text-[#EDEDED] font-sans focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">All Showrooms</option>
                  {branches.map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.short_name || b.branch_name} ({b.branch_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Mode Selector */}
              <div className="flex items-center gap-1 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e] rounded-[6px] p-0.5 shadow-2xs text-xs">
                {(
                  [
                    { id: 'ALL', label: 'All Modes' },
                    { id: 'Physical_Cash', label: 'Cash' },
                    { id: 'Online_UPI', label: 'UPI' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSelectedMode(mode.id)}
                    className={cn(
                      'px-2 py-1 rounded-[4px] font-sans text-xs transition-colors cursor-pointer',
                      selectedMode === mode.id
                        ? 'bg-slate-100 dark:bg-[#252525] text-slate-900 dark:text-[#EDEDED] font-medium'
                        : 'text-slate-500 dark:text-[#707070] hover:text-slate-800 dark:hover:text-[#EDEDED]'
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Date Pickers & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80 dark:border-[#242424]">
            {timeRange === 'custom' ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-[#707070] font-mono">From:</span>
                  <div className="w-36">
                    <DatePicker
                      value={customStartDate}
                      onChange={(val) => setCustomStartDate(val)}
                      allowPastDatesOverride={true}
                      placeholder="Start date..."
                      size="sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-[#707070] font-mono">To:</span>
                  <div className="w-36">
                    <DatePicker
                      value={customEndDate}
                      onChange={(val) => setCustomEndDate(val)}
                      allowPastDatesOverride={true}
                      placeholder="End date..."
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#A1A1A1] font-mono">
                <Calendar className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>
                  Date Range: {dateBounds.start} &rarr; {dateBounds.end}
                </span>
              </div>
            )}

            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#707070] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vouchers, payees, notes..."
                className="w-full h-8 pl-8 pr-2.5 rounded-[6px] text-xs bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e] text-slate-800 dark:text-[#EDEDED] placeholder:text-slate-400 dark:placeholder:text-[#606060] font-sans focus:outline-none focus:border-[#3ecf8e] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* 3. Opening & Closing Cash Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Opening Balance */}
          <MetricCard
            label="Opening Cash Balance"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-slate-800 dark:text-white">
                {formatINR(dailyCashFlow.periodOpening)}
              </span>
            }
            subValue={`Cash in drawer at start of period (${dateBounds.start})`}
            badge="OPENING"
            badgeColor="neutral"
            icon={Coins}
          />

          {/* Card 2: Cash Inflows (+) */}
          <MetricCard
            label="Cash Added (Inflows)"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-emerald-600 dark:text-[#3ecf8e]">
                +{formatINR(dailyCashFlow.periodInflows)}
              </span>
            }
            subValue="Cash top-ups and cash box deposits"
            badge="INFLOWS"
            badgeColor="emerald"
            icon={TrendingUp}
          />

          {/* Card 3: Total Outflows (-) */}
          <MetricCard
            label="Expenses Paid (Outflows)"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-rose-600 dark:text-rose-400">
                -{formatINR(dailyCashFlow.periodOutflows)}
              </span>
            }
            subValue="Cash vouchers and expenses paid"
            badge="OUTFLOWS"
            badgeColor="rose"
            icon={Receipt}
          />

          {/* Card 4: Closing Balance */}
          <MetricCard
            label="Closing Cash Balance"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-emerald-600 dark:text-[#3ecf8e]">
                {formatINR(dailyCashFlow.periodClosing)}
              </span>
            }
            subValue={`Current cash in drawer (Till: ${formatINR(dailyCashFlow.currentWalletCash)})`}
            badge="CLOSING"
            badgeColor="emerald"
            icon={Wallet}
          />
        </div>

        {/* 4. Tab Navigation (Simple & Clear) */}
        <div className="border-b border-slate-200 dark:border-[#282828] flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              setActiveTab('daily_cash');
            }}
            className={cn(
              'px-4 py-2.5 text-xs font-medium font-sans flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer select-none',
              activeTab === 'daily_cash'
                ? 'border-[#3ecf8e] text-slate-900 dark:text-[#EDEDED] font-semibold'
                : 'border-transparent text-slate-500 dark:text-[#A1A1A1] hover:text-slate-800 dark:hover:text-[#EDEDED] hover:border-slate-300 dark:hover:border-[#383838]'
            )}
          >
            <CalendarDays
              className={cn(
                'w-4 h-4',
                activeTab === 'daily_cash' ? 'text-[#3ecf8e]' : 'text-slate-400 dark:text-[#707070]'
              )}
            />
            <span>Daily Cash Statement</span>
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono tabular-nums ml-1',
                activeTab === 'daily_cash'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#707070]'
              )}
            >
              {dailyCashFlow.days.length} Days
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              setActiveTab('tally');
            }}
            className={cn(
              'px-4 py-2.5 text-xs font-medium font-sans flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer select-none',
              activeTab === 'tally'
                ? 'border-[#3ecf8e] text-slate-900 dark:text-[#EDEDED] font-semibold'
                : 'border-transparent text-slate-500 dark:text-[#A1A1A1] hover:text-slate-800 dark:hover:text-[#EDEDED] hover:border-slate-300 dark:hover:border-[#383838]'
            )}
          >
            <FileSpreadsheet
              className={cn(
                'w-4 h-4',
                activeTab === 'tally' ? 'text-[#3ecf8e]' : 'text-slate-400 dark:text-[#707070]'
              )}
            />
            <span>Tally Prime Export</span>
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono tabular-nums ml-1',
                activeTab === 'tally'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#707070]'
              )}
            >
              {approvedVouchers.length} Vouchers
            </span>
          </button>
        </div>

        {/* 5. TAB 1: DAILY CASH STATEMENT */}
        {activeTab === 'daily_cash' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                  Daily Cash Drawer Statement
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Opening cash, cash additions, expenses paid, net change, and closing cash for each day.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportDailyCashStatement}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>Download Statement (CSV)</span>
                </button>
              </div>
            </div>

            {/* Daily Statement Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Date</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Opening Cash (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Added (+) (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Spent (-) (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Net Change (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Closing Cash (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Entries</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {dailyCashFlow.days.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          No cash ledger transactions found for the selected date range.
                        </td>
                      </tr>
                    ) : (
                      dailyCashFlow.days.map((d) => (
                        <tr
                          key={d.date}
                          className="hover:bg-slate-50/60 dark:hover:bg-[#1c1c1f] transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-[11px] font-medium text-slate-800 dark:text-[#EDEDED] whitespace-nowrap">
                            {d.displayDate}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800 dark:text-zinc-200 whitespace-nowrap">
                            {formatINR(d.opening)}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-emerald-600 dark:text-[#3ecf8e] whitespace-nowrap">
                            {d.inflow > 0 ? `+${formatINR(d.inflow)}` : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            {d.outflow > 0 ? `-${formatINR(d.outflow)}` : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-medium whitespace-nowrap">
                            <span
                              className={
                                d.net > 0
                                  ? 'text-emerald-600 dark:text-[#3ecf8e]'
                                  : d.net < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                              }
                            >
                              {d.net > 0 ? `+${formatINR(d.net)}` : d.net < 0 ? formatINR(d.net) : '₹0'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatINR(d.closing)}
                          </td>
                          <td className="py-2 px-3 font-mono text-center text-slate-500 whitespace-nowrap">
                            {d.count}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                              Balanced
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 6. TAB 2: TALLY PRIME EXPORT */}
        {activeTab === 'tally' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                  Tally Prime Accounting Ledger
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Pre-configured vouchers mapped with Debit and Credit accounts, ready for your showroom accountant.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyTallyToClipboard}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy to clipboard"
                >
                  {copiedTally ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#3ecf8e]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Rows</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleExportTallyXML}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-white hover:border-[#3ecf8e] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Direct Tally Prime XML import file"
                >
                  <Download className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Download Tally XML</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportTally}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>Download Tally CSV</span>
                </button>
              </div>
            </div>

            {/* Tally Vouchers Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Date</th>
                      <th className="py-2.5 px-3 font-semibold">Voucher #</th>
                      <th className="py-2.5 px-3 font-semibold">Debit Ledger (Expense)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Debit (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Credit Ledger (Source)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Credit (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Branch</th>
                      <th className="py-2.5 px-3 font-semibold">Payee</th>
                      <th className="py-2.5 px-3 font-semibold">Mode</th>
                      <th className="py-2.5 px-3 font-semibold">Narration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {tallyPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          No vouchers found for the selected filter period.
                        </td>
                      </tr>
                    ) : (
                      tallyPreviewRows.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-[#1c1c1f] transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                            {r.date}
                          </td>
                          <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-[#EDEDED] whitespace-nowrap">
                            {r.voucherNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-800 dark:text-[#EDEDED] font-medium whitespace-nowrap">
                            {r.debitLedger}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            {formatINR(r.amount)}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                            {r.creditLedger}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            {formatINR(r.amount)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                            {r.costCenter}
                          </td>
                          <td className="py-2 px-3 text-slate-800 dark:text-[#EDEDED] whitespace-nowrap">
                            {r.payee}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono',
                                r.paymentMode === 'Cash'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                              )}
                            >
                              {r.paymentMode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500 dark:text-[#888888] max-w-xs truncate">
                            {r.narration}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
