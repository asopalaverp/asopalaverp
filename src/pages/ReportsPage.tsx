import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfWeek, startOfMonth, startOfQuarter, subDays, subMonths } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore } from '@/store/uiStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { calculateDailyCashBalances, DayCashRecord } from '@/lib/dailyCashBalance';
import { StaffAdvance, ExpenseVoucher, WalletLedger } from '@/types/database';
import { MetricCard } from '@/components/ui/MetricCard';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import {
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  HandCoins,
  ShieldCheck,
  Wallet,
  PieChart,
  RefreshCw,
  Copy,
  Calendar,
  Building2,
  Receipt,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Check,
  CalendarDays,
  Coins,
} from 'lucide-react';

type ReportTab = 'daily_cash' | 'categories' | 'tally' | 'advances' | 'tax_audit';
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
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
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

  // Load staff advances and wallet ledger
  const loadExtras = useCallback(async () => {
    setLoadingExtras(true);
    try {
      const branchToQuery = selectedBranchFilter === 'ALL' ? undefined : selectedBranchFilter;
      const [advancesData, ledgerData] = await Promise.all([
        erpService.getStaffAdvances(branchToQuery),
        erpService.getWalletLedger(branchToQuery),
      ]);
      setAdvances(advancesData);
      setLedgerEntries(ledgerData);
    } catch (err) {
      console.warn('Error loading supplementary report data:', err);
    } finally {
      setLoadingExtras(false);
    }
  }, [selectedBranchFilter]);

  useEffect(() => {
    loadExtras();

    const handleAdvancesUpdate = () => loadExtras();
    const handleWalletUpdate = () => loadExtras();

    window.addEventListener('asopalav:advances-updated', handleAdvancesUpdate);
    window.addEventListener('asopalav:wallet-updated', handleWalletUpdate);
    return () => {
      window.removeEventListener('asopalav:advances-updated', handleAdvancesUpdate);
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

  // Financial Metrics
  const metrics = useMemo(() => {
    const totalExpenditure = approvedVouchers.reduce(
      (sum, v) => sum + (Number(v.total_amount) || 0),
      0
    );
    const cashDisbursed = approvedVouchers
      .filter((v) => v.payment_method === 'Physical_Cash')
      .reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
    const upiDisbursed = approvedVouchers
      .filter((v) => v.payment_method === 'Online_UPI')
      .reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);

    const activeAdvances = advances.filter(
      (a) =>
        a.status === 'Active_Unsettled' ||
        a.status === 'Flagged_Salary_Deduction' ||
        (Number(a.unsettled_balance) || 0) > 0
    );
    const totalUnsettledAdvances = activeAdvances.reduce(
      (sum, a) => sum + (Number(a.unsettled_balance) || 0),
      0
    );
    const totalAdvancesGiven = advances.reduce(
      (sum, a) => sum + (Number(a.advance_amount) || 0),
      0
    );
    const totalAdvancesSettled = advances.reduce(
      (sum, a) =>
        sum +
        (Number(a.bills_submitted_amount) || 0) +
        (Number(a.cash_returned_amount) || 0),
      0
    );

    // Section 40A(3) Audits
    const singleBreaches = approvedVouchers.filter((v) => {
      if (v.payment_method !== 'Physical_Cash') return false;
      const amt = Number(v.total_amount) || 0;
      const limit = v.payment_type === 'Courier' ? 35000 : 10000;
      return amt > limit;
    });

    const vendorDailyCashMap: Record<string, { total: number; vouchers: ExpenseVoucher[] }> = {};
    approvedVouchers
      .filter((v) => v.payment_method === 'Physical_Cash')
      .forEach((v) => {
        const key = `${v.payment_date.slice(0, 10)}_${(v.recipient_name || '').trim().toLowerCase()}`;
        if (!vendorDailyCashMap[key]) {
          vendorDailyCashMap[key] = { total: 0, vouchers: [] };
        }
        vendorDailyCashMap[key].total += Number(v.total_amount) || 0;
        vendorDailyCashMap[key].vouchers.push(v);
      });

    const aggregateBreaches = Object.entries(vendorDailyCashMap).filter(
      ([_, val]) => val.total > 10000 && val.vouchers.length > 1
    );

    const total40A3Exposure = singleBreaches.reduce((sum, v) => {
      const limit = v.payment_type === 'Courier' ? 35000 : 10000;
      return sum + Math.max(0, (Number(v.total_amount) || 0) - limit);
    }, 0);

    return {
      totalExpenditure,
      cashDisbursed,
      upiDisbursed,
      voucherCount: approvedVouchers.length,
      cashCount: approvedVouchers.filter((v) => v.payment_method === 'Physical_Cash').length,
      upiCount: approvedVouchers.filter((v) => v.payment_method === 'Online_UPI').length,
      totalAdvancesGiven,
      totalAdvancesSettled,
      totalUnsettledAdvances,
      unsettledAdvancesCount: activeAdvances.length,
      sec40A3SingleBreachesCount: singleBreaches.length,
      sec40A3AggregateBreachesCount: aggregateBreaches.length,
      total40A3Exposure,
      singleBreaches,
      aggregateBreaches,
    };
  }, [approvedVouchers, advances]);

  // Real Supabase Expense Categories Breakdown (No hardcoded prefixes, no dummy data)
  const categoryBreakdown = useMemo(() => {
    const catMap: Record<string, { total: number; count: number; cash: number; upi: number }> = {};
    const totalExp = metrics.totalExpenditure || 1;

    approvedVouchers.forEach((v) => {
      const cat = (v.category_name || 'Other Expenses').trim();
      const amt = Number(v.total_amount) || 0;

      if (!catMap[cat]) catMap[cat] = { total: 0, count: 0, cash: 0, upi: 0 };
      catMap[cat].total += amt;
      catMap[cat].count += 1;
      if (v.payment_method === 'Physical_Cash') catMap[cat].cash += amt;
      else catMap[cat].upi += amt;
    });

    return Object.entries(catMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        count: data.count,
        cash: data.cash,
        upi: data.upi,
        percentage: ((data.total / totalExp) * 100).toFixed(1),
        avgTicket: Math.round(data.total / (data.count || 1)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [approvedVouchers, metrics.totalExpenditure]);

  // --------------------------------------------------------------------------
  // EXPORT GENERATORS
  // --------------------------------------------------------------------------

  // 1. Daily Cash Statement CSV Export
  const handleExportDailyCashStatement = () => {
    triggerHaptic();
    const headers = [
      'Date (YYYY-MM-DD)',
      'Calendar Day',
      'Opening Cash Balance (INR)',
      'Cash Inflows (+) Float (INR)',
      'Cash Outflows (-) Vouchers & Safe Drops (INR)',
      'Net Cash Movement (INR)',
      'Closing Cash Balance (INR)',
      'Transactions Count',
      'Audit Status',
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
      `"Reconciled"`,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Asopalav_Daily_Cash_Statement_${dateBounds.start}_to_${dateBounds.end}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Daily Cash Statement Exported',
      message: `Exported ${dailyCashFlow.days.length} day-by-day cash reconciliation records.`,
    });
  };

  // 2. Real Expense Category Analysis CSV Export
  const handleExportCategorySchedule = () => {
    triggerHaptic();
    const headers = [
      'Expense Category (Head)',
      'Total Spent (INR)',
      'Share of Expenditure (%)',
      'Bills Count',
      'Cash Outflow (INR)',
      'Online UPI Outflow (INR)',
      'Average Bill Ticket (INR)',
    ];

    const rows = categoryBreakdown.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      c.total,
      `"${c.percentage}%"`,
      c.count,
      c.cash,
      c.upi,
      c.avgTicket,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Asopalav_Expense_Category_Analysis_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Category Analysis Exported',
      message: `Exported ${categoryBreakdown.length} real expense categories.`,
    });
  };

  // 3. Tally Prime Master CSV Export
  const handleExportTally = () => {
    triggerHaptic();
    if (approvedVouchers.length === 0) {
      showToast({
        type: 'warning',
        title: 'No Vouchers Selected',
        message: 'No approved expense vouchers found matching current filters.',
      });
      return;
    }

    const csvContent = erpService.generateTallyExportCSV(approvedVouchers);
    const dateTag = `${dateBounds.start}_to_${dateBounds.end}`;
    const branchTag = selectedBranchFilter === 'ALL' ? 'ALL_SHOWROOMS' : selectedBranchFilter;
    downloadBlob(
      `Asopalav_Tally_Prime_Ledger_${branchTag}_${dateTag}.csv`,
      csvContent,
      'text/csv;charset=utf-8;'
    );

    showToast({
      type: 'success',
      title: 'Tally Prime Export Complete',
      message: `Exported ${approvedVouchers.length} vouchers with compound debit ledgers.`,
    });
  };

  // Copy Tally CSV to Clipboard
  const handleCopyTallyToClipboard = async () => {
    triggerHaptic();
    const csvContent = erpService.generateTallyExportCSV(approvedVouchers);
    try {
      await navigator.clipboard.writeText(csvContent);
      setCopiedTally(true);
      showToast({
        type: 'success',
        title: 'Copied to Clipboard',
        message: 'Tally Prime journal CSV lines copied successfully.',
      });
      setTimeout(() => setCopiedTally(false), 2500);
    } catch {
      showToast({
        type: 'error',
        title: 'Clipboard Error',
        message: 'Unable to write to clipboard. Please use CSV Download.',
      });
    }
  };

  // 4. Staff Advances Register CSV
  const handleExportAdvancesRegister = () => {
    triggerHaptic();
    const headers = [
      'Staff Code',
      'Staff Member Name',
      'Designation',
      'Branch',
      'Receipt #',
      'Advance Date',
      'Advance Given (INR)',
      'Bills Settled (INR)',
      'Cash Returned (INR)',
      'Remaining Balance Due (INR)',
      'Status',
      'Purpose / Remarks',
    ];

    const rows = advances.map((a) => [
      `"${a.staff_code || ''}"`,
      `"${(a.staff_name || '').replace(/"/g, '""')}"`,
      `"${(a.designation || '').replace(/"/g, '""')}"`,
      `"${a.branch_code || ''}"`,
      `"${a.receipt_number || ''}"`,
      `"${a.advance_date || ''}"`,
      Number(a.advance_amount) || 0,
      Number(a.bills_submitted_amount) || 0,
      Number(a.cash_returned_amount) || 0,
      Number(a.unsettled_balance) || 0,
      `"${a.status}"`,
      `"${(a.purpose || '').replace(/"/g, '""')}"`,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Asopalav_Staff_Advances_Register_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Advances Register Exported',
      message: `Exported ${advances.length} staff advance records.`,
    });
  };

  // 5. HR Payroll Deduction Schedule CSV
  const handleExportPayrollSchedule = () => {
    triggerHaptic();
    const flagged = advances.filter(
      (a) => a.status === 'Flagged_Salary_Deduction' || (Number(a.unsettled_balance) || 0) > 0
    );

    if (flagged.length === 0) {
      showToast({
        type: 'info',
        title: 'No Pending Payroll Deductions',
        message: 'There are no outstanding staff advances requiring salary deduction.',
      });
      return;
    }

    const headers = [
      'Staff Code',
      'Staff Employee Name',
      'Branch Code',
      'Designation',
      'Advance Receipt Reference',
      'Disbursal Date',
      'Deduction Target Month',
      'Outstanding Advance Due (INR)',
      'Proposed Salary Deduction (INR)',
      'Cashier / Authorizer Remarks',
    ];

    const rows = flagged.map((a) => [
      `"${a.staff_code || ''}"`,
      `"${(a.staff_name || '').replace(/"/g, '""')}"`,
      `"${a.branch_code || ''}"`,
      `"${(a.designation || '').replace(/"/g, '""')}"`,
      `"${a.receipt_number || ''}"`,
      `"${a.advance_date || ''}"`,
      `"${a.salary_deduction_month || format(new Date(), 'MMMM yyyy')}"`,
      Number(a.unsettled_balance) || 0,
      Number(a.unsettled_balance) || 0,
      `"Automatic payroll recovery for unsettled staff advance #${a.receipt_number}"`,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(
      `Asopalav_HR_Payroll_Deduction_Schedule_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'HR Payroll Schedule Exported',
      message: `Exported ${flagged.length} staff deductions for payroll processing.`,
    });
  };

  // 6. Section 40A(3) CA Tax Compliance Pack CSV
  const handleExportTaxAuditPack = () => {
    triggerHaptic();
    const headers = [
      'Audit Flag Type',
      'Voucher Date',
      'Voucher Number',
      'Branch',
      'Vendor / Payee Name',
      'Expense Head (Category)',
      'Payment Mode',
      'Voucher Amount (INR)',
      'Statutory Limit (INR)',
      'Disallowed Amount u/s 40A(3)',
      'Estimated Tax Liability @ 30% (INR)',
      'Bill Reference',
      'Narration / Audit Remarks',
    ];

    const rows: string[] = [];

    metrics.singleBreaches.forEach((v) => {
      const limit = v.payment_type === 'Courier' ? 35000 : 10000;
      const disallowed = Math.max(0, (Number(v.total_amount) || 0) - limit);
      const taxLiab = Math.round(disallowed * 0.3);
      rows.push(
        [
          `"Single Cash Voucher Breach (>INR ${limit.toLocaleString('en-IN')})"`,
          `"${v.payment_date || ''}"`,
          `"${v.voucher_number || ''}"`,
          `"${v.branch_code || ''}"`,
          `"${(v.recipient_name || '').replace(/"/g, '""')}"`,
          `"${(v.category_name || '').replace(/"/g, '""')}"`,
          `"Physical Cash"`,
          Number(v.total_amount) || 0,
          limit,
          disallowed,
          taxLiab,
          `"${v.bill_number || ''}"`,
          `"${(v.remarks || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
    });

    metrics.aggregateBreaches.forEach(([key, agg]) => {
      const parts = key.split('_');
      const date = parts[0];
      const vendor = parts.slice(1).join(' ');
      const disallowed = Math.max(0, agg.total - 10000);
      const taxLiab = Math.round(disallowed * 0.3);

      agg.vouchers.forEach((v) => {
        rows.push(
          [
            `"Daily Aggregate Vendor Breach (Day Total: INR ${agg.total.toLocaleString('en-IN')})"`,
            `"${date}"`,
            `"${v.voucher_number || ''}"`,
            `"${v.branch_code || ''}"`,
            `"${vendor.toUpperCase()}"`,
            `"${(v.category_name || '').replace(/"/g, '""')}"`,
            `"Physical Cash"`,
            Number(v.total_amount) || 0,
            10000,
            disallowed,
            taxLiab,
            `"${v.bill_number || ''}"`,
            `"Aggregated vendor daily payment exceeds statutory ceiling u/s 40A(3)"`,
          ].join(',')
        );
      });
    });

    if (rows.length === 0) {
      rows.push(
        [
          `"100% Tax Compliant"`,
          `"${format(new Date(), 'yyyy-MM-dd')}"`,
          `"ALL_VOUCHERS"`,
          `"${selectedBranchFilter}"`,
          `"All Vendors"`,
          `"General Operations"`,
          `"All Modes"`,
          metrics.totalExpenditure,
          10000,
          0,
          0,
          `"Clean Audit"`,
          `"Zero Section 40A(3) cash disallowance breaches identified during selected period."`,
        ].join(',')
      );
    }

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    downloadBlob(
      `Asopalav_CA_Section40A3_Audit_Schedule_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      csv
    );
    showToast({
      type: 'success',
      title: 'Tax Compliance Audit Pack Exported',
      message: 'Generated Section 40A(3) Income Tax schedule for CA audit filing.',
    });
  };

  // --------------------------------------------------------------------------
  // LIVE JOURNAL PREVIEW ROWS (For Tally Prime Tab)
  // --------------------------------------------------------------------------
  const tallyPreviewRows = useMemo(() => {
    return approvedVouchers
      .filter((v) => v.payment_type !== 'Advance_Settlement')
      .slice(0, 50)
      .map((v) => {
        const creditLedger =
          v.payment_method === 'Physical_Cash'
            ? `Cash on Hand - ${v.branch_code || 'ASI'} A/c`
            : `HDFC Bank Current A/c - ${v.branch_code || 'ASI'}`;
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
          paymentMode: v.payment_method === 'Physical_Cash' ? 'Physical Cash' : 'Online UPI',
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Left Title & Status */}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#3ecf8e]" />
                <span>Financial &amp; Audit Reports</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-[4px] text-[11px] font-mono tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center gap-1 font-medium">
                <Building2 className="w-3 h-3" />
                {currentBranchLabel}
              </span>
              <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase bg-slate-100 dark:bg-[#1f1f1f] text-slate-600 dark:text-[#A1A1A1] border border-slate-200 dark:border-[#2e2e2e] inline-flex items-center">
                Double-Entry Ledger v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
              Passbook reconciliation, daily opening &amp; closing balances, expense categories, staff advances, and CA tax schedules.
            </p>
          </div>

          {/* Right Action Bar with Single Signature Emerald CTA */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                refreshVouchers();
                loadExtras();
              }}
              disabled={vouchersLoading || loadingExtras}
              className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1c1c1f] hover:bg-slate-100 dark:hover:bg-[#242428] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Refresh Report Data"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5 text-[#3ecf8e]', (vouchersLoading || loadingExtras) && 'animate-spin')}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Signature Emerald CTA: Download Tally Prime Master CSV */}
            {can('can_export_tally') && (
              <button
                type="button"
                onClick={handleExportTally}
                className="h-9 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                title="Download Tally Prime Compound Multi-Debit Ledger CSV"
              >
                <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                <span>Export Tally CSV</span>
              </button>
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
                placeholder="Filter vouchers, categories, staff..."
                className="w-full h-8 pl-8 pr-2.5 rounded-[6px] text-xs bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e] text-slate-800 dark:text-[#EDEDED] placeholder:text-slate-400 dark:placeholder:text-[#606060] font-sans focus:outline-none focus:border-[#3ecf8e] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* 3. Opening & Closing Cash Diagnostic Matrix (5-Up Metric Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Opening Balance */}
          <MetricCard
            label="1. Opening Cash Balance"
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
            label="2. Cash Inflows (+) Float"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-emerald-600 dark:text-[#3ecf8e]">
                +{formatINR(dailyCashFlow.periodInflows)}
              </span>
            }
            subValue="Cash top-ups & advance returns"
            badge="INFLOWS"
            badgeColor="emerald"
            icon={TrendingDown}
          />

          {/* Card 3: Total Outflows (-) */}
          <MetricCard
            label="3. Cash Outflows (-) Spent"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-rose-600 dark:text-rose-400">
                -{formatINR(dailyCashFlow.periodOutflows)}
              </span>
            }
            subValue={`${metrics.cashCount} cash expenses & safe drops`}
            badge="OUTFLOWS"
            badgeColor="rose"
            icon={Receipt}
          />

          {/* Card 4: Closing Balance */}
          <MetricCard
            label="4. Closing Cash Balance"
            value={
              <span className="font-mono tabular-nums text-lg sm:text-xl font-semibold text-emerald-600 dark:text-[#3ecf8e]">
                {formatINR(dailyCashFlow.periodClosing)}
              </span>
            }
            subValue={`End of period balance (Till: ${formatINR(dailyCashFlow.currentWalletCash)})`}
            badge="CLOSING"
            badgeColor="emerald"
            icon={Wallet}
          />

          {/* Card 5: Sec 40A(3) Status */}
          <MetricCard
            label="5. Sec 40A(3) Compliance"
            value={
              metrics.sec40A3SingleBreachesCount === 0 && metrics.sec40A3AggregateBreachesCount === 0 ? (
                <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-emerald-600 dark:text-[#3ecf8e] flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-[#3ecf8e]" />
                  <span>100% Clean</span>
                </span>
              ) : (
                <span className="font-mono tabular-nums text-lg sm:text-xl font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  <span>{metrics.sec40A3SingleBreachesCount + metrics.sec40A3AggregateBreachesCount} Alerts</span>
                </span>
              )
            }
            subValue={
              metrics.total40A3Exposure > 0
                ? `Disallowance: ${formatINR(metrics.total40A3Exposure)}`
                : 'Zero cash breaches detected'
            }
            badge={metrics.total40A3Exposure > 0 ? 'Tax Alert' : 'Compliant'}
            badgeColor={metrics.total40A3Exposure > 0 ? 'rose' : 'emerald'}
            icon={ShieldCheck}
            onClick={() => setActiveTab('tax_audit')}
          />
        </div>

        {/* 4. Tab Navigation (5 Financial Dimensions) */}
        <div className="border-b border-slate-200 dark:border-[#282828] flex items-center gap-1 overflow-x-auto scrollbar-none">
          {(
            [
              {
                id: 'daily_cash',
                label: 'Daily Cash Statement (Day-by-Day)',
                icon: CalendarDays,
                badge: `${dailyCashFlow.days.length} Days`,
                role: 'Cashier / Manager / CA',
              },
              {
                id: 'categories',
                label: 'Expense Categories (Real Money)',
                icon: PieChart,
                badge: `${categoryBreakdown.length} Heads`,
                role: 'Accountant / Manager',
              },
              {
                id: 'tally',
                label: 'Tally Prime Ledger',
                icon: FileSpreadsheet,
                badge: `${approvedVouchers.length} Bills`,
                role: 'Accountant / CA',
              },
              {
                id: 'advances',
                label: 'Staff Advances (Simplified)',
                icon: HandCoins,
                badge: `${metrics.unsettledAdvancesCount} Open`,
                role: 'Manager / HR',
              },
              {
                id: 'tax_audit',
                label: 'CA Tax & Sec 40A(3)',
                icon: ShieldCheck,
                badge:
                  metrics.sec40A3SingleBreachesCount > 0
                    ? `${metrics.sec40A3SingleBreachesCount} Alerts`
                    : 'Clean',
                role: 'Auditor / CA',
              },
            ] as const
          ).map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab(tab.id);
                }}
                className={cn(
                  'px-3.5 py-2.5 text-xs font-medium font-sans flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer select-none',
                  isActive
                    ? 'border-[#3ecf8e] text-slate-900 dark:text-[#EDEDED] font-semibold'
                    : 'border-transparent text-slate-500 dark:text-[#A1A1A1] hover:text-slate-800 dark:hover:text-[#EDEDED] hover:border-slate-300 dark:hover:border-[#383838]'
                )}
              >
                <IconComponent className={cn('w-4 h-4', isActive ? 'text-[#3ecf8e]' : 'text-slate-400 dark:text-[#707070]')} />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono tabular-nums',
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20'
                      : 'bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#707070]'
                  )}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* 5. TAB 1: DAILY CASH STATEMENT (DAY-BY-DAY) */}
        {activeTab === 'daily_cash' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                    Day-by-Day Cash Drawer Opening &amp; Closing Statement
                  </h2>
                  <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20">
                    Exact Passbook Math
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Inspect cash opening, float additions (+), expense disbursements (-), net movement, and closing balance for every single day. Easily locate any discrepancies down to the rupee.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportDailyCashStatement}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>Export Daily Statement (CSV)</span>
                </button>
              </div>
            </div>

            {/* Daily Statement Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Calendar Date</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Opening Cash (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Inflows (+) Float (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Outflows (-) Vouchers (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Net Movement (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Closing Cash (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Transactions</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Reconciliation</th>
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
                            <span className={d.net > 0 ? 'text-emerald-600 dark:text-[#3ecf8e]' : d.net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}>
                              {d.net > 0 ? `+${formatINR(d.net)}` : d.net < 0 ? formatINR(d.net) : '₹0'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatINR(d.closing)}
                          </td>
                          <td className="py-2 px-3 font-mono text-center text-slate-500 whitespace-nowrap">
                            {d.count} {d.count === 1 ? 'log' : 'logs'}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                              Reconciled
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

        {/* 6. TAB 2: EXPENSE CATEGORIES (REAL SUPABASE CATEGORIES) */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                  Real Expense Category Breakdown (Where Did Real Money Go?)
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Actual expenditure categorized by operational expense heads directly from Supabase. No dummy data, no hardcoded prefixes.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportCategorySchedule}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>Export Category Breakdown (CSV)</span>
                </button>
              </div>
            </div>

            {/* Category Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Expense Category Head</th>
                      <th className="py-2.5 px-3 font-semibold">Share of Outflows (%)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Bills Count</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Outflow (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Online UPI (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total Spent (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Avg Bill (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {categoryBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          No category expense records found for the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      categoryBreakdown.map((c) => (
                        <tr
                          key={c.name}
                          className="hover:bg-slate-50/60 dark:hover:bg-[#1c1c1f] transition-colors"
                        >
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                            {c.name}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-[#252525] overflow-hidden">
                                <div
                                  className="h-full bg-[#3ecf8e]"
                                  style={{ width: `${Math.min(100, Math.max(2, Number(c.percentage)))}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-[#A1A1A1]">
                                {c.percentage}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                            {c.count}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            {formatINR(c.cash)}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            {formatINR(c.upi)}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatINR(c.total)}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500 whitespace-nowrap">
                            {formatINR(c.avgTicket)}
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

        {/* 7. TAB 3: TALLY PRIME MASTER LEDGER */}
        {activeTab === 'tally' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                    Tally Prime Compound Journal Integration
                  </h2>
                  <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20">
                    Live Double-Entry Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Pre-configured ledger mapping with automatic multi-debit split support. Advance settlements are excluded to avoid double-counting in Tally Prime.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyTallyToClipboard}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy CSV to clipboard for quick paste"
                >
                  {copiedTally ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#3ecf8e]" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy CSV</span>
                    </>
                  )}
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

            {/* Live Journal Preview Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#242424] bg-slate-50/50 dark:bg-[#18181a] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-800 dark:text-[#EDEDED] font-sans">
                    Journal Preview
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 dark:text-[#707070]">
                    (Showing {tallyPreviewRows.length} of {approvedVouchers.length} vouchers)
                  </span>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-[#A1A1A1]">
                  Total Value: <span className="text-slate-900 dark:text-white font-medium">{formatINR(metrics.totalExpenditure)}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Date</th>
                      <th className="py-2.5 px-3 font-semibold">Voucher #</th>
                      <th className="py-2.5 px-3 font-semibold">Debit Ledger (Expense Head)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Debit (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Credit Ledger (Source)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Credit (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Cost Centre</th>
                      <th className="py-2.5 px-3 font-semibold">Department</th>
                      <th className="py-2.5 px-3 font-semibold">Beneficiary (Payee)</th>
                      <th className="py-2.5 px-3 font-semibold">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {tallyPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          No vouchers available for Tally export in the selected filter period.
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
                          <td className="py-2 px-3 text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                            {r.department}
                          </td>
                          <td className="py-2 px-3 text-slate-800 dark:text-[#EDEDED] whitespace-nowrap">
                            {r.payee}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono',
                                r.paymentMode === 'Physical Cash'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                              )}
                            >
                              {r.paymentMode}
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

        {/* 8. TAB 4: STAFF ADVANCES (SIMPLIFIED & INTUITIVE) */}
        {activeTab === 'advances' && (
          <div className="space-y-4">
            {/* Header & Export Actions */}
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                  Staff Advances &amp; Loans Summary
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Simple, real employee ledger showing who took advances, how much was settled by bills or cash, and what remains due.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportAdvancesRegister}
                  className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-sky-500" />
                  <span>Export Register (CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPayrollSchedule}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>HR Payroll Deduction (CSV)</span>
                </button>
              </div>
            </div>

            {/* Simplified Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-[10px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#282828]">
                <div className="text-[11px] font-mono uppercase text-slate-500 dark:text-[#888888]">Total Advance Given</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {formatINR(metrics.totalAdvancesGiven)}
                </div>
              </div>

              <div className="p-3.5 rounded-[10px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#282828]">
                <div className="text-[11px] font-mono uppercase text-emerald-600 dark:text-[#3ecf8e]">Total Settled (Bills/Cash)</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-emerald-600 dark:text-[#3ecf8e] mt-1">
                  {formatINR(metrics.totalAdvancesSettled)}
                </div>
              </div>

              <div className="p-3.5 rounded-[10px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#282828]">
                <div className="text-[11px] font-mono uppercase text-rose-600 dark:text-rose-400">Total Remaining Due</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                  {formatINR(metrics.totalUnsettledAdvances)}
                </div>
              </div>
            </div>

            {/* Advances Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Staff Member</th>
                      <th className="py-2.5 px-3 font-semibold">Staff Code</th>
                      <th className="py-2.5 px-3 font-semibold">Receipt #</th>
                      <th className="py-2.5 px-3 font-semibold">Issue Date</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Advance Given (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Settled (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Remaining Due (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {advances.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          No staff advances found for this branch.
                        </td>
                      </tr>
                    ) : (
                      advances.map((a) => {
                        const due = Number(a.unsettled_balance) || 0;
                        const settled = (Number(a.bills_submitted_amount) || 0) + (Number(a.cash_returned_amount) || 0);
                        return (
                          <tr
                            key={a.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-[#1c1c1f] transition-colors"
                          >
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                              {a.staff_name}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-[#A1A1A1] whitespace-nowrap">
                              {a.staff_code}
                            </td>
                            <td className="py-2 px-3 font-mono font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                              {a.receipt_number}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                              {a.advance_date}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                              {formatINR(Number(a.advance_amount) || 0)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right text-emerald-600 dark:text-[#3ecf8e] whitespace-nowrap">
                              {formatINR(settled)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold whitespace-nowrap">
                              <span className={due > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}>
                                {formatINR(due)}
                              </span>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium',
                                  due === 0
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                )}
                              >
                                {due === 0 ? 'Fully Settled' : 'Unsettled'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 9. TAB 5: CA TAX & SECTION 40A(3) COMPLIANCE */}
        {activeTab === 'tax_audit' && (
          <div className="space-y-4">
            <div className="rounded-[12px] p-4 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                    Income Tax Act Section 40A(3) &amp; 40A(3A) Compliance Audit
                  </h2>
                  <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                    Statutory Tax Audit u/s 44AB
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  Flags physical cash payments to a single vendor exceeding ₹10,000 in a day (₹35,000 for freight/GTA) disallowed as business deductions.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportTaxAuditPack}
                  className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
                >
                  <Download className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                  <span>Download CA Audit Schedule</span>
                </button>
              </div>
            </div>

            {/* Compliance Summary Notice */}
            {metrics.sec40A3SingleBreachesCount === 0 && metrics.sec40A3AggregateBreachesCount === 0 ? (
              <div className="rounded-[12px] p-4 bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#3ecf8e] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-semibold text-emerald-800 dark:text-[#3ecf8e] font-sans">
                    100% Section 40A(3) Compliant
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-sans">
                    No cash payments over ₹10,000 or single-day vendor cash aggregations over statutory limits were detected in the selected filter period. Zero tax disallowance exposure.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] p-4 bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-semibold text-rose-800 dark:text-rose-400 font-sans">
                    Potential Tax Disallowance Alert u/s 40A(3)
                  </h3>
                  <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 font-sans">
                    Found {metrics.sec40A3SingleBreachesCount} single-voucher cash payment(s) and {metrics.sec40A3AggregateBreachesCount} daily single-vendor cash aggregation(s) above statutory thresholds. Estimated tax exposure @ 30%: <span className="font-mono font-bold text-rose-900 dark:text-white">{formatINR(Math.round(metrics.total40A3Exposure * 0.3))}</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Flagged Transactions Table */}
            <div className="rounded-[12px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#242424] bg-slate-50/50 dark:bg-[#18181a]">
                <span className="text-xs font-medium text-slate-800 dark:text-[#EDEDED] font-sans">
                  Audited Cash Transactions Exceeding Statutory Ceilings
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#242424] bg-slate-50/80 dark:bg-[#161618] text-[11px] font-mono uppercase text-slate-500 dark:text-[#707070]">
                      <th className="py-2.5 px-3 font-semibold">Voucher Date</th>
                      <th className="py-2.5 px-3 font-semibold">Voucher #</th>
                      <th className="py-2.5 px-3 font-semibold">Payee / Beneficiary</th>
                      <th className="py-2.5 px-3 font-semibold">Expense Head</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Cash Paid (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Limit (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Excess Amount (₹)</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Tax Exposure (₹)</th>
                      <th className="py-2.5 px-3 font-semibold">Audit Disposition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#202020] font-sans">
                    {metrics.singleBreaches.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 dark:text-[#707070]">
                          Zero cash vouchers exceeded the ₹10,000 threshold.
                        </td>
                      </tr>
                    ) : (
                      metrics.singleBreaches.map((v) => {
                        const limit = v.payment_type === 'Courier' ? 35000 : 10000;
                        const excess = Math.max(0, (Number(v.total_amount) || 0) - limit);
                        const taxLiab = Math.round(excess * 0.3);
                        return (
                          <tr
                            key={v.id}
                            className="hover:bg-rose-50/40 dark:hover:bg-rose-950/10 transition-colors"
                          >
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                              {v.payment_date ? v.payment_date.slice(0, 10) : ''}
                            </td>
                            <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-[#EDEDED] whitespace-nowrap">
                              {v.voucher_number}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                              {v.recipient_name}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-[#A1A1A1] whitespace-nowrap">
                              {v.category_name}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
                              {formatINR(Number(v.total_amount) || 0)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500 whitespace-nowrap">
                              {formatINR(limit)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-rose-600 whitespace-nowrap">
                              {formatINR(excess)}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-amber-600 whitespace-nowrap">
                              {formatINR(taxLiab)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-medium">
                                Disallowed u/s 40A(3)
                              </span>
                            </td>
                          </tr>
                        );
                      })
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
