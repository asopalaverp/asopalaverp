import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { format, startOfWeek, startOfMonth, startOfQuarter, subDays, addDays } from 'date-fns';
import { useAuthStore, isPrivilegedAdminRole } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore } from '@/store/uiStore';
import { useVouchers } from '@/hooks/useVouchers';
import { erpService } from '@/lib/erpService';
import { calculateDailyCashBalances, calculateDailyTreasuryBalances } from '@/lib/dailyCashBalance';
import { StaffAdvance, WalletLedger, VoucherSplit } from '@/types/database';
import { VoucherTable } from '@/components/vouchers/VoucherTable';
import { LogsBarChart } from '@/components/fragments/LogsBarChart';
import { MetricCard } from '@/components/ui/MetricCard';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { SegmentedControl } from '@/components/ui';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { useAnomalyDetector } from '@/hooks/useAnomalyDetector';
import { ExecutiveBriefingWidget } from '@/components/dashboard/ExecutiveBriefingWidget';
import { HourlyHeatmapWidget } from '@/components/dashboard/HourlyHeatmapWidget';
import { DepartmentBudgetCapsWidget } from '@/components/dashboard/DepartmentBudgetCapsWidget';
import {
  Wallet,
  ArrowRight,
  FileSpreadsheet,  PieChart,
  Building2,
  TrendingUp,  Receipt,
  Calendar,
  Filter,
  RotateCcw,  AlertTriangle,  Coins,
  Layers,  Activity,  ArrowUpRight,
  ArrowDownRight,
  Plus,  Lock,  X,
  LayoutDashboard,
  RefreshCw,  Users,
  ShieldAlert,
} from 'lucide-react';
import { useDuplicateDetector } from '@/hooks/useDuplicateDetector';
import { DuplicateDetectionModal } from '@/components/vouchers/DuplicateDetectionModal';

export const DashboardPage: React.FC = () => {
  const { user, can, isBranchAllowed } = useAuthStore();
  const { selectedBranchId, getActiveBranch } = useBranchStore();
  const { setActivePage } = useUIStore();
  const { vouchers, categories, departments, loading, refresh } = useVouchers();

  // Role detection: Cashier vs Executive/Admin
  const isCashier = user?.role_code === 'Cashier' || user?.role_code?.toLowerCase() === 'cashier';
  const isAdminOrManager = isPrivilegedAdminRole(user?.role_code) || user?.role_code === 'Store_Manager' || user?.role_code?.toLowerCase() === 'store_manager';

  // Wallet & Liquidity State
  const [cashBalance, setCashBalance] = useState(0);
  const [upiBalance, setUpiBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<WalletLedger[]>([]);
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [isPeriodLocked, setIsPeriodLocked] = useState(false);
  const [splitsMap, setSplitsMap] = useState<Record<string, VoucherSplit[]>>({});
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Real-time Duplicate Detection Radar
  const {
    clusters: duplicateClusters,
    activeCount: duplicateActiveCount,
    totalAtRiskAmount: duplicateAtRiskAmount,
    dismissCluster,
  } = useDuplicateDetector(vouchers, ledgerEntries);

  // Statistical Anomaly Radar (Google Cloud Monitoring Z-Score / IQR Engine)
  const { anomaliesMap, anomalyList, anomalyCount } = useAnomalyDetector(vouchers);


  // Slicers State (For Admin/Executive: Multi-dimensional, For Cashier: Locked to today)
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'all' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMode, setSelectedMode] = useState<'ALL' | 'Physical_Cash' | 'Online_UPI'>('ALL');
  
  // Interactive Dashboard Table Slicers (Click-to-Filter on Top 5 Depts & Categories)
  const [activeDeptFilter, setActiveDeptFilter] = useState<string>('ALL');
  const [activeCatFilter, setActiveCatFilter] = useState<string>('ALL');

  const activeBranch = getActiveBranch();
  const minCashThreshold = activeBranch?.min_cash_threshold || 3000;
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

  // Load ledger entries for accurate Inflow / Top-up KPIs
  const loadLedger = useCallback(async () => {
    if (!selectedBranchId) return;
    if (selectedBranchId !== 'ALL' && !isBranchAllowed(selectedBranchId)) return;
    try {
      const entries = await erpService.getWalletLedger(selectedBranchId);
      setLedgerEntries(entries || []);
    } catch (err) {
      console.warn('Error loading ledger:', err);
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
    loadLedger();
    loadAdvances();

    let walletTimeout: any = null;
    let ledgerTimeout: any = null;
    let advTimeout: any = null;

    const onWalletUpdate = () => {
      if (walletTimeout) clearTimeout(walletTimeout);
      walletTimeout = setTimeout(() => loadWallet(), 400);
    };

    const onLedgerUpdate = () => {
      if (ledgerTimeout) clearTimeout(ledgerTimeout);
      ledgerTimeout = setTimeout(() => loadLedger(), 400);
    };

    const onAdvancesUpdate = () => {
      if (advTimeout) clearTimeout(advTimeout);
      advTimeout = setTimeout(() => loadAdvances(), 400);
    };

    const onVouchersUpdate = () => {
      if (walletTimeout) clearTimeout(walletTimeout);
      if (ledgerTimeout) clearTimeout(ledgerTimeout);
      walletTimeout = setTimeout(() => {
        loadWallet();
        loadLedger();
      }, 400);
    };

    window.addEventListener('asopalav:wallet-updated', onWalletUpdate);
    window.addEventListener('asopalav:ledger-updated', onLedgerUpdate);
    window.addEventListener('asopalav:advances-updated', onAdvancesUpdate);
    window.addEventListener('asopalav:vouchers-updated', onVouchersUpdate);

    return () => {
      if (walletTimeout) clearTimeout(walletTimeout);
      if (ledgerTimeout) clearTimeout(ledgerTimeout);
      if (advTimeout) clearTimeout(advTimeout);
      window.removeEventListener('asopalav:wallet-updated', onWalletUpdate);
      window.removeEventListener('asopalav:ledger-updated', onLedgerUpdate);
      window.removeEventListener('asopalav:advances-updated', onAdvancesUpdate);
      window.removeEventListener('asopalav:vouchers-updated', onVouchersUpdate);
    };
  }, [selectedBranchId]);

  // Active time range slicer
  const effectiveTimeRange = timeRange;

  // Slicer Filter Pipeline for Vouchers
  const filteredVouchers = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeekStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');
    const startOfQuarterStr = format(startOfQuarter(now), 'yyyy-MM-dd');

    return vouchers.filter((v) => {
      const rawDate = v.payment_date || v.created_at || '';
      const vDate = rawDate.trim().slice(0, 10);
      if (effectiveTimeRange === 'today' && vDate !== todayStr) return false;
      if (effectiveTimeRange === 'week' && vDate < startOfWeekStr) return false;
      if (effectiveTimeRange === 'month' && vDate < startOfMonthStr) return false;
      if (effectiveTimeRange === 'quarter' && vDate < startOfQuarterStr) return false;
      if (effectiveTimeRange === 'custom') {
        if (customStartDate && vDate < customStartDate) return false;
        if (customEndDate && vDate > customEndDate) return false;
      }

      if (selectedMode !== 'ALL' && v.payment_method !== selectedMode) return false;

      return true;
    });
  }, [vouchers, effectiveTimeRange, customStartDate, customEndDate, selectedMode]);

  // Slicer Filter Pipeline for Ledger / Inflows
  const filteredLedger = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeekStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');
    const startOfQuarterStr = format(startOfQuarter(now), 'yyyy-MM-dd');

    return ledgerEntries.filter((entry) => {
      const entryDate = entry.created_at ? entry.created_at.trim().slice(0, 10) : '';
      if (effectiveTimeRange === 'today' && entryDate !== todayStr) return false;
      if (effectiveTimeRange === 'week' && entryDate < startOfWeekStr) return false;
      if (effectiveTimeRange === 'month' && entryDate < startOfMonthStr) return false;
      if (effectiveTimeRange === 'quarter' && entryDate < startOfQuarterStr) return false;
      if (effectiveTimeRange === 'custom') {
        if (customStartDate && entryDate < customStartDate) return false;
        if (customEndDate && entryDate > customEndDate) return false;
      }

      if (selectedMode === 'Physical_Cash' && entry.wallet_type !== 'Cash') return false;
      if (selectedMode === 'Online_UPI' && entry.wallet_type !== 'UPI') return false;

      return true;
    });
  }, [ledgerEntries, effectiveTimeRange, customStartDate, customEndDate, selectedMode]);

  // Active Slicer Count
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeSlicerCount = useMemo(() => {
    let count = 0;
    const isToday = customStartDate === todayStr && customEndDate === todayStr;
    if (!isToday && (customStartDate || customEndDate || (timeRange !== 'today' && timeRange !== 'custom')) && !isCashier) count++;
    if (selectedMode !== 'ALL') count++;
    if (activeDeptFilter !== 'ALL') count++;
    if (activeCatFilter !== 'ALL') count++;
    return count;
  }, [timeRange, customStartDate, customEndDate, selectedMode, isCashier, todayStr, activeDeptFilter, activeCatFilter]);

  // Load line-item splits for multi-department/split vouchers in view
  useEffect(() => {
    let isMounted = true;
    const splitVoucherNumbers = filteredVouchers
      .filter((v) => v.payment_type === 'Staff_Split' || (v.vendor_splits && v.vendor_splits.length > 0))
      .map((v) => v.voucher_number);

    if (splitVoucherNumbers.length > 0) {
      erpService.getSplitsForVouchers(splitVoucherNumbers).then((res) => {
        if (isMounted) {
          setSplitsMap((prev) => ({ ...prev, ...res }));
        }
      }).catch((e) => {
        console.warn('Error loading splits for dashboard vouchers:', e);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [filteredVouchers]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const active = filteredVouchers.filter(
      (v) =>
        v.status !== 'Voided' &&
        v.status !== 'Pending_Approval' &&
        v.payment_type !== 'Advance_Settlement'
    );
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
      totalBills: active.length,
      cashBills: active.filter((v) => v.payment_method === 'Physical_Cash').length,
      upiBills: active.filter((v) => v.payment_method === 'Online_UPI').length,
    };
  }, [filteredVouchers]);

  // Inflow Metrics
  const inflowMetrics = useMemo(() => {
    let totalInflow = 0;
    let cashInflow = 0;
    let cashCount = 0;
    let upiInflow = 0;
    let upiCount = 0;
    let totalCount = 0;

    filteredLedger.forEach((entry) => {
      const credit = Number(entry.credit_amount) || 0;
      if (credit > 0) {
        totalInflow += credit;
        totalCount++;
        if (entry.wallet_type === 'UPI') {
          upiInflow += credit;
          upiCount++;
        } else {
          cashInflow += credit;
          cashCount++;
        }
      }
    });

    return {
      totalInflow,
      cashInflow,
      cashCount,
      upiInflow,
      upiCount,
      totalCount,
    };
  }, [filteredLedger]);

  // Staff Advances Metrics
  const advanceMetrics = useMemo(() => {
    const pending = advances.filter((a) => a.status === 'Active_Unsettled' || a.status === 'Flagged_Salary_Deduction');
    const totalUnsettled = pending.reduce((acc, curr) => acc + (Number(curr.unsettled_balance) || 0), 0);
    return {
      totalUnsettled,
      pendingCount: pending.length,
    };
  }, [advances]);

  // Staff Advance Aging (0-7 days, 8-15 days, 15+ days salary deduction alert)
  const advanceAging = useMemo(() => {
    const now = new Date();
    const pending = advances.filter((a) => a.status === 'Active_Unsettled' || a.status === 'Flagged_Salary_Deduction');

    let bracket0to7 = 0;
    let bracket8to15 = 0;
    let bracket15Plus = 0;

    pending.forEach((a) => {
      const created = new Date(a.advance_date || a.created_at || now);
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      const balance = Number(a.unsettled_balance) || 0;

      if (diffDays <= 7) bracket0to7 += balance;
      else if (diffDays <= 15) bracket8to15 += balance;
      else bracket15Plus += balance;
    });

    return {
      bracket0to7,
      bracket8to15,
      bracket15Plus,
      totalUnsettled: bracket0to7 + bracket8to15 + bracket15Plus,
      pendingCount: pending.length,
    };
  }, [advances]);

  // Daily Cash Flow & Day-by-Day Opening and Closing
  const dailyCashSummary = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfWeekStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');
    const startOfQuarterStr = format(startOfQuarter(now), 'yyyy-MM-dd');

    let sDate: string | undefined = todayStr;
    let eDate: string | undefined = todayStr;

    if (!isCashier) {
      if (timeRange === 'week') {
        sDate = startOfWeekStr;
        eDate = todayStr;
      } else if (timeRange === 'month') {
        sDate = startOfMonthStr;
        eDate = todayStr;
      } else if (timeRange === 'quarter') {
        sDate = startOfQuarterStr;
        eDate = todayStr;
      } else if (timeRange === 'all') {
        sDate = undefined;
        eDate = undefined;
      } else if (timeRange === 'custom') {
        sDate = customStartDate || undefined;
        eDate = customEndDate || undefined;
      }
    }

    return calculateDailyCashBalances(ledgerEntries, cashBalance, sDate, eDate);
  }, [ledgerEntries, cashBalance, timeRange, customStartDate, customEndDate, isCashier]);

  // Daily Cash & UPI Treasury Balances (Opening, Inflow, Outflow, Closing)
  const treasuryBreakdown = useMemo(() => {
    return calculateDailyTreasuryBalances(ledgerEntries, cashBalance, upiBalance);
  }, [ledgerEntries, cashBalance, upiBalance]);

  // Department Allocation Stats (Cost Center Tracking with 100% Split Disaggregation)
  const departmentStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    filteredVouchers
      .filter(
        (v) =>
          v.status !== 'Voided' &&
          v.status !== 'Pending_Approval' &&
          v.payment_type !== 'Advance_Settlement'
      )
      .forEach((v) => {
        // 1. Staff Split Vouchers: Unpack each person's exact department & amount from database splits
        if (v.payment_type === 'Staff_Split') {
          const splits = splitsMap[v.voucher_number] || (v as any).splits || [];
          if (splits.length > 0) {
            splits.forEach((s: any) => {
              const dept = s.department_name || s.departmentName || 'General Operations';
              const amt = Number(s.amount) || 0;
              const cur = map.get(dept) || { count: 0, amount: 0 };
              map.set(dept, {
                count: cur.count + 1,
                amount: cur.amount + amt,
              });
            });
            return;
          }
        }

        // 2. Multi-Vendor Split Vouchers: Unpack each vendor's exact department & amount
        if (Array.isArray(v.vendor_splits) && v.vendor_splits.length > 0) {
          v.vendor_splits.forEach((vs: any) => {
            const dept = vs.department_name || vs.departmentName || 'General Operations';
            const amt = Number(vs.amount) || 0;
            const cur = map.get(dept) || { count: 0, amount: 0 };
            map.set(dept, {
              count: cur.count + 1,
              amount: cur.amount + amt,
            });
          });
          return;
        }

        // 3. Fallback: If department_name is a comma-separated string (e.g. historical data before splitsMap loaded)
        if (v.department_name && v.department_name.includes(',')) {
          const depts = v.department_name.split(',').map((d) => d.trim()).filter(Boolean);
          if (depts.length > 0) {
            const splitAmt = (Number(v.total_amount) || 0) / depts.length;
            depts.forEach((dept) => {
              const cur = map.get(dept) || { count: 0, amount: 0 };
              map.set(dept, {
                count: cur.count + 1,
                amount: cur.amount + splitAmt,
              });
            });
            return;
          }
        }

        // 4. Standard Single Department Voucher
        const dept = v.department_name || 'General Operations';
        const cur = map.get(dept) || { count: 0, amount: 0 };
        map.set(dept, {
          count: cur.count + 1,
          amount: cur.amount + (Number(v.total_amount) || 0),
        });
      });

    const deptPalette = ['#3ecf8e', '#2bb379', '#1e9b66', '#108453', '#0f766e', '#334155', '#475569', '#64748b'];
    return Array.from(map.entries())
      .map(([name, stat], idx) => ({
        name,
        count: stat.count,
        amount: Math.round(stat.amount * 100) / 100,
        percentage: metrics.totalSpend > 0 ? Math.round((stat.amount / metrics.totalSpend) * 100) : 0,
        color: deptPalette[idx % deptPalette.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredVouchers, splitsMap, metrics.totalSpend]);

  // Month-over-Month (MoM) Comparison Logic (Like-for-Like MTD)
  const momComparison = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // MTD Current Month (e.g. Oct 1 to Oct 21)
    const currentMtdVouchers = vouchers.filter((v) => {
      if (v.status === 'Voided' || v.status === 'Pending_Approval' || v.payment_type === 'Advance_Settlement') return false;
      const d = new Date(v.payment_date || v.created_at);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() <= currentDay;
    });
    const currentMtdSpend = currentMtdVouchers.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);

    // MTD Previous Month (e.g. Sep 1 to Sep 21)
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();

    const prevMtdVouchers = vouchers.filter((v) => {
      if (v.status === 'Voided' || v.status === 'Pending_Approval' || v.payment_type === 'Advance_Settlement') return false;
      const d = new Date(v.payment_date || v.created_at);
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth && d.getDate() <= currentDay;
    });
    const prevMtdSpend = prevMtdVouchers.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);

    // Full Last Month Total
    const prevFullMonthVouchers = vouchers.filter((v) => {
      if (v.status === 'Voided' || v.status === 'Pending_Approval' || v.payment_type === 'Advance_Settlement') return false;
      const d = new Date(v.payment_date || v.created_at);
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
    });
    const prevFullMonthSpend = prevFullMonthVouchers.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);

    const deltaAmount = currentMtdSpend - prevMtdSpend;
    const deltaPercent = prevMtdSpend > 0 ? Math.round(((currentMtdSpend - prevMtdSpend) / prevMtdSpend) * 100) : 0;

    return {
      currentMtdSpend,
      prevMtdSpend,
      prevFullMonthSpend,
      deltaAmount,
      deltaPercent,
      currentMonthName: format(now, 'MMMM'),
      prevMonthName: format(prevDate, 'MMMM'),
      currentDay,
    };
  }, [vouchers]);

  // Cash Runway Calculation & Predictive Till Exhaustion Clock
  const cashRunway = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoStr = format(sevenDaysAgo, 'yyyy-MM-dd');

    const recentCashOutflows = vouchers.filter((v) => {
      if (v.status === 'Voided' || v.status === 'Pending_Approval' || v.payment_type === 'Advance_Settlement') return false;
      if (v.payment_method !== 'Physical_Cash') return false;
      const vDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      return vDate >= sevenDaysAgoStr;
    });

    const total7DayCash = recentCashOutflows.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
    const dailyAverageCashBurn = Math.max(Math.round(total7DayCash / 7), 500);
    const runwayDays = Math.round(cashBalance / dailyAverageCashBurn);

    // Projected Depletion Date & Day
    let predictedDepletionDate = '';
    if (runwayDays <= 1) {
      predictedDepletionDate = 'Today (~6:00 PM)';
    } else if (runwayDays === 2) {
      predictedDepletionDate = 'Tomorrow (~4:30 PM)';
    } else {
      const depDate = addDays(now, Math.min(runwayDays, 60));
      predictedDepletionDate = format(depDate, 'EEEE d MMM');
    }

    // Recommended Float Top-Up: Covers 5 days of burn + 20% safety buffer, rounded to clean ₹5,000 banknote chunks
    const rawRecommended = dailyAverageCashBurn * 5 * 1.2;
    const recommendedTopUp = Math.max(10000, Math.round(rawRecommended / 5000) * 5000);

    return {
      dailyAverageCashBurn,
      runwayDays,
      predictedDepletionDate,
      recommendedTopUp,
    };
  }, [vouchers, cashBalance]);

  // Daily Spend Burn Rate & Anomaly Velocity Meter
  // Compares today's outflow against showroom's 7-day rolling daily average
  const burnRateStats = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const sevenDaysAgoStr = format(subDays(now, 7), 'yyyy-MM-dd');

    // Past 7 completed days spend (excluding today)
    const past7DaysVouchers = vouchers.filter((v) => {
      if (v.status === 'Voided' || v.status === 'Pending_Approval' || v.payment_type === 'Advance_Settlement') return false;
      const vDate = v.payment_date || (v.created_at ? v.created_at.slice(0, 10) : '');
      return vDate >= sevenDaysAgoStr && vDate < todayStr;
    });

    const totalPast7DaysSpend = past7DaysVouchers.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
    const rollingDailyAverage = Math.round(totalPast7DaysSpend / 7);

    // Today's total outflow (Cash + UPI) from treasuryBreakdown
    const todayOutflow = treasuryBreakdown.total.outflow;

    const deltaAmount = todayOutflow - rollingDailyAverage;
    const deltaPercent = rollingDailyAverage > 0 ? Math.round(((todayOutflow - rollingDailyAverage) / rollingDailyAverage) * 100) : 0;

    let paceStatus: 'normal' | 'above' | 'spike' | 'below' = 'normal';
    if (todayOutflow === 0 || deltaPercent === 0) {
      paceStatus = 'normal';
    } else if (deltaPercent > 50) {
      paceStatus = 'spike';
    } else if (deltaPercent > 0) {
      paceStatus = 'above';
    } else {
      paceStatus = 'below';
    }

    return {
      todayOutflow,
      rollingDailyAverage,
      deltaAmount,
      deltaPercent,
      paceStatus,
    };
  }, [vouchers, treasuryBreakdown.total.outflow]);


  // Category Spend Stats
  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    filteredVouchers
      .filter(
        (v) =>
          v.status !== 'Voided' &&
          v.status !== 'Pending_Approval' &&
          v.payment_type !== 'Advance_Settlement'
      )
      .forEach((v) => {
        const cat = v.category_name || 'Other';
        const cur = map.get(cat) || { count: 0, amount: 0 };
        map.set(cat, {
          count: cur.count + 1,
          amount: cur.amount + (Number(v.total_amount) || 0),
        });
      });

    const catPalette = ['#3ecf8e', '#2bb379', '#10b981', '#0f766e', '#115e59', '#334155', '#475569', '#64748b'];
    return Array.from(map.entries())
      .map(([name, stat], idx) => ({
        name,
        count: stat.count,
        amount: stat.amount,
        percentage: metrics.totalSpend > 0 ? Math.round((stat.amount / metrics.totalSpend) * 100) : 0,
        color: catPalette[idx % catPalette.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredVouchers, metrics.totalSpend]);

  const showroomTitle = selectedBranchId === 'ALL' ? 'All Showrooms' : (activeBranch?.branch_name || 'Satellite Road Showroom');
  const timeRangeLabel = effectiveTimeRange === 'today' ? 'Today' : effectiveTimeRange === 'week' ? 'This Week' : effectiveTimeRange === 'month' ? 'This Month' : effectiveTimeRange === 'quarter' ? 'This Quarter' : effectiveTimeRange === 'custom' ? 'Custom Range' : 'All Time';

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Header (Role Adaptive: Cashier Till Desk vs Executive Suite) */}
      <div className="px-4 lg:px-6 py-4 border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#141414]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-[#3ecf8e]" />
                <span>{isCashier ? 'Cash Desk & Shift Till Operations' : 'Executive Showroom Command Center'}</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-[4px] text-[11px] font-medium font-mono tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center">
                {isCashier ? `${metrics.totalBills} bills today` : `${metrics.totalBills} bills`}
              </span>
              {isPeriodLocked && (
                <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Day Locked
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
              {isCashier
                ? `Today's shift till balance, opening float, and cash vouchers for ${showroomTitle}.`
                : `Comprehensive financial telemetry, department cost centers, MoM comparisons, and live liquidity for ${showroomTitle}.`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {can('can_create_voucher') && (
              <button
                type="button"
                onClick={() => setActivePage('new-voucher')}
                className="h-9 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:bg-[#1fa672]"
              >
                <Plus className="w-4 h-4 text-[#171717] stroke-[2.5]" />
                <span>New Expense (F2)</span>
              </button>
            )}

            {!isCashier && can('can_export_tally') && (
              <button
                type="button"
                onClick={() => setActivePage('reports')}
                className="h-9 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Consolidated Financial & Tally Prime Reports Hub"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span className="hidden sm:inline">Reports &amp; Tally</span>
              </button>
            )}

            {isAdminOrManager && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsDuplicateModalOpen(true);
                }}
                className={cn(
                  "h-9 px-3 py-1.5 rounded-[6px] border text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer",
                  duplicateActiveCount > 0
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                    : "border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED]"
                )}
                title="Duplicate Detection & Resolution Studio"
              >
                <ShieldAlert className={cn("w-3.5 h-3.5", duplicateActiveCount > 0 ? "text-rose-500 animate-pulse" : "text-[#3ecf8e]")} />
                <span className="hidden sm:inline">Duplicates</span>
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full font-mono text-[10px]",
                  duplicateActiveCount > 0 ? "bg-rose-500 text-white font-bold" : "bg-slate-200 dark:bg-[#282828] text-slate-600 dark:text-[#aaa]"
                )}>
                  {duplicateActiveCount}
                </span>
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
            {isAdminOrManager && (
              <button
                type="button"
                onClick={() => setActivePage('settings')}
                className="px-2.5 py-1 rounded-[6px] bg-amber-500/20 hover:bg-amber-500/30 font-medium text-[11px] shrink-0 transition-colors"
              >
                Manage Periods (F12)
              </button>
            )}
          </div>
        )}

        {/* Duplicate Detection Alert Banner (Admin Only) */}
        {isAdminOrManager && duplicateActiveCount > 0 && (
          <div className="p-3.5 sm:p-4 rounded-[12px] bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent border border-rose-500/30 flex flex-wrap items-center justify-between gap-3 text-slate-900 dark:text-white shadow-xs animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold tracking-tight text-rose-700 dark:text-rose-400">
                    Duplicate Expense Radar: {duplicateActiveCount} Suspicious {duplicateActiveCount === 1 ? 'Entry' : 'Entries'} Detected
                  </h3>
                  <span className="px-2 py-0.5 rounded-[4px] bg-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[10px] font-bold">
                    {formatINR(duplicateAtRiskAmount)} At-Risk
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#A1A1A1] mt-0.5">
                  Identified potential duplicate bill numbers or rapid double-submissions. Review immediately to protect drawer ledger accuracy.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setIsDuplicateModalOpen(true);
              }}
              className="h-8 px-3.5 rounded-[6px] bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
            >
              <span>Review &amp; Take Action ({duplicateActiveCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* FAANG-Grade Executive Briefing Widget */}
        <ExecutiveBriefingWidget
          cashBalance={cashBalance}
          runwayDays={cashRunway.runwayDays}
          predictedDepletionDate={cashRunway.predictedDepletionDate}
          recommendedTopUp={cashRunway.recommendedTopUp}
          momComparison={momComparison}
          burnRateStats={burnRateStats}
          duplicateCount={duplicateActiveCount}
          anomalyCount={anomalyCount}
          topDepartment={departmentStats[0] || null}
          pendingStaffAdvances={{
            count: advanceMetrics.pendingCount,
            totalAmount: advanceMetrics.totalUnsettled,
          }}
          onOpenDuplicates={() => setIsDuplicateModalOpen(true)}
          onOpenReports={() => setActivePage('reports')}
          onOpenAdvances={() => setActivePage('advances')}
        />

        {/* =========================================================================
            SECTION A: CASHIER VIEW (STRICTLY SHIFT TILL ONLY - NO MACRO SPEND)
           ========================================================================= */}
        {isCashier ? (
          <div className="space-y-4">
            {/* Cashier Shift KPIs: 4 Pure Till Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Day Opening Cash Float"
                value={formatINR(dailyCashSummary.periodOpening)}
                subValue="Starting cash in till"
                badge="OPENING"
                badgeColor="neutral"
                icon={Wallet}
              />

              <MetricCard
                label="Cash Inflows (Added Today)"
                value={`+${formatINR(dailyCashSummary.periodInflows)}`}
                subValue={`${inflowMetrics.cashCount} top-ups / injections`}
                statusDotColor="#3ecf8e"
                badge="FLOAT IN"
                badgeColor="emerald"
                icon={Coins}
              />

              <MetricCard
                label="Cash Vouchers Paid (Today)"
                value={`-${formatINR(dailyCashSummary.periodOutflows)}`}
                subValue={`${metrics.cashBills} cash vouchers created`}
                badge="PAID OUT"
                badgeColor="neutral"
                icon={Receipt}
              />

              <MetricCard
                label="Expected Physical Cash"
                value={formatINR(dailyCashSummary.currentWalletCash)}
                subValue="Must match drawer notes"
                statusDotColor={isLowFloatAlert ? '#ef4444' : '#3ecf8e'}
                badge={isLowFloatAlert ? 'LOW FLOAT' : 'EXPECTED'}
                badgeColor={isLowFloatAlert ? 'amber' : 'emerald'}
                icon={TrendingUp}
              />
            </div>
          </div>
        ) : (
          /* =========================================================================
              SECTION B: EXECUTIVE / ADMIN VIEW (FULL STRATEGIC TELEMETRY)
             ========================================================================= */
          <div className="space-y-4">
            {/* Tier 2: Period & Mode Slicers Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-[8px] border border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#161616] shadow-2xs">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Unified DateRangePicker */}
                <DateRangePicker
                  startDate={customStartDate}
                  endDate={customEndDate}
                  onChange={(range) => {
                    setCustomStartDate(range.startDate);
                    setCustomEndDate(range.endDate);
                    setTimeRange('custom');
                  }}
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

                {/* 7-Day Burn Rate Velocity Meter */}
                <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-slate-50 dark:bg-[#1f1f1f] border border-slate-200/80 dark:border-[#2e2e2e] text-xs">
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    7-Day Avg:
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatINR(burnRateStats.rollingDailyAverage)}/day
                  </span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-bold uppercase inline-flex items-center gap-1',
                      burnRateStats.paceStatus === 'spike'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        : burnRateStats.paceStatus === 'above'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : burnRateStats.paceStatus === 'below'
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-[#3ecf8e] border border-emerald-500/30'
                    )}
                  >
                    <span>{burnRateStats.deltaPercent >= 0 ? `+${burnRateStats.deltaPercent}%` : `${burnRateStats.deltaPercent}%`}</span>
                    <span>{burnRateStats.paceStatus === 'spike' ? 'Spike' : burnRateStats.paceStatus === 'above' ? 'Pacing Up' : burnRateStats.paceStatus === 'below' ? 'Under Avg' : 'Normal Pace'}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSlicerCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const today = format(new Date(), 'yyyy-MM-dd');
                      setTimeRange('today');
                      setSelectedMode('ALL');
                      setCustomStartDate(today);
                      setCustomEndDate(today);
                      setActiveDeptFilter('ALL');
                      setActiveCatFilter('ALL');
                      triggerHaptic('light');
                    }}
                    className="h-8 px-2.5 py-1 rounded-[6px] border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium font-sans flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset ({activeSlicerCount})</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4 Metric Cards Telemetry Matrix: Dual Cash & UPI Day-Balance Architecture */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Day Opening Balance"
                value={formatINR(treasuryBreakdown.total.opening)}
                subValue={`Cash: ${formatINR(treasuryBreakdown.cash.opening)} | UPI: ${formatINR(treasuryBreakdown.upi.opening)}`}
                badge="OPENING"
                badgeColor="neutral"
                icon={Wallet}
                onClick={() => setActivePage('treasury')}
              />

              <MetricCard
                label="Day Inflow (Credits)"
                value={`+${formatINR(treasuryBreakdown.total.inflow)}`}
                subValue={`Cash: +${formatINR(treasuryBreakdown.cash.inflow)} | UPI: +${formatINR(treasuryBreakdown.upi.inflow)}`}
                statusDotColor="#3ecf8e"
                badge="INFLOW"
                badgeColor="emerald"
                icon={Coins}
                onClick={() => setActivePage('treasury')}
              />

              <MetricCard
                label="Total Pay Today"
                value={`-${formatINR(treasuryBreakdown.total.outflow)}`}
                subValue={`Cash: -${formatINR(treasuryBreakdown.cash.outflow)} | UPI: -${formatINR(treasuryBreakdown.upi.outflow)}`}
                badge="PAID OUT"
                badgeColor="neutral"
                icon={Receipt}
                onClick={() => setActivePage('expenses')}
              />

              <MetricCard
                label="Remaining Balance as per Today"
                value={formatINR(treasuryBreakdown.total.closing)}
                subValue={`Cash: ${formatINR(treasuryBreakdown.cash.closing)} | UPI: ${formatINR(treasuryBreakdown.upi.closing)}`}
                statusDotColor={isLowFloatAlert ? '#ef4444' : '#3ecf8e'}
                badge={isLowFloatAlert ? 'LOW FLOAT' : 'REMAINING'}
                badgeColor={isLowFloatAlert ? 'amber' : 'emerald'}
                icon={Building2}
                onClick={() => setActivePage('treasury')}
              />
            </div>

            {/* NEW EXECUTIVE STRATEGIC ROW: MoM Comparison & Staff Advance Aging */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* MoM Comparison Card (Like-for-Like MTD) */}
              <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[6px] bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                        Month-over-Month (MoM) Spend Comparison
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                        Like-for-like comparison: 1st to {momComparison.currentDay}th of {momComparison.currentMonthName} vs {momComparison.prevMonthName}
                      </p>
                    </div>
                  </div>

                  <span className={cn(
                    "px-2.5 py-1 rounded-[4px] font-mono text-xs font-semibold tabular-nums inline-flex items-center gap-1",
                    momComparison.deltaAmount > 0
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/30"
                  )}>
                    {momComparison.deltaAmount > 0 ? (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>+{momComparison.deltaPercent}% MoM</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        <span>{momComparison.deltaPercent}% MoM</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-[8px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#262626]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 block uppercase">
                      This Month (1-{momComparison.currentDay} {momComparison.currentMonthName.slice(0, 3)})
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatINR(momComparison.currentMtdSpend)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-[8px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#262626]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 block uppercase">
                      Last Month Same Days (1-{momComparison.currentDay} {momComparison.prevMonthName.slice(0, 3)})
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatINR(momComparison.prevMtdSpend)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-[8px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#262626] col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 block uppercase">
                      Full {momComparison.prevMonthName} Total
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatINR(momComparison.prevFullMonthSpend)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-sans text-slate-600 dark:text-zinc-400 bg-slate-50/50 dark:bg-[#18181a]/50 p-2 rounded-[6px] border border-slate-200/60 dark:border-[#262626]">
                  {momComparison.deltaAmount > 0
                    ? `Expenses this month are running ₹${Math.abs(momComparison.deltaAmount).toLocaleString('en-IN')} higher than the same period last month.`
                    : `Expenses this month are running ₹${Math.abs(momComparison.deltaAmount).toLocaleString('en-IN')} lower than the same period last month.`}
                </div>
              </div>

              {/* Staff Advance Aging & Cash Runway Card */}
              <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[6px] bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                        Staff Advance Aging &amp; Cash Runway
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                        Risk exposure on pending advances and drawer operational days
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-[4px] bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-mono text-xs font-semibold tabular-nums shrink-0">
                    Runway: ~{cashRunway.runwayDays} Days
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-[8px] bg-emerald-500/5 dark:bg-[#14221a] border border-emerald-500/20">
                    <span className="text-[10px] font-mono text-emerald-700 dark:text-[#3ecf8e] block uppercase">
                      0 – 7 Days (Active)
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatINR(advanceAging.bracket0to7)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-[8px] bg-amber-500/5 dark:bg-[#221c14] border border-amber-500/20">
                    <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 block uppercase">
                      8 – 15 Days (Proof Due)
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatINR(advanceAging.bracket8to15)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-[8px] bg-rose-500/5 dark:bg-[#221417] border border-rose-500/20">
                    <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 block uppercase">
                      15+ Days (Deduct Salary)
                    </span>
                    <span className="text-sm font-mono font-semibold text-rose-600 dark:text-rose-400 mt-0.5 block">
                      {formatINR(advanceAging.bracket15Plus)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-sans text-slate-600 dark:text-zinc-400 pt-0.5">
                  <span>Total Unsettled: <strong>{formatINR(advanceAging.totalUnsettled)}</strong> across {advanceAging.pendingCount} staff</span>
                  <button
                    type="button"
                    onClick={() => setActivePage('advances')}
                    className="text-emerald-600 dark:text-[#3ecf8e] font-mono hover:underline cursor-pointer"
                  >
                    View Advances (F7) &rarr;
                  </button>
                </div>
              </div>
            </div>

            {/* Main Visual: Department-Wise Spending Tracking (Cost Center Matrix) */}
            <div className="p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-[#3ecf8e]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans flex items-center gap-2">
                      <span>Department Cost-Center Spending Tracking</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e]">
                        Ranked by Outflow
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                      Real-time visibility into which departments consume the largest share of showroom operational funds.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                  {departmentStats.length > 5 ? `Top 5 of ${departmentStats.length} Cost Centers` : `${departmentStats.length} Cost Centers`}
                </span>
              </div>

              {/* Department Ranking Matrix - Top 5 Only (Click-to-Filter Table) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {departmentStats.length === 0 ? (
                  <div className="col-span-2 py-8 text-center text-slate-500 dark:text-[#737373] text-xs font-sans">
                    No department expenses recorded in this period.
                  </div>
                ) : (
                  departmentStats.slice(0, 5).map((dept, idx) => {
                    const isSelected = activeDeptFilter === dept.name;
                    return (
                      <button
                        key={dept.name}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          if (isSelected) {
                            setActiveDeptFilter('ALL');
                          } else {
                            setActiveDeptFilter(dept.name);
                            setTimeout(() => {
                              document.getElementById('dashboard-voucher-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 100);
                          }
                        }}
                        className={cn(
                          'w-full text-left p-3 rounded-[8px] border transition-all cursor-pointer group shadow-2xs space-y-2',
                          isSelected
                            ? 'bg-[#3ecf8e]/10 border-[#3ecf8e] ring-1 ring-[#3ecf8e]/30 shadow-xs'
                            : 'bg-slate-50 dark:bg-[#18181a] border-slate-200 dark:border-[#242424] hover:border-slate-300 dark:hover:border-[#383838] hover:bg-slate-100/70 dark:hover:bg-[#1c1c1e]'
                        )}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'w-5 h-5 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shrink-0',
                                isSelected
                                  ? 'bg-[#3ecf8e] text-slate-950 font-black'
                                  : 'bg-slate-200 dark:bg-[#282828] text-slate-700 dark:text-zinc-300'
                              )}
                            >
                              #{idx + 1}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {dept.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 shrink-0">
                              ({dept.count} {dept.count === 1 ? 'bill' : 'bills'})
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.2 rounded-[4px] bg-[#3ecf8e] text-slate-950 text-[9px] font-bold font-mono uppercase tracking-wide shrink-0">
                                Sliced
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {formatINR(dept.amount)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e] font-mono text-[10px] font-bold">
                              {dept.percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-[#282828] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(dept.percentage, 3)}%`,
                              backgroundColor: dept.color,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer: For more, go to Report View */}
              {departmentStats.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-[#242424] flex flex-wrap items-center justify-between gap-2.5">
                  <span className="text-xs text-slate-500 dark:text-[#888]">
                    {departmentStats.length > 5
                      ? `Displaying Top 5 highest-spend cost centers (${departmentStats.length - 5} additional departments active).`
                      : `Displaying all ${departmentStats.length} active cost centers for this timeframe.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActivePage('reports');
                    }}
                    className="px-3 py-1.5 rounded-[6px] bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/20 border border-[#3ecf8e]/30 text-xs font-sans text-emerald-800 dark:text-[#3ecf8e] flex items-center gap-1.5 transition-colors cursor-pointer group font-medium shadow-2xs"
                  >
                    <span>View Full Department Breakdown in Reports</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#3ecf8e] transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              )}
            </div>

            {/* FAANG-Grade Observability: Department Budget Caps & Hourly Spend Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6">
                <DepartmentBudgetCapsWidget departmentStats={departmentStats} />
              </div>
              <div className="lg:col-span-6">
                <HourlyHeatmapWidget vouchers={filteredVouchers} />
              </div>
            </div>

            {/* Visual: Activity Histogram & Categories */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#3ecf8e]" />
                  <h2 className="text-sm font-medium text-slate-900 dark:text-white font-sans">
                    Expenses Over Time &amp; Activity {selectedMode === 'Physical_Cash' ? '(Cash Only)' : selectedMode === 'Online_UPI' ? '(UPI Only)' : ''}
                  </h2>
                  <span className="text-xs font-mono text-slate-500 dark:text-[#737373]">
                    ({filteredVouchers.length} {filteredVouchers.length === 1 ? 'bill' : 'bills'} · {timeRangeLabel})
                  </span>
                </div>
              </div>

              <LogsBarChart metrics={metrics} vouchers={filteredVouchers} selectedMode={selectedMode} />
            </div>

            {/* 4. Real Expense Categories & Daily Cash Drawer Reconciliation */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Real Expense Categories */}
              <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
                      <PieChart className="w-4 h-4 text-[#3ecf8e]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                        Expense Heads Breakdown
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                        Operational expense breakdown across active categories
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-[4px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                    {categoryStats.length} Categories
                  </span>
                </div>

                <div className="space-y-2">
                  {categoryStats.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 dark:text-[#737373] text-xs font-sans">
                      No category expense records found in selected period.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-[#242424]">
                      {categoryStats.slice(0, 6).map((item, idx) => {
                        const isSelected = activeCatFilter === item.name;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              if (isSelected) {
                                setActiveCatFilter('ALL');
                              } else {
                                setActiveCatFilter(item.name);
                                setTimeout(() => {
                                  document.getElementById('dashboard-voucher-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 100);
                              }
                            }}
                            className={cn(
                              'w-full text-left py-2.5 px-2 flex flex-col gap-1.5 rounded-[6px] transition-all cursor-pointer group',
                              isSelected
                                ? 'bg-[#3ecf8e]/15 border border-[#3ecf8e]/40 ring-1 ring-[#3ecf8e]/30 shadow-xs'
                                : 'hover:bg-slate-50 dark:hover:bg-[#1a1a1a]'
                            )}
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
                                {isSelected && (
                                  <span className="px-1.5 py-0.2 rounded-[4px] bg-[#3ecf8e] text-slate-950 text-[9px] font-bold font-mono uppercase tracking-wide shrink-0">
                                    Sliced
                                  </span>
                                )}
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
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Daily Cash Drawer Statement */}
              <div className="lg:col-span-6 p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
                      <Wallet className="w-4 h-4 text-[#3ecf8e]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans">
                        Daily Cash Drawer Statement (Day-by-Day)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
                        Opening &amp; closing balances to spot any cash variances
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-[4px] bg-emerald-500/10 border border-emerald-500/20 text-[#3ecf8e] font-mono text-xs font-semibold tabular-nums shrink-0">
                    Till: {formatINR(dailyCashSummary.currentWalletCash)}
                  </span>
                </div>

                <div className="space-y-2">
                  {dailyCashSummary.days.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 dark:text-[#737373] text-xs font-sans">
                      No cash transactions found for the selected time period.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-[#242424]">
                      {dailyCashSummary.days.slice(0, 6).map((day) => (
                        <div
                          key={day.date}
                          className="py-2.5 px-2 flex flex-col gap-1 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] rounded-[6px] transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-medium text-slate-900 dark:text-white">
                              {day.displayDate}
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              Closing: {formatINR(day.closing)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-[#888888]">
                            <span>Open: {formatINR(day.opening)}</span>
                            <div className="flex items-center gap-2">
                              {day.inflow > 0 && (
                                <span className="text-emerald-600 dark:text-[#3ecf8e]">
                                  +{formatINR(day.inflow)}
                                </span>
                              )}
                              {day.outflow > 0 && (
                                <span className="text-rose-600 dark:text-rose-400">
                                  -{formatINR(day.outflow)}
                                </span>
                              )}
                              {day.inflow === 0 && day.outflow === 0 && (
                                <span className="text-slate-400">₹0 net flow</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setActivePage('treasury');
                    }}
                    className="w-full mt-2 py-2 px-3 rounded-[6px] bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/20 border border-[#3ecf8e]/30 text-xs font-sans text-emerald-800 dark:text-[#3ecf8e] flex items-center justify-center gap-1.5 transition-colors cursor-pointer group shadow-2xs font-medium"
                  >
                    <span>Open Full Cash Passbook &amp; Ledger (F4)</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#3ecf8e] transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Recent Expense Records Table (Common to Both Roles) */}
        <div id="dashboard-voucher-table" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#3ecf8e]" />
              <div>
                <h2 className="text-sm font-medium text-slate-900 dark:text-white font-sans">
                  {isCashier ? "Expense Bills & Receipts" : "Recent Expenses & Bills"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#A1A1A1] font-sans mt-0.5">
                  {isCashier
                    ? `Expense vouchers recorded for ${activeBranch?.branch_code || 'branch'}`
                    : `Latest payments in selected timeframe`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('expenses')}
              className="px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-100 dark:bg-[#1a1a1a] hover:bg-slate-200 dark:hover:bg-[#222222] text-xs font-medium text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer font-sans"
            >
              <span>{isCashier ? "View Ledger" : "View All Expenses"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Active Click-to-Filter Slicers Banner */}
          {(activeDeptFilter !== 'ALL' || activeCatFilter !== 'ALL') && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 px-3 rounded-[8px] bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-xs animate-in fade-in">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span className="font-medium text-slate-700 dark:text-zinc-200">Filtering Table By:</span>
                {activeDeptFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#3ecf8e] text-slate-950 font-semibold font-mono text-[11px] shadow-2xs">
                    <span>Dept: {activeDeptFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveDeptFilter('ALL');
                      }}
                      className="hover:opacity-75 cursor-pointer"
                      title="Remove Department Filter"
                    >
                      <X className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </span>
                )}
                {activeCatFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#3ecf8e] text-slate-950 font-semibold font-mono text-[11px] shadow-2xs">
                    <span>Category: {activeCatFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveCatFilter('ALL');
                      }}
                      className="hover:opacity-75 cursor-pointer"
                      title="Remove Category Filter"
                    >
                      <X className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveDeptFilter('ALL');
                  setActiveCatFilter('ALL');
                }}
                className="text-xs font-semibold text-emerald-800 dark:text-[#3ecf8e] hover:underline cursor-pointer"
              >
                Clear Slicers
              </button>
            </div>
          )}

          <div>
            <VoucherTable
              vouchers={vouchers}
              categories={categories}
              departments={departments}
              hideTelemetry={true}
              startDate={customStartDate}
              endDate={customEndDate}
              departmentFilter={activeDeptFilter}
              categoryFilter={activeCatFilter}
              onClearDepartmentFilter={() => setActiveDeptFilter('ALL')}
              onClearCategoryFilter={() => setActiveCatFilter('ALL')}
              onDateRangeChange={(range) => {
                setCustomStartDate(range.startDate);
                setCustomEndDate(range.endDate);
                setTimeRange('custom');
              }}
            />
          </div>
        </div>
      </div>

      {/* Duplicate Detection Studio Modal */}
      <DuplicateDetectionModal
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        clusters={duplicateClusters}
        onDismiss={dismissCluster}
        onRefresh={() => {
          refresh();
          loadWallet();
          loadLedger();
        }}
      />
    </div>
  );
};
