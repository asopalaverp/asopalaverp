import { supabase } from '@/lib/supabase';
import { logSecurityEvent } from '@/lib/audit';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineQueue } from '@/lib/offlineQueue';
import { useVoucherStore } from '@/store/voucherStore';
import { useBranchStore } from '@/store/branchStore';
import { useOverrideStore } from '@/store/overrideStore';
import { format } from 'date-fns';
import bcrypt from 'bcryptjs';
import { DEFAULT_BRANCHES, normalizeBranchCode, normalizeBranchId } from '@/lib/utils';
import {
  BranchWallet,
  WalletLedger,
  FloatAllocation,
  ExpenseVoucher,
  VoucherSplit,
  StaffAdvance,
  CashClosing,
  AccountingPeriod,
  DrawerSession,
  CurrencyDenomination,
  AppUser,
  AppRole,
  RolePermissions,
  StaffMember,
} from '@/types/database';

export const isPrivilegedAdminRole = (role?: string | null): boolean => {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, '');
  return (
    normalized === 'superadmin' ||
    normalized === 'admin' ||
    normalized === 'developer' ||
    normalized === 'owner'
  );
};

export interface CreateVoucherParams {
  voucher: Omit<ExpenseVoucher, 'id' | 'created_at'>;
  splits?: Array<{
    staffCode: string;
    staffName: string;
    departmentName: string;
    categoryName: string;
    amount: number;
  }>;
  userName: string;
  userRole: string;
}

export interface DisburseAdvanceParams {
  advance: Omit<
    StaffAdvance,
    'id' | 'created_at' | 'bills_submitted_amount' | 'cash_returned_amount' | 'unsettled_balance' | 'settlement_proofs' | 'status'
  >;
  userName: string;
  userRole: string;
}

export interface SettleAdvanceParams {
  advanceId: string;
  receiptNumber: string;
  staffCode: string;
  branchId: string;
  branchCode: string;
  billsSubmittedAmount: number;
  cashReturnedAmount: number;
  settlementProofs: string[];
  userName: string;
  userRole: string;
}

export interface FloatTopupParams {
  branchId: string;
  branchCode: string;
  walletType: 'Cash' | 'UPI';
  amount: number;
  referenceNotes?: string;
  authorizedByName: string;
  receivedByName: string;
  createdAt?: string;
}

export interface SafeDropParams {
  branchId: string;
  branchCode: string;
  amount: number;
  reason?: string;
  transferredByName: string;
  verifiedByName: string;
}

export interface SaveCashClosingParams {
  branchId: string;
  branchCode: string;
  closingDate: string;
  openingCash: number;
  cashInflow: number;
  cashOutflow: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  varianceDisposition?: 'Cashier_Charge' | 'Expense_Writeoff' | 'Excess_Income' | 'Unresolved' | string;
  chargeStaffCode?: string;
  chargeStaffName?: string;
  denominationsDetail: string;
  denominationsBreakdown: Record<string, number>;
  closingNotes?: string;
  cashierName: string;
  verifiedByName: string;
}

class ERPService {
  // --------------------------------------------------------------------------
  // 1. ACCOUNTING PERIODS & LOCKING
  // --------------------------------------------------------------------------
  async getAccountingPeriods(): Promise<AccountingPeriod[]> {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('period_key', { ascending: false });

      if (!error && data && data.length > 0) {
        localStorage.setItem('asopalav_accounting_periods', JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Using local accounting periods fallback', e);
    }

    const local = localStorage.getItem('asopalav_accounting_periods');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // ignore
      }
    }

    const defaultPeriods: AccountingPeriod[] = [
      {
        period_key: '2026-10',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        is_locked: false,
      },
      {
        period_key: '2026-09',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        is_locked: false,
      },
      {
        period_key: '2026-08',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        is_locked: true,
        locked_at: '2026-08-31T23:59:59Z',
        locked_by_name: 'Hemendra Bhai',
        lock_reason: 'Monthly Accounts Finalized & Audited',
      },
    ];

    try {
      await supabase.from('accounting_periods').upsert(defaultPeriods, { onConflict: 'period_key' });
    } catch {
      // offline/fallback
    }

    localStorage.setItem('asopalav_accounting_periods', JSON.stringify(defaultPeriods));
    return defaultPeriods;
  }

  async togglePeriodLock(
    periodKey: string,
    lock: boolean,
    userName: string,
    reason?: string,
    startDate?: string,
    endDate?: string
  ) {
    const start = startDate || `${periodKey}-01`;
    const parts = periodKey.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const lastDay = new Date(year, month, 0).getDate();
    const end = endDate || `${periodKey}-${String(lastDay).padStart(2, '0')}`;

    const updateData: AccountingPeriod = {
      period_key: periodKey,
      start_date: start,
      end_date: end,
      is_locked: lock,
      locked_at: lock ? new Date().toISOString() : null,
      locked_by_name: lock ? userName : null,
      lock_reason: lock ? reason || 'Monthly Accounts Finalized & Audited' : null,
    };

    try {
      const { error } = await supabase
        .from('accounting_periods')
        .upsert([updateData], { onConflict: 'period_key' });
      if (error) throw error;
    } catch (e: any) {
      console.warn('Accounting period upsert fallback to local storage:', e);
    }

    // Update local cache immediately
    try {
      const current = await this.getAccountingPeriods();
      const updated = current.map((p) => (p.period_key === periodKey ? { ...p, ...updateData } : p));
      if (!updated.some((p) => p.period_key === periodKey)) {
        updated.unshift(updateData);
      }
      localStorage.setItem('asopalav_accounting_periods', JSON.stringify(updated));
    } catch {
      // ignore
    }

    await logSecurityEvent({
      userName,
      userRole: 'Store_Manager',
      actionType: 'Lock_Period',
      targetEntity: 'accounting_periods',
      targetIdentifier: periodKey,
      eventDescription: `${lock ? 'Locked' : 'Unlocked'} accounting period ${periodKey}`,
      justification: reason || (lock ? 'Month end account freeze' : 'Auditor adjustment clearance'),
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:period-lock-updated', { detail: updateData }));
    }
  }

  async checkIsPeriodLocked(dateString: string): Promise<boolean> {
    if (useOverrideStore.getState().isLockedPeriodEntryAllowed()) {
      return false;
    }
    const periodKey = dateString.slice(0, 7); // e.g. '2026-09'
    const periods = await this.getAccountingPeriods();
    const match = periods.find((p) => p.period_key === periodKey);
    return match ? match.is_locked : false;
  }

  // --------------------------------------------------------------------------
  // 2. WALLET BALANCES & DOUBLE-ENTRY LEDGER
  // --------------------------------------------------------------------------
  async getBranchWallet(branchId: string = 'Aellp-ASI'): Promise<BranchWallet> {
    const canonicalId = branchId === 'ALL' ? 'ALL' : normalizeBranchId(branchId);
    const code = normalizeBranchCode(branchId);

    try {
      if (canonicalId === 'ALL') {
        const { data } = await supabase.from('branch_wallets').select('*');
        if (data && data.length > 0) {
          const totalCash = data.reduce((sum, w) => sum + (Number(w.cash_balance) || 0), 0);
          const totalUpi = data.reduce((sum, w) => sum + (Number(w.upi_balance) || 0), 0);
          return {
            branch_id: 'ALL',
            cash_balance: totalCash,
            upi_balance: totalUpi,
          };
        }
      } else {
        const { data } = await supabase
          .from('branch_wallets')
          .select('*')
          .or(`branch_id.eq.${canonicalId},branch_id.eq.${code}`)
          .maybeSingle();
        if (data) return data;
      }
    } catch (e) {
      console.warn('Branch wallet fetched from memory/cache', e);
    }

    const local = localStorage.getItem(`asopalav_wallet_${canonicalId}`) || localStorage.getItem(`asopalav_wallet_${branchId}`);
    if (local) return JSON.parse(local);

    if (canonicalId === 'ALL') {
      return {
        branch_id: 'ALL',
        cash_balance: 0,
        upi_balance: 0,
      };
    }

    const defaultWallet: BranchWallet = {
      branch_id: canonicalId,
      cash_balance: 0,
      upi_balance: 0,
    };

    localStorage.setItem(`asopalav_wallet_${canonicalId}`, JSON.stringify(defaultWallet));
    return defaultWallet;
  }

  async updateBranchWallet(wallet: BranchWallet) {
    localStorage.setItem(`asopalav_wallet_${wallet.branch_id}`, JSON.stringify(wallet));
    const updatedAt = new Date().toISOString();
    try {
      // Use upsert with updated_at for basic concurrency detection
      const { error } = await supabase.from('branch_wallets').upsert([
        {
          branch_id: wallet.branch_id,
          cash_balance: wallet.cash_balance,
          upi_balance: wallet.upi_balance,
          updated_at: updatedAt,
        },
      ]);
      if (error) throw error;
    } catch (e) {
      console.warn('Wallet upsert fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'wallet_upsert',
        table: 'branch_wallets',
        action: 'upsert',
        payload: {
          branch_id: wallet.branch_id,
          cash_balance: wallet.cash_balance,
          upi_balance: wallet.upi_balance,
          updated_at: updatedAt,
        },
        description: `Wallet update ${wallet.branch_id}`,
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:wallet-updated', { detail: wallet }));
    }
  }

  async recalculateBranchWalletFromLedger(branchId: string = 'Aellp-ASI'): Promise<BranchWallet> {
    const canonicalId = branchId === 'ALL' ? 'ALL' : normalizeBranchId(branchId);
    const code = normalizeBranchCode(branchId);

    // Fetch all current ledger rows
    const ledger = await this.getWalletLedger(branchId);

    let netCash = 0;
    let netUpi = 0;

    ledger.forEach((entry) => {
      const credit = Number(entry.credit_amount) || 0;
      const debit = Number(entry.debit_amount) || 0;
      const isUpi = entry.wallet_type === 'UPI';

      if (isUpi) {
        netUpi += credit - debit;
      } else {
        netCash += credit - debit;
      }
    });

    const updatedWallet: BranchWallet = {
      branch_id: canonicalId,
      cash_balance: Math.max(0, netCash),
      upi_balance: Math.max(0, netUpi),
    };

    await this.updateBranchWallet(updatedWallet);

    // Synchronize local storage caches
    localStorage.setItem(`asopalav_wallet_${canonicalId}`, JSON.stringify(updatedWallet));
    localStorage.setItem(`asopalav_wallet_${code}`, JSON.stringify(updatedWallet));
    localStorage.setItem(`asopalav_ledger_${canonicalId}`, JSON.stringify(ledger.slice(0, 200)));
    localStorage.setItem(`asopalav_ledger_${code}`, JSON.stringify(ledger.slice(0, 200)));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:wallet-updated', { detail: updatedWallet }));
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
    }

    return updatedWallet;
  }

  async getWalletLedger(branchId: string = 'Aellp-ASI'): Promise<WalletLedger[]> {
    const code = normalizeBranchCode(branchId);
    const isAll = !branchId || branchId === 'ALL' || code === 'ALL';
    const canonicalId = isAll ? 'ALL' : normalizeBranchId(branchId);

    const sanitizeAndDeduplicateLedger = (entries: WalletLedger[]): WalletLedger[] => {
      const seen = new Set<string>();
      return entries.filter((item) => {
        if (!item) return false;
        if (item.reference_number && (item.transaction_type === 'Expense_Voucher' || item.transaction_type === 'Float_Topup' || item.transaction_type === 'Safe_Drop')) {
          const key = `${item.transaction_type}-${item.reference_number}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }
        const key = item.id || `${item.created_at}-${item.credit_amount}-${item.debit_amount}-${item.remarks}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    try {
      let query = supabase
        .from('wallet_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!isAll) {
        query = query.or(`branch_id.eq.${canonicalId},branch_id.eq.${code},branch_code.eq.${code}`);
      }

      const { data, error } = await query;
      if (!error && data !== null) {
        const clean = sanitizeAndDeduplicateLedger(data);
        localStorage.setItem(`asopalav_ledger_${canonicalId}`, JSON.stringify(clean.slice(0, 200)));
        return clean;
      }
    } catch (e) {
      console.warn('Wallet ledger fallback to local cache:', e);
    }

    const keysToCheck = isAll
      ? ['asopalav_ledger_ALL', 'asopalav_ledger_Aellp-ASI', 'asopalav_ledger_ASI', 'asopalav_ledger_CG', 'asopalav_ledger_NAV', 'asopalav_ledger_SUR']
      : [`asopalav_ledger_${canonicalId}`, `asopalav_ledger_${code}`, `asopalav_ledger_${branchId}`, 'asopalav_ledger_ALL', 'asopalav_ledger_Aellp-ASI'];

    for (const key of keysToCheck) {
      const local = localStorage.getItem(key);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (isAll) return sanitizeAndDeduplicateLedger(parsed);
            const filtered = parsed.filter(
              (l: any) =>
                normalizeBranchCode(l.branch_code) === code ||
                normalizeBranchCode(l.branch_id) === code ||
                normalizeBranchId(l.branch_id) === canonicalId
            );
            if (filtered.length > 0) return sanitizeAndDeduplicateLedger(filtered);
            return sanitizeAndDeduplicateLedger(parsed); // fallback
          }
        } catch {
          // Ignore
        }
      }
    }

    return [];
  }

  async appendLedgerEntry(entry: Omit<WalletLedger, 'id' | 'ledger_sequence' | 'created_at'> & { created_at?: string }) {
    const fullEntry: WalletLedger = {
      ...entry,
      id: crypto.randomUUID(),
      ledger_sequence: Date.now(),
      created_at: entry.created_at || new Date().toISOString(),
    };

    const existing = await this.getWalletLedger(entry.branch_id);
    // Deduplicate against existing ledger entries to guarantee zero duplicate deductions
    const exists = existing.some(
      (e) =>
        entry.reference_number &&
        e.reference_number === entry.reference_number &&
        e.transaction_type === entry.transaction_type
    );
    if (exists) {
      console.warn(`[appendLedgerEntry] Skipped duplicate ledger entry for ${entry.reference_number}`);
      return existing.find((e) => e.reference_number === entry.reference_number)!;
    }

    const updated = [fullEntry, ...existing];
    localStorage.setItem(`asopalav_ledger_${entry.branch_id}`, JSON.stringify(updated.slice(0, 200)));

    try {
      const { error } = await supabase.from('wallet_ledger').insert([fullEntry]);
      if (error) throw error;
    } catch (e) {
      console.warn('Ledger insert queued offline:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'wallet_ledger',
        table: 'wallet_ledger',
        action: 'insert',
        payload: fullEntry,
        description: `Ledger entry ${fullEntry.reference_number}`,
      });
    }
    return fullEntry;
  }
  async deleteLedgerEntry(params: {
    entryId: string;
    branchId: string;
    userName: string;
    userRole: string;
    reason?: string;
    adjustWalletBalance?: boolean;
  }): Promise<void> {
    const { entryId, branchId, userName, userRole, reason, adjustWalletBalance = false } = params;
    
    // Get existing ledger for the branch
    const existing = await this.getWalletLedger(branchId);
    const target = existing.find((e) => e.id === entryId || e.reference_number === entryId);

    if (target && adjustWalletBalance) {
      const wallet = await this.getBranchWallet(branchId);
      const isUpi = target.wallet_type === 'UPI';
      const credit = Number(target.credit_amount) || 0;
      const debit = Number(target.debit_amount) || 0;

      // Revert ledger effect on wallet
      if (isUpi) {
        wallet.upi_balance = Math.max(0, wallet.upi_balance - credit + debit);
      } else {
        wallet.cash_balance = Math.max(0, wallet.cash_balance - credit + debit);
      }
      await this.updateBranchWallet(wallet);
    }

    // Remove from local storage
    const updated = existing.filter((e) => e.id !== entryId && e.reference_number !== entryId);
    localStorage.setItem(`asopalav_ledger_${branchId}`, JSON.stringify(updated.slice(0, 200)));

    // Remove from Supabase
    try {
      if (target?.id) {
        await supabase.from('wallet_ledger').delete().eq('id', target.id);
      } else if (target?.reference_number) {
        await supabase.from('wallet_ledger').delete().eq('reference_number', target.reference_number);
      }
    } catch (e) {
      console.warn('Ledger delete fallback:', e);
    }

    // Audit Log
    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Voucher' as any,
      targetEntity: 'wallet_ledger',
      targetIdentifier: target?.reference_number || entryId,
      eventDescription: `Super Admin purged ledger entry ${target?.reference_number || entryId}${adjustWalletBalance ? ' and corrected wallet balance' : ''}`,
      justification: reason || 'Audit duplicate / correction purge',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }
  }

  async cleanDuplicateLedgerEntries(branchId: string, userName: string, userRole: string): Promise<{ removedCount: number }> {
    const rawLedger = await this.getWalletLedger(branchId);
    const seen = new Set<string>();
    const cleanList: WalletLedger[] = [];
    const duplicates: WalletLedger[] = [];

    for (const item of rawLedger) {
      const key = item.reference_number
        ? `${item.transaction_type}-${item.reference_number}`
        : item.id || `${item.created_at}-${item.credit_amount}-${item.debit_amount}`;

      if (seen.has(key)) {
        duplicates.push(item);
      } else {
        seen.add(key);
        cleanList.push(item);
      }
    }

    if (duplicates.length === 0) {
      return { removedCount: 0 };
    }

    // Save cleaned list locally
    localStorage.setItem(`asopalav_ledger_${branchId}`, JSON.stringify(cleanList.slice(0, 200)));

    // Remove duplicates from Supabase
    try {
      const dupIds = duplicates.map((d) => d.id).filter(Boolean);
      if (dupIds.length > 0) {
        await supabase.from('wallet_ledger').delete().in('id', dupIds);
      }
    } catch (e) {
      console.warn('Duplicate purge DB fallback:', e);
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Voucher' as any,
      targetEntity: 'wallet_ledger',
      targetIdentifier: `${branchId}-${duplicates.length}-dups`,
      eventDescription: `Cleaned ${duplicates.length} duplicate ledger records for branch ${branchId}`,
      justification: 'Automated ledger integrity audit',
    });

    // Automatically recalculate branch wallet balance from the cleaned ledger
    await this.recalculateBranchWalletFromLedger(branchId);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
    }

    return { removedCount: duplicates.length };
  }

  /**
   * Permanently purges specific erroneous historical test records across all tables (float_allocations, wallet_ledger, localStorage)
   * and synchronizes branch_wallets to exact mathematical truth from 1 Oct onwards.
   */
  async purgeErroneousHistoricalRecords(branchId: string = 'Aellp-ASI'): Promise<{ purged: boolean; message: string }> {
    const canonicalId = normalizeBranchId(branchId);
    const code = normalizeBranchCode(branchId);
    const targetRefNumbers = ['FLT-856048', 'FLT-984105'];
    const targetIds = ['66adb6d4-930a-486f-95fd-717850cda0c4', 'ef3d74c6-2779-4870-848c-eeadb7421405'];

    // 1. Purge from float_allocations in Supabase
    try {
      await supabase
        .from('float_allocations')
        .delete()
        .or(`allocation_number.in.(${targetRefNumbers.join(',')}),id.in.(${targetIds.join(',')})`);
    } catch (e) {
      console.warn('Float allocations purge fallback:', e);
    }

    // 2. Purge from wallet_ledger in Supabase
    try {
      await supabase
        .from('wallet_ledger')
        .delete()
        .or(`reference_number.in.(${targetRefNumbers.join(',')}),id.in.(${targetIds.join(',')})`);
    } catch (e) {
      console.warn('Wallet ledger purge fallback:', e);
    }

    // 3. Purge from localStorage across all keys
    const keysToCheck = [
      `asopalav_ledger_${canonicalId}`,
      `asopalav_ledger_${code}`,
      `asopalav_ledger_${branchId}`,
      'asopalav_ledger_ALL',
      'asopalav_ledger_Aellp-ASI',
      'asopalav_ledger_ASI',
    ];

    keysToCheck.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const cleaned = list.filter(
              (item: any) =>
                !targetRefNumbers.includes(item?.reference_number) &&
                !targetIds.includes(item?.id)
            );
            localStorage.setItem(key, JSON.stringify(cleaned.slice(0, 200)));
          }
        } catch {
          // ignore
        }
      }
    });

    // 4. Purge from offlineQueue if any pending mutation mentions these references
    try {
      const offlineQueue = useOfflineQueue.getState();
      const remaining = offlineQueue.mutations.filter((m) => {
        const payloadStr = JSON.stringify(m.payload || {});
        return !targetRefNumbers.some((ref) => payloadStr.includes(ref)) && !targetIds.some((id) => payloadStr.includes(id));
      });
      useOfflineQueue.setState({ mutations: remaining });
      localStorage.setItem('asopalav_offline_mutations', JSON.stringify(remaining));
    } catch {
      // ignore
    }

    // 5. Recalculate branch wallet balance from clean ledger
    await this.recalculateBranchWalletFromLedger(branchId);

    // 6. Security Audit Log
    await logSecurityEvent({
      userName: 'Super Admin',
      userRole: 'Super_Admin',
      actionType: 'Delete_Voucher' as any,
      targetEntity: 'branch_wallets',
      targetIdentifier: 'HISTORICAL-CLEANUP-SEPT-TOPUPS',
      eventDescription: `Permanently purged 2 erroneous September float records (FLT-856048 ₹50,532 & FLT-984105 ₹30,636) across float_allocations, wallet_ledger, and offline queue, and reconciled till wallet balance.`,
      justification: 'Super Admin manual balance correction for clean 1-Oct ledger books',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return {
      purged: true,
      message: 'Successfully purged September test float records and reconciled wallet balance.',
    };
  }

  // --------------------------------------------------------------------------
  // 3. EXPENSE VOUCHER TRANSACTION (ATOMIC LEDGER & SPLITS)
  // --------------------------------------------------------------------------
  validateSection40A3(
    paymentMethod: string,
    amount: number,
    paymentType: string
  ): { isCompliant: boolean; limit: number; exceeded: boolean; reason?: string } {
    if (paymentMethod !== 'Physical_Cash' || useOverrideStore.getState().is40A3ExceededAllowed()) {
      return { isCompliant: true, limit: Infinity, exceeded: false };
    }
    // Section 40A(3): ₹10,000 cash limit. Courier/GTA exemption u/s 40A(3A): ₹35,000.
    const limit = paymentType === 'Courier' ? 35000 : 10000;
    const exceeded = amount > limit;
    return {
      isCompliant: !exceeded,
      limit,
      exceeded,
      reason: exceeded
        ? `Income Tax Section 40A(3) Notice: Cash payments above ₹${limit.toLocaleString('en-IN')} cannot be claimed as business expense. Switch to Online UPI / Bank QR.`
        : undefined,
    };
  }

  async getDailyVendorCashTotal(
    branchId: string,
    recipientName: string,
    date: string
  ): Promise<{ totalCash: number; voucherCount: number }> {
    if (!recipientName || !recipientName.trim()) return { totalCash: 0, voucherCount: 0 };
    const cleanRecipient = recipientName.trim().toLowerCase();

    try {
      let query = supabase
        .from('expense_vouchers')
        .select('*')
        .eq('payment_date', date)
        .eq('payment_method', 'Physical_Cash')
        .neq('status', 'Voided');

      if (branchId && branchId !== 'ALL') {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        const matches = data.filter(
          (v) => v.recipient_name?.trim().toLowerCase() === cleanRecipient
        );
        const totalCash = matches.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0);
        return { totalCash, voucherCount: matches.length };
      }
    } catch (e) {
      console.warn('Daily vendor cash fallback:', e);
    }
    return { totalCash: 0, voucherCount: 0 };
  }

  async getStaffPendingAdvance(
    staffCode: string,
    branchId?: string
  ): Promise<{ hasPending: boolean; totalUnsettled: number; advances: StaffAdvance[] }> {
    if (!staffCode) return { hasPending: false, totalUnsettled: 0, advances: [] };

    try {
      const allAdvances = await this.getStaffAdvances(branchId);
      const staffAdvances = allAdvances.filter(
        (a) =>
          a.staff_code === staffCode &&
          a.unsettled_balance > 0 &&
          (a.status === 'Active_Unsettled' || a.status === 'Flagged_Salary_Deduction')
      );

      const totalUnsettled = staffAdvances.reduce((sum, a) => sum + (Number(a.unsettled_balance) || 0), 0);
      return {
        hasPending: staffAdvances.length > 0,
        totalUnsettled,
        advances: staffAdvances,
      };
    } catch (e) {
      console.warn('Staff pending advance check fallback:', e);
      return { hasPending: false, totalUnsettled: 0, advances: [] };
    }
  }

  generateTallyExportCSV(vouchers: ExpenseVoucher[]): string {
    const headers = [
      'Voucher Date (DD-MM-YYYY)',
      'Voucher Type',
      'Voucher Number',
      'Debit Ledger (Expense Head)',
      'Debit Amount (INR)',
      'Credit Ledger (Payment Source)',
      'Credit Amount (INR)',
      'Cost Centre (Showroom Branch)',
      'Paid To (Beneficiary)',
      'Bill Reference No',
      'Payment Mode',
      'Narration / Audit Remarks',
    ];

    const mapCategoryToDebitLedger = (category: string) => {
      const cat = (category || '').trim().toLowerCase();
      if (cat.includes('stationery') || cat.includes('printing') || cat.includes('paper')) return 'Printing & Stationery A/c';
      if (cat.includes('food') || cat.includes('welfare') || cat.includes('tea') || cat.includes('refreshment') || cat.includes('snacks')) return 'Staff Welfare & Refreshment A/c';
      if (cat.includes('repair') || cat.includes('maintenance') || cat.includes('hardware')) return 'Repairs & Maintenance A/c';
      if (cat.includes('courier') || cat.includes('postage') || cat.includes('dispatch') || cat.includes('parcel')) return 'Postage & Courier Expenses A/c';
      if (cat.includes('electricity') || cat.includes('power') || cat.includes('utility') || cat.includes('water')) return 'Electricity & Utility Expenses A/c';
      if (cat.includes('travel') || cat.includes('conveyance') || cat.includes('fuel') || cat.includes('petrol') || cat.includes('auto')) return 'Conveyance & Travel Expenses A/c';
      if (cat.includes('housekeeping') || cat.includes('cleaning') || cat.includes('pantry') || cat.includes('sanitation')) return 'Housekeeping & Cleaning A/c';
      if (cat.includes('marketing') || cat.includes('ad') || cat.includes('branding') || cat.includes('promotion')) return 'Advertisement & Publicity A/c';
      if (cat.includes('advance') || cat.includes('imprest')) return 'Staff Imprest & Advance A/c';
      return `${category || 'General Expense'} A/c`;
    };

    const mapPaymentToCreditLedger = (method: string, branchCode: string) => {
      if (method === 'Physical_Cash') {
        return `Cash on Hand - ${branchCode || 'ASI'} A/c`;
      }
      return `HDFC Bank Current A/c - ${branchCode || 'ASI'}`;
    };

    const formatTallyDate = (dateStr: string) => {
      if (!dateStr) return format(new Date(), 'dd-MM-yyyy');
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          // YYYY-MM-DD -> DD-MM-YYYY
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      } catch {
        return dateStr;
      }
    };

    // H-3 Fix: Exclude Advance_Settlement vouchers from Tally export — they are accounting records only.
    // The cash outflow was already recorded at advance disbursement time. Including them would double-count.
    const validVouchers = vouchers.filter((v) =>
      (v.status === 'Approved' || v.status === undefined) &&
      v.payment_type !== 'Advance_Settlement'
    );

    const sanitizeCsvCell = (str: string) => {
      const sanitized = (str || '').replace(/"/g, '""');
      if (/^[=+\-@|\t\r]/.test(sanitized)) {
        return `'${sanitized}`;
      }
      return sanitized;
    };

    const rows = validVouchers.map((v) => {
      const debitLedger = mapCategoryToDebitLedger(v.category_name);
      const creditLedger = mapPaymentToCreditLedger(v.payment_method, v.branch_code);
      const costCentre = `Showroom ${v.branch_code || 'ASI'}`;
      const payee = sanitizeCsvCell(v.recipient_name || '');
      const billRef = sanitizeCsvCell(v.bill_number || '');
      const rawRemarks = v.remarks ? ` - ${v.remarks}` : '';
      const billInfo = v.bill_number ? ` (Bill Ref: ${v.bill_number})` : '';
      const formattedNarration = sanitizeCsvCell(`Being payment of INR ${v.total_amount} made to ${v.recipient_name} for ${v.category_name}${billInfo}${rawRemarks}`);
      const formattedDate = formatTallyDate(v.payment_date);

      return [
        `"${formattedDate}"`,
        `"Payment"`,
        `"${v.voucher_number}"`,
        `"${debitLedger}"`,
        v.total_amount,
        `"${creditLedger}"`,
        v.total_amount,
        `"${costCentre}"`,
        `"${payee}"`,
        `"${billRef}"`,
        `"${v.payment_method === 'Physical_Cash' ? 'Physical Cash' : 'Online UPI'}"`,
        `"${formattedNarration}"`,
      ].join(',');
    });

    return 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  }

  async checkDuplicateBill(
    branchId: string,
    recipientName: string,
    billNumber: string,
    excludeVoucherNumber?: string
  ): Promise<ExpenseVoucher | null> {
    if (!billNumber || !billNumber.trim() || !recipientName || !recipientName.trim()) return null;
    const cleanBill = billNumber.trim().toLowerCase();
    const cleanRecipient = recipientName.trim().toLowerCase();

    try {
      let query = supabase
        .from('expense_vouchers')
        .select('*')
        .neq('status', 'Voided');

      if (branchId && branchId !== 'ALL') {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        const match = data.find(
          (v) =>
            v.voucher_number !== excludeVoucherNumber &&
            v.bill_number?.trim().toLowerCase() === cleanBill &&
            v.recipient_name?.trim().toLowerCase() === cleanRecipient
        );
        if (match) return match;
      }
    } catch (e) {
      console.warn('Duplicate check local fallback', e);
    }
    return null;
  }

  async generateNextVoucherNumber(branchCodeOrId?: string | null): Promise<string> {
    const code = normalizeBranchCode(branchCodeOrId || 'ASI');
    let maxNum = 0;

    const processVoucherNumber = (vNum?: string | null) => {
      if (!vNum) return;
      const clean = vNum.trim();
      const codePrefixRegex = new RegExp(`^(?:VOC-)?${code}[-_]?(?:\\d{4}[-_])?`, 'i');
      if (codePrefixRegex.test(clean) || clean.toUpperCase().includes(code)) {
        const match = clean.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    };

    try {
      // 1. Query Supabase
      const { data } = await supabase
        .from('expense_vouchers')
        .select('voucher_number, branch_code, branch_id')
        .or(`branch_code.eq.${code},branch_id.eq.Aellp-${code},branch_id.eq.${code}`);

      if (data && data.length > 0) {
        data.forEach((v) => processVoucherNumber(v.voucher_number));
      }
    } catch {
      // Supabase offline / fallback
    }

    // 2. Query cached store vouchers
    try {
      const storeVouchers = useVoucherStore.getState().vouchers;
      const relevantKeys = [code, `Aellp-${code}`, 'ALL'];
      relevantKeys.forEach((k) => {
        const list = storeVouchers[k];
        if (Array.isArray(list)) {
          list.forEach((v) => {
            if (
              normalizeBranchCode(v.branch_code) === code ||
              normalizeBranchCode(v.branch_id) === code
            ) {
              processVoucherNumber(v.voucher_number);
            }
          });
        }
      });
    } catch {
      // Ignore
    }

    // 3. Query localStorage
    try {
      const localKeys = [`asopalav_vouchers_${code}`, `asopalav_vouchers_Aellp-${code}`, 'asopalav_vouchers_ALL'];
      localKeys.forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach((v: any) => {
              if (
                normalizeBranchCode(v.branch_code) === code ||
                normalizeBranchCode(v.branch_id) === code
              ) {
                processVoucherNumber(v.voucher_number);
              }
            });
          }
        }
      });
    } catch {
      // Ignore
    }

    const nextNum = maxNum > 0 ? maxNum + 1 : 1;
    return String(nextNum).padStart(5, '0');
  }

  async generateNextAdvanceReceiptNumber(branchCodeOrId?: string | null): Promise<string> {
    const code = normalizeBranchCode(branchCodeOrId || 'ASI');
    let maxNum = 0;

    const processReceiptNumber = (rNum?: string | null) => {
      if (!rNum) return;
      const clean = rNum.trim();
      if (clean.toUpperCase().includes(code)) {
        const match = clean.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    };

    try {
      const { data } = await supabase
        .from('staff_advances')
        .select('receipt_number, branch_code, branch_id')
        .or(`branch_code.eq.${code},branch_id.eq.Aellp-${code},branch_id.eq.${code}`);

      if (data && data.length > 0) {
        data.forEach((a) => processReceiptNumber(a.receipt_number));
      }
    } catch {
      // Fallback
    }

    try {
      const localKeys = [`asopalav_advances_${code}`, `asopalav_advances_Aellp-${code}`, 'asopalav_advances_ALL'];
      localKeys.forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach((a: any) => {
              if (
                normalizeBranchCode(a.branch_code) === code ||
                normalizeBranchCode(a.branch_id) === code
              ) {
                processReceiptNumber(a.receipt_number);
              }
            });
          }
        }
      });
    } catch {
      // Ignore
    }

    const nextNum = maxNum > 0 ? maxNum + 1 : 1;
    return `${code}-ADV-${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Resiliently insert an expense voucher into Supabase.
   * If the Supabase schema lacks newly introduced extended columns, it auto-retries with core columns.
   */
  private async insertExpenseVoucherRecord(record: Record<string, any>): Promise<void> {
    const payload = { ...record };
    const { error } = await supabase.from('expense_vouchers').insert([payload]);
    if (!error) return;

    // Check if error is due to an unmigrated column in Supabase schema cache
    if (error.message && error.message.includes('column of') && error.message.includes('expense_vouchers')) {
      console.warn('[Supabase Schema Adaptor] Retrying voucher insert with sanitized core fields:', error.message);
      const corePayload: Record<string, any> = {
        id: record.id,
        voucher_number: record.voucher_number,
        branch_id: record.branch_id,
        branch_code: record.branch_code,
        payment_date: record.payment_date,
        payment_type: record.payment_type,
        payment_method: record.payment_method,
        bank_utr_number: record.bank_utr_number || null,
        total_amount: record.total_amount,
        recipient_name: record.recipient_name,
        category_name: record.category_name,
        department_name: record.department_name || null,
        department_code: record.department_code || null,
        courier_partner_name: record.courier_partner_name || null,
        bill_number: record.bill_number || null,
        bill_photo_urls: record.bill_photo_urls || [],
        remarks: record.remarks,
        created_by_name: record.created_by_name,
        status: record.status || 'Approved',
        created_at: record.created_at || new Date().toISOString(),
      };
      const { error: retryError } = await supabase.from('expense_vouchers').insert([corePayload]);
      if (retryError) {
        if (retryError.code === '23505' || retryError.message?.includes('duplicate key') || retryError.message?.includes('voucher_number')) {
          throw new Error(`Duplicate Voucher Number: Voucher #${record.voucher_number} already exists in the system. Please enter the next sequential number from your physical bill book.`);
        }
        console.error('Sanitized voucher insert error:', retryError);
        throw new Error(retryError.message);
      }
      return;
    }

    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('voucher_number')) {
      throw new Error(`Duplicate Voucher Number: Voucher #${record.voucher_number} already exists in the system. Please enter the next sequential number from your physical bill book.`);
    }

    console.error('Voucher insert error:', error);
    throw new Error(error.message);
  }

  async createVoucherWithLedger(params: CreateVoucherParams): Promise<ExpenseVoucher> {
    const { voucher, splits, userName, userRole } = params;

    // Guard: Reject zero or negative amounts
    if (!voucher.total_amount || voucher.total_amount <= 0) {
      throw new Error('Voucher amount must be a positive number greater than zero.');
    }
    // Guard: Validate splits if present
    if (splits && splits.length > 0) {
      const splitTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      if (Math.abs(splitTotal - voucher.total_amount) > 0.01) {
        throw new Error(`Sum of staff splits (₹${splitTotal.toFixed(2)}) does not match voucher total amount (₹${voucher.total_amount.toFixed(2)}).`);
      }
      if (splits.some((s) => Number(s.amount) <= 0)) {
        throw new Error('All staff split amounts must be greater than zero.');
      }
    }

    // 1. Period Lock Guard (Super Admin / Admin can bypass)
    const isLocked = await this.checkIsPeriodLocked(voucher.payment_date);
    if (isLocked && !isPrivilegedAdminRole(userRole)) {
      throw new Error(`Cannot record voucher: Accounting Period for date ${voucher.payment_date} is LOCKED.`);
    }

    const isHighValue = voucher.total_amount > 10000;
    const requiresSuperAdminApproval = voucher.total_amount > 50000;

    // 2. Prepare Database Voucher Record (Ensuring category existence and schema compliance)
    try {
      await supabase.from('expense_categories').upsert([
        { category_name: voucher.category_name, color_theme: 'Vanilla', is_active: true }
      ]);
    } catch (e) {
      console.warn('Category ensure fallback:', e);
    }

    const voucherDbRecord = {
      id: crypto.randomUUID(),
      voucher_number: voucher.voucher_number,
      branch_id: voucher.branch_id,
      branch_code: voucher.branch_code,
      payment_date: voucher.payment_date,
      payment_type: voucher.payment_type,
      payment_method: voucher.payment_method,
      bank_utr_number: voucher.bank_utr_number || null,
      total_amount: voucher.total_amount,
      recipient_name: voucher.recipient_name,
      category_name: voucher.category_name,
      department_name: voucher.department_name || null,
      department_code: voucher.department_code || null,
      courier_partner_name: (voucher as any).courier_company || (voucher as any).courier_partner_name || null,
      requested_by_staff_code: voucher.requested_by_staff_code || null,
      requested_by_staff_name: voucher.requested_by_staff_name || null,
      vendor_splits: voucher.vendor_splits || null,
      bill_number: voucher.bill_number || null,
      remarks: voucher.remarks,
      bill_photo_urls: voucher.bill_photo_urls || [],
      created_by_name: voucher.created_by_name || userName,
      status: (requiresSuperAdminApproval ? 'Pending_Approval' : 'Approved') as ExpenseVoucher['status'],
      created_at: new Date().toISOString(),
    };

    const fullVoucher: ExpenseVoucher = {
      ...voucherDbRecord,
      is_high_value: isHighValue,
    };

    // 2A. Primary Database Atomic RPC (Zero Race Conditions, Single Round-Trip)
    try {
      const allowNegative = useOverrideStore.getState().isNegativeWalletAllowed();
      const { data: atomicData, error: rpcError } = await supabase.rpc('create_expense_voucher_atomic', {
        p_voucher: voucherDbRecord,
        p_splits: splits && splits.length > 0 ? splits : [],
        p_user_name: userName,
        p_user_role: userRole,
        p_allow_negative: allowNegative,
      });

      if (!rpcError && atomicData) {
        const atomicVoucher: ExpenseVoucher = {
          ...(atomicData as ExpenseVoucher),
          is_high_value: isHighValue,
        };

        useVoucherStore.getState().addVoucherLocally(atomicVoucher);
        useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'INSERT', voucher: atomicVoucher } }));
          window.dispatchEvent(new Event('asopalav:wallet-updated'));
        }
        return atomicVoucher;
      }

      if (rpcError) {
        // If it's a specific constraint violation, bubble it up
        if (rpcError.message && !rpcError.message.includes('function') && !rpcError.message.includes('not exist') && !rpcError.message.includes('PGRST202')) {
          throw new Error(rpcError.message);
        }
      }
    } catch (rpcEx: any) {
      if (rpcEx?.message && !rpcEx.message.includes('function') && !rpcEx.message.includes('not exist') && !rpcEx.message.includes('PGRST202')) {
        throw rpcEx;
      }
    }

    // 3. If Amount > 50,000: Mark Pending Approval (No immediate wallet deduction until approved)
    if (requiresSuperAdminApproval) {
      await this.insertExpenseVoucherRecord(voucherDbRecord);

      if (splits && splits.length > 0) {
        for (const s of splits) {
          if (s.categoryName) {
            await supabase.from('expense_categories').upsert([
              { category_name: s.categoryName, color_theme: 'Vanilla', is_active: true }
            ]);
          }
        }
        const splitRecords = splits.map((s) => ({
          id: crypto.randomUUID(),
          voucher_number: voucher.voucher_number,
          branch_id: voucher.branch_id,
          branch_code: voucher.branch_code,
          staff_code: s.staffCode,
          staff_name: s.staffName,
          department_name: s.departmentName,
          category_name: s.categoryName,
          amount: s.amount,
          created_at: new Date().toISOString(),
        }));

        const { error: splitError } = await supabase.from('voucher_splits').insert(splitRecords);
        if (splitError) {
          console.error('Splits insert error:', splitError);
          throw new Error(splitError.message);
        }
      }

      // Broadcast approval request notification to Super Admin
      useNotificationStore.getState().addNotification({
        title: 'Voucher Requires Super Admin Approval',
        message: `High-value voucher ${voucher.voucher_number} of ₹${voucher.total_amount.toLocaleString('en-IN')} to ${voucher.recipient_name} requires Super Admin / Owner approval before payout.`,
        type: 'approval_request',
        target_roles: ['Super_Admin'],
        branch_id: voucher.branch_id,
        reference_id: voucher.voucher_number,
        amount: voucher.total_amount,
      });

      await logSecurityEvent({
        userName,
        userRole,
        actionType: 'Create_Voucher',
        targetEntity: 'expense_vouchers',
        targetIdentifier: voucher.voucher_number,
        eventDescription: `Created voucher ${voucher.voucher_number} (₹${voucher.total_amount}) - Queued for Super Admin approval (> ₹50,000 threshold)`,
        justification: voucher.remarks,
      });

      useVoucherStore.getState().addVoucherLocally(fullVoucher);
      useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'INSERT', voucher: fullVoucher } }));
        window.dispatchEvent(new Event('asopalav:wallet-updated'));
      }

      return fullVoucher;
    }

    // 4. Auto-Approved Case (₹0 - ₹50,000): Verify Liquidity First
    const currentWallet = await this.getBranchWallet(voucher.branch_id);
    const allowNegative = useOverrideStore.getState().isNegativeWalletAllowed();

    if (voucher.payment_method === 'Physical_Cash') {
      if (currentWallet.cash_balance < voucher.total_amount && !allowNegative) {
        throw new Error(
          `Insufficient Cash Drawer Balance: Available till balance is ₹${currentWallet.cash_balance.toLocaleString('en-IN')}, but voucher requires ₹${voucher.total_amount.toLocaleString('en-IN')}. In real-world retail accounting, payments cannot proceed without cash in till. Please top up cash float from showroom safe before disbursing.`
        );
      }
    } else {
      if (currentWallet.upi_balance < voucher.total_amount && !allowNegative) {
        throw new Error(
          `Insufficient Online/UPI Wallet Balance: Available bank balance is ₹${currentWallet.upi_balance.toLocaleString('en-IN')}, but voucher requires ₹${voucher.total_amount.toLocaleString('en-IN')}. Please top up account balance before disbursing.`
        );
      }
    }

    // 5. Insert Voucher into Database FIRST (Guarantees zero double-deductions if voucher creation fails)
    await this.insertExpenseVoucherRecord(voucherDbRecord);

    // 6. Deduct from Branch Wallet
    let newRunningBalance = 0;
    if (voucher.payment_method === 'Physical_Cash') {
      currentWallet.cash_balance = currentWallet.cash_balance - voucher.total_amount;
      newRunningBalance = currentWallet.cash_balance;
    } else {
      currentWallet.upi_balance = currentWallet.upi_balance - voucher.total_amount;
      newRunningBalance = currentWallet.upi_balance;
    }
    await this.updateBranchWallet(currentWallet);

    const ledgerRemarks = allowNegative && ((voucher.payment_method === 'Physical_Cash' && newRunningBalance < 0) || (voucher.payment_method !== 'Physical_Cash' && newRunningBalance < 0))
      ? `${voucher.remarks ? `${voucher.remarks} • ` : ''}[SuperAdmin Override: Emergency Till Overdraft]`
      : voucher.remarks;

    // 7. Record Immutable Wallet Ledger
    await this.appendLedgerEntry({
      branch_id: voucher.branch_id,
      branch_code: voucher.branch_code,
      wallet_type: voucher.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
      transaction_type: 'Expense_Voucher',
      reference_number: voucher.voucher_number,
      debit_amount: voucher.total_amount,
      credit_amount: 0,
      running_balance: newRunningBalance,
      remarks: ledgerRemarks,
      cashier_name: userName,
    });

    // 8. Insert Multi-Staff Splits if applicable
    if (splits && splits.length > 0) {
      for (const s of splits) {
        if (s.categoryName) {
          await supabase.from('expense_categories').upsert([
            { category_name: s.categoryName, color_theme: 'Vanilla', is_active: true }
          ]);
        }
      }
      const splitRecords = splits.map((s) => ({
        id: crypto.randomUUID(),
        voucher_number: voucher.voucher_number,
        branch_id: voucher.branch_id,
        branch_code: voucher.branch_code,
        staff_code: s.staffCode,
        staff_name: s.staffName,
        department_name: s.departmentName,
        category_name: s.categoryName,
        amount: s.amount,
        created_at: new Date().toISOString(),
      }));

      const { error: splitError } = await supabase.from('voucher_splits').insert(splitRecords);
      if (splitError) {
        console.error('Splits insert error:', splitError);
        throw new Error(splitError.message);
      }
    }

    // 8. If ₹10,001 to ₹50,000: Broadcast notification to Manager, Admin, Super Admin, Accountant
    if (voucher.total_amount > 10000 && voucher.total_amount <= 50000) {
      useNotificationStore.getState().addNotification({
        title: 'High-Value Voucher Created',
        message: `Voucher ${voucher.voucher_number} of ₹${voucher.total_amount.toLocaleString('en-IN')} (${voucher.payment_method.replace('_', ' ')}) paid to ${voucher.recipient_name} for ${voucher.category_name}.`,
        type: 'high_value_voucher',
        target_roles: ['Store_Manager', 'Super_Admin', 'Cashier', 'Auditor'],
        branch_id: voucher.branch_id,
        reference_id: voucher.voucher_number,
        amount: voucher.total_amount,
      });
    }

    // 9. Security Audit Log
    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: voucher.voucher_number,
      eventDescription: `Paid ${voucher.payment_method.replace('_', ' ')} expense of ₹${voucher.total_amount} to ${voucher.recipient_name} for ${voucher.category_name}${isHighValue ? ' [HIGH VALUE]' : ''}`,
      justification: voucher.remarks,
    });

    useVoucherStore.getState().addVoucherLocally(fullVoucher);
    useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'INSERT', voucher: fullVoucher } }));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return fullVoucher;
  }

  async approveVoucher(
    voucher: ExpenseVoucher,
    approverName: string,
    approverRole: string
  ): Promise<ExpenseVoucher> {
    // H-8 Security: Re-fetch the approver's TRUE role from Supabase DB.
    // The client-passed approverRole cannot be trusted — localStorage role_code is spoofable.
    // We also re-fetch the voucher's live status so we don't approve an already-voided voucher.
    let verifiedApproverRole = approverRole;
    try {
      // Look up the approver's live role from the DB using their username (stored in approverName or from authStore)
      const { useAuthStore } = await import('@/store/authStore');
      const authUser = useAuthStore.getState().user;
      if (authUser?.id) {
        const { data: dbUser } = await supabase
          .from('app_users')
          .select('role_code, is_active')
          .eq('id', authUser.id)
          .maybeSingle();
        if (dbUser?.role_code) {
          verifiedApproverRole = dbUser.role_code;
          if (!dbUser.is_active) {
            throw new Error('Your account has been deactivated. Cannot approve voucher.');
          }
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('deactivated')) throw e;
      console.warn('[approveVoucher] Could not verify approver role from DB, using session role:', e);
    }

    if (!isPrivilegedAdminRole(verifiedApproverRole) && verifiedApproverRole !== 'Store_Manager') {
      throw new Error('Only Super Admin, Admin, or Store Manager can approve high-value vouchers.');
    }

    // 1. Deduct from Branch Wallet
    const currentWallet = await this.getBranchWallet(voucher.branch_id);
    let newRunningBalance = 0;
    if (voucher.payment_method === 'Physical_Cash') {
      if (currentWallet.cash_balance < voucher.total_amount) {
        throw new Error(`Insufficient Cash Drawer Balance: ₹${currentWallet.cash_balance.toLocaleString('en-IN')} available.`);
      }
      currentWallet.cash_balance -= voucher.total_amount;
      newRunningBalance = currentWallet.cash_balance;
    } else {
      if (currentWallet.upi_balance < voucher.total_amount) {
        throw new Error(`Insufficient UPI Balance: ₹${currentWallet.upi_balance.toLocaleString('en-IN')} available.`);
      }
      currentWallet.upi_balance -= voucher.total_amount;
      newRunningBalance = currentWallet.upi_balance;
    }
    await this.updateBranchWallet(currentWallet);

    // 2. Append Ledger Entry
    await this.appendLedgerEntry({
      branch_id: voucher.branch_id,
      branch_code: voucher.branch_code,
      wallet_type: voucher.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
      transaction_type: 'Expense_Voucher',
      reference_number: voucher.voucher_number,
      debit_amount: voucher.total_amount,
      credit_amount: 0,
      running_balance: newRunningBalance,
      remarks: `APPROVED (>₹50,000): ${voucher.remarks}`,
      cashier_name: approverName,
    });

    // 3. Update Voucher Status
    const updatedVoucher: ExpenseVoucher = {
      ...voucher,
      status: 'Approved',
      approved_by_name: approverName,
      approved_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('expense_vouchers')
        .update({
          status: 'Approved',
          approved_by_name: approverName,
          approved_at: updatedVoucher.approved_at,
        })
        .eq('voucher_number', voucher.voucher_number);
      if (error) throw error;
    } catch (e) {
      console.warn('Approve voucher fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'update_voucher',
        table: 'expense_vouchers',
        action: 'update',
        payload: {
          status: 'Approved',
          approved_by_name: approverName,
          approved_at: updatedVoucher.approved_at,
        },
        matchField: 'voucher_number',
        matchValue: voucher.voucher_number,
        description: `Approve voucher ${voucher.voucher_number}`,
      });
    }

    // 4. Log audit
    await logSecurityEvent({
      userName: approverName,
      userRole: approverRole,
      actionType: 'Update_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: voucher.voucher_number,
      eventDescription: `${approverRole} approved high-value voucher ${voucher.voucher_number} of ₹${voucher.total_amount}`,
      justification: 'High-value threshold authorization (> ₹50,000)',
    });

    useVoucherStore.getState().updateVoucherLocally(updatedVoucher);
    useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'UPDATE', voucher: updatedVoucher } }));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return updatedVoucher;
  }

  /**
   * Fast Multi-Bill Batch Voucher Creation (Festival / EOM Rush Mode)
   * Creates multiple individual expense vouchers in a single counter transaction with atomic drawer deduction
   */
  async createBatchVouchersWithLedger(params: {
    branch_id: string;
    branch_code: string;
    payment_date: string;
    payment_method: 'Physical_Cash' | 'Online_UPI';
    items: {
      voucher_number: string;
      recipient_name: string;
      category_name: string;
      department_name?: string | null;
      department_code?: string | null;
      bill_number?: string | null;
      amount: number;
      remarks: string;
    }[];
    userName: string;
    userRole: string;
  }): Promise<{ createdVouchers: ExpenseVoucher[]; totalBatchAmount: number; newCashBalance: number }> {
    const { branch_id, branch_code, payment_date, payment_method, items, userName, userRole } = params;

    if (!items || items.length === 0) {
      throw new Error('Batch must contain at least one voucher entry.');
    }

    // 1. Validate All Entries in Batch
    let totalBatchAmount = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.amount || item.amount <= 0) {
        throw new Error(`Row #${i + 1} amount must be greater than zero.`);
      }
      if (!item.voucher_number || !item.voucher_number.trim()) {
        throw new Error(`Row #${i + 1} voucher number is required.`);
      }
      if (!item.recipient_name || !item.recipient_name.trim()) {
        throw new Error(`Row #${i + 1} payee/vendor name is required.`);
      }
      if (!item.category_name || !item.category_name.trim()) {
        throw new Error(`Row #${i + 1} category is required.`);
      }
      totalBatchAmount += item.amount;
    }

    // 2. Period Lock Check
    const isLocked = await this.checkIsPeriodLocked(payment_date);
    if (isLocked && !isPrivilegedAdminRole(userRole)) {
      throw new Error(`Cannot record batch: Accounting period for date ${payment_date} is LOCKED.`);
    }

    // 3. Check Wallet Liquidity & Deduct Consolidated Batch Amount
    // M-10 Security: Apply ₹50,000 approval gate to batch mode.
    // Individual items and batch total are both checked.
    const hasHighValueItem = items.some((i) => i.amount > 50000);
    const batchTotalExceedsGate = totalBatchAmount > 50000;
    if ((hasHighValueItem || batchTotalExceedsGate) && !isPrivilegedAdminRole(userRole)) {
      const reason = hasHighValueItem
        ? `One or more batch items exceed ₹50,000. High-value batch payments require Super Admin or Admin approval.`
        : `Batch total (₹${totalBatchAmount.toLocaleString('en-IN')}) exceeds ₹50,000. Batch requires Super Admin or Admin approval.`;
      throw new Error(reason);
    }

    const currentWallet = await this.getBranchWallet(branch_id);
    const allowNegative = useOverrideStore.getState().isNegativeWalletAllowed();
    let newRunningBalance = 0;

    if (payment_method === 'Physical_Cash') {
      if (currentWallet.cash_balance < totalBatchAmount && !allowNegative) {
        throw new Error(
          `Insufficient Cash Drawer Balance for Batch: Available ₹${currentWallet.cash_balance.toLocaleString('en-IN')}, required batch total ₹${totalBatchAmount.toLocaleString('en-IN')}. Please top up cash float.`
        );
      }
      currentWallet.cash_balance -= totalBatchAmount;
      newRunningBalance = currentWallet.cash_balance;
    } else {
      if (currentWallet.upi_balance < totalBatchAmount && !allowNegative) {
        throw new Error(
          `Insufficient UPI Balance for Batch: Available ₹${currentWallet.upi_balance.toLocaleString('en-IN')}, required batch total ₹${totalBatchAmount.toLocaleString('en-IN')}.`
        );
      }
      currentWallet.upi_balance -= totalBatchAmount;
      newRunningBalance = currentWallet.upi_balance;
    }
    await this.updateBranchWallet(currentWallet);

    // 4. Append Single Consolidated Ledger Entry
    const voucherNumsList = items.map((i) => i.voucher_number).join(', ');
    await this.appendLedgerEntry({
      branch_id,
      branch_code,
      wallet_type: payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
      transaction_type: 'Expense_Voucher',
      reference_number: `BATCH-${items[0].voucher_number}-${items[items.length - 1].voucher_number}`,
      debit_amount: totalBatchAmount,
      credit_amount: 0,
      running_balance: newRunningBalance,
      remarks: `Rush Mode Batch (${items.length} bills: ${voucherNumsList})`,
      cashier_name: userName,
    });

    // 5. Insert All Individual Voucher Records
    const createdVouchers: ExpenseVoucher[] = [];
    for (const item of items) {
      try {
        await supabase.from('expense_categories').upsert([
          { category_name: item.category_name, color_theme: 'Vanilla', is_active: true }
        ]);
      } catch (e) {
        // Ignore category upsert errors
      }

      const vRecord: ExpenseVoucher = {
        id: crypto.randomUUID(),
        voucher_number: item.voucher_number,
        branch_id,
        branch_code,
        payment_date,
        payment_type: 'Shop_Vendor',
        payment_method,
        bank_utr_number: null,
        total_amount: item.amount,
        recipient_name: item.recipient_name,
        category_name: item.category_name,
        department_name: item.department_name || null,
        department_code: item.department_code || null,
        courier_partner_name: null,
        requested_by_staff_code: null,
        requested_by_staff_name: null,
        vendor_splits: null,
        remarks: item.remarks || '',
        bill_number: item.bill_number || null,
        bill_photo_urls: [],
        created_by_name: userName,
        is_high_value: item.amount > 10000,
        status: 'Approved',
        created_at: new Date().toISOString(),
      };

      await this.insertExpenseVoucherRecord(vRecord);
      useVoucherStore.getState().addVoucherLocally(vRecord);
      createdVouchers.push(vRecord);
    }

    // 6. Log Security Event
    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: `BATCH-${items.length}-BILLS`,
      eventDescription: `Created ${items.length} batch vouchers totaling ₹${totalBatchAmount} in Rush Mode`,
      justification: 'High-speed counter multi-bill entry',
    });

    useVoucherStore.getState().invalidateVouchers(branch_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'BATCH_INSERT', count: items.length } }));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return { createdVouchers, totalBatchAmount, newCashBalance: newRunningBalance };
  }

  async voidVoucher(voucher: ExpenseVoucher, reason: string, userName: string, userRole: string) {
    // H-4 Security: Re-fetch the voucher's TRUE status from DB before refunding wallet.
    // The client-passed voucher.status cannot be trusted — a buggy/malicious client could set it to 'Approved'
    // for a Pending_Approval voucher to trigger an unearned wallet credit.
    let verifiedStatus: ExpenseVoucher['status'] = voucher.status;
    try {
      const { data: liveVoucher } = await supabase
        .from('expense_vouchers')
        .select('status, payment_method, total_amount, branch_id')
        .eq('voucher_number', voucher.voucher_number)
        .maybeSingle();
      if (liveVoucher?.status) {
        verifiedStatus = liveVoucher.status as ExpenseVoucher['status'];
      }
    } catch (e) {
      console.warn('[voidVoucher] Could not re-fetch voucher status from DB, using client-provided status:', e);
    }

    // 1. Update status
    try {
      const { error } = await supabase
        .from('expense_vouchers')
        .update({
          status: 'Voided',
          void_reason: reason,
          voided_by_name: userName,
        })
        .eq('voucher_number', voucher.voucher_number);
      if (error) throw error;
    } catch (e) {
      console.warn('Void status fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'void_voucher',
        table: 'expense_vouchers',
        action: 'update',
        payload: {
          status: 'Voided',
          void_reason: reason,
          voided_by_name: userName,
        },
        matchField: 'voucher_number',
        matchValue: voucher.voucher_number,
        description: `Void voucher ${voucher.voucher_number}`,
      });
    }

    // 2. Refund to Branch Wallet (ONLY if DB-verified status is 'Approved' and funds were deducted)
    if (verifiedStatus === 'Approved') {
      const currentWallet = await this.getBranchWallet(voucher.branch_id);
      let newBalance = 0;
      if (voucher.payment_method === 'Physical_Cash') {
        currentWallet.cash_balance += voucher.total_amount;
        newBalance = currentWallet.cash_balance;
      } else {
        currentWallet.upi_balance += voucher.total_amount;
        newBalance = currentWallet.upi_balance;
      }
      await this.updateBranchWallet(currentWallet);

      // 3. Ledger Adjustment
      await this.appendLedgerEntry({
        branch_id: voucher.branch_id,
        branch_code: voucher.branch_code,
        wallet_type: voucher.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
        transaction_type: 'Adjustment',
        reference_number: `VOID-${voucher.voucher_number}`,
        debit_amount: 0,
        credit_amount: voucher.total_amount,
        running_balance: newBalance,
        remarks: `VOID REVERSAL: ${reason}`,
        cashier_name: userName,
      });
    }

    // 4. Audit Log
    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Void_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: voucher.voucher_number,
      eventDescription: `Voided voucher ${voucher.voucher_number} (₹${voucher.total_amount}). Funds refunded to ${voucher.payment_method} wallet.`,
      justification: reason,
    });

    const voidedVoucher: ExpenseVoucher = {
      ...voucher,
      status: 'Voided',
      void_reason: reason,
      voided_by_name: userName,
    };
    useVoucherStore.getState().updateVoucherLocally(voidedVoucher);
    useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'UPDATE', voucher: voidedVoucher } }));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }
  }

  async updateVoucher(
    voucherNumber: string,
    updates: Partial<ExpenseVoucher>,
    userName: string,
    userRole: string,
    reason: string
  ) {
    const isPrivileged = isPrivilegedAdminRole(userRole);
    const ALLOWED_UPDATE_FIELDS: (keyof ExpenseVoucher)[] = [
      'payment_date',
      'payment_type',
      'payment_method',
      'bank_utr_number',
      'recipient_name',
      'category_name',
      'department_name',
      'department_code',
      'courier_partner_name',
      'requested_by_staff_code',
      'requested_by_staff_name',
      'bill_number',
      'bill_photo_urls',
      'remarks',
      'vendor_splits',
    ];

    if (isPrivileged) {
      ALLOWED_UPDATE_FIELDS.push('total_amount');
    }

    const sanitizedUpdates: Record<string, any> = {};
    const blockedFields: string[] = [];

    for (const key of Object.keys(updates) as (keyof ExpenseVoucher)[]) {
      if (ALLOWED_UPDATE_FIELDS.includes(key)) {
        sanitizedUpdates[key] = updates[key];
      } else {
        blockedFields.push(key);
      }
    }

    if (blockedFields.length > 0) {
      console.warn(`[updateVoucher] Blocked attempt to update restricted fields: ${blockedFields.join(', ')}.`);
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      throw new Error('No valid fields to update.');
    }

    // 1. Fetch original voucher from Supabase or memory
    let existingVoucher: ExpenseVoucher | null = null;
    try {
      const { data } = await supabase
        .from('expense_vouchers')
        .select('*')
        .eq('voucher_number', voucherNumber)
        .maybeSingle();
      if (data) {
        existingVoucher = data;
      }
    } catch (e) {
      console.warn('Failed to query existing voucher from DB:', e);
    }

    if (!existingVoucher) {
      const storeVouchers = useVoucherStore.getState().vouchers;
      for (const list of Object.values(storeVouchers)) {
        const found = list.find((v) => v.voucher_number === voucherNumber);
        if (found) {
          existingVoucher = found;
          break;
        }
      }
    }

    // 2. Update Voucher in Database
    try {
      const { error } = await supabase
        .from('expense_vouchers')
        .update(sanitizedUpdates)
        .eq('voucher_number', voucherNumber);
      if (error) throw error;
    } catch (e) {
      console.warn('Update voucher DB fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'update_voucher',
        table: 'expense_vouchers',
        action: 'update',
        payload: sanitizedUpdates,
        matchField: 'voucher_number',
        matchValue: voucherNumber,
        description: `Update voucher ${voucherNumber}`,
      });
    }

    // 3. Double-Entry Ledger & Wallet Balance Reconciliation
    if (existingVoucher) {
      const oldPaymentMethod = existingVoucher.payment_method || 'Physical_Cash';
      const newPaymentMethod = (sanitizedUpdates.payment_method || oldPaymentMethod) as 'Physical_Cash' | 'Online_UPI';
      const oldWalletType: 'Cash' | 'UPI' = oldPaymentMethod === 'Physical_Cash' ? 'Cash' : 'UPI';
      const newWalletType: 'Cash' | 'UPI' = newPaymentMethod === 'Physical_Cash' ? 'Cash' : 'UPI';
      const oldAmount = Number(existingVoucher.total_amount) || 0;
      const newAmount = sanitizedUpdates.total_amount !== undefined ? Number(sanitizedUpdates.total_amount) : oldAmount;
      const branchId = existingVoucher.branch_id || 'Aellp-ASI';
      const categoryName = sanitizedUpdates.category_name || existingVoucher.category_name;
      const recipientName = sanitizedUpdates.recipient_name || existingVoucher.recipient_name;
      const remarks = sanitizedUpdates.remarks !== undefined ? sanitizedUpdates.remarks : existingVoucher.remarks;
      const formattedRemarks = remarks ? `Expense: ${categoryName} - ${recipientName} (${remarks})` : `Expense: ${categoryName} - ${recipientName}`;

      const isPaymentMethodChanged = oldWalletType !== newWalletType;
      const isAmountChanged = oldAmount !== newAmount;

      if (isPaymentMethodChanged || isAmountChanged || sanitizedUpdates.category_name || sanitizedUpdates.recipient_name || sanitizedUpdates.remarks !== undefined) {
        // A. Update Supabase wallet_ledger record
        try {
          const { error: ledgerUpdateError } = await supabase
            .from('wallet_ledger')
            .update({
              wallet_type: newWalletType,
              debit_amount: newAmount,
              remarks: formattedRemarks,
            })
            .eq('reference_number', voucherNumber);
          if (ledgerUpdateError) console.warn('Supabase ledger update error:', ledgerUpdateError);
        } catch (e) {
          console.warn('Ledger update DB error:', e);
        }

        // B. Update localStorage ledger caches
        const canonicalId = normalizeBranchId(branchId);
        const code = normalizeBranchCode(branchId);
        const keysToCheck = [
          `asopalav_ledger_${canonicalId}`,
          `asopalav_ledger_${code}`,
          `asopalav_ledger_${branchId}`,
          'asopalav_ledger_ALL',
          'asopalav_ledger_Aellp-ASI',
          'asopalav_ledger_ASI',
        ];

        keysToCheck.forEach((key) => {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const updatedList = list.map((item: any) => {
                  if (item.reference_number === voucherNumber) {
                    return {
                      ...item,
                      wallet_type: newWalletType,
                      debit_amount: newAmount,
                      remarks: formattedRemarks,
                    };
                  }
                  return item;
                });
                localStorage.setItem(key, JSON.stringify(updatedList.slice(0, 200)));
              }
            } catch {
              // ignore
            }
          }
        });

        // C. Recalculate branch wallet balances with zero-rupee tolerance
        await this.recalculateBranchWalletFromLedger(branchId);
        useBranchStore.getState().fetchBranchesAndWallets(true);
      }
    }

    // 4. Update Voucher Store Locally & Dispatch Events
    const updatedVoucher = {
      ...(existingVoucher || {}),
      ...sanitizedUpdates,
      voucher_number: voucherNumber,
    } as ExpenseVoucher;

    useVoucherStore.getState().updateVoucherLocally(updatedVoucher);
    useVoucherStore.getState().invalidateVouchers(existingVoucher?.branch_id);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: voucherNumber,
      eventDescription: `Modified voucher ${voucherNumber}: ${Object.keys(sanitizedUpdates).join(', ')}${blockedFields.length > 0 ? ` [BLOCKED: ${blockedFields.join(', ')}]` : ''}`,
      justification: reason || 'Admin voucher correction',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('asopalav:vouchers-updated', {
          detail: { action: 'UPDATE', voucherNumber, updates: sanitizedUpdates, voucher: updatedVoucher },
        })
      );
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
    }
  }

  async deleteVoucher(
    voucher: ExpenseVoucher,
    userName: string,
    userRole: string,
    reason: string
  ) {
    // 1. If previously approved, refund wallet (Pending_Approval vouchers never deducted funds)
    if (voucher.status === 'Approved') {
      const currentWallet = await this.getBranchWallet(voucher.branch_id);
      let newBalance = 0;
      if (voucher.payment_method === 'Physical_Cash') {
        currentWallet.cash_balance += voucher.total_amount;
        newBalance = currentWallet.cash_balance;
      } else {
        currentWallet.upi_balance += voucher.total_amount;
        newBalance = currentWallet.upi_balance;
      }
      await this.updateBranchWallet(currentWallet);

      await this.appendLedgerEntry({
        branch_id: voucher.branch_id,
        branch_code: voucher.branch_code,
        wallet_type: voucher.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
        transaction_type: 'Adjustment',
        reference_number: `PURGE-${voucher.voucher_number}`,
        debit_amount: 0,
        credit_amount: voucher.total_amount,
        running_balance: newBalance,
        remarks: `SUPERADMIN PURGE: ${reason}`,
        cashier_name: userName,
      });
    }

    // 2. Delete from DB
    try {
      const { error } = await supabase.from('expense_vouchers').delete().eq('voucher_number', voucher.voucher_number);
      if (error) throw error;
    } catch (e) {
      console.warn('Voucher delete DB fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'delete_voucher',
        table: 'expense_vouchers',
        action: 'delete',
        payload: {},
        matchField: 'voucher_number',
        matchValue: voucher.voucher_number,
        description: `Delete voucher ${voucher.voucher_number}`,
      });
    }

    // 3. Security Audit Log
    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Voucher',
      targetEntity: 'expense_vouchers',
      targetIdentifier: voucher.voucher_number,
      eventDescription: `Permanently deleted voucher ${voucher.voucher_number} (₹${voucher.total_amount})`,
      justification: reason || 'Super Admin record purge',
    });

    useVoucherStore.getState().removeVoucherLocally(voucher.voucher_number, voucher.branch_id);
    useVoucherStore.getState().invalidateVouchers(voucher.branch_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:vouchers-updated', { detail: { action: 'DELETE', voucher } }));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }
  }

  // --------------------------------------------------------------------------
  // 4. FLOAT ALLOCATIONS (HEAD OFFICE CASH INJECTIONS)
  // --------------------------------------------------------------------------
  async createFloatTopup(params: FloatTopupParams): Promise<FloatAllocation> {
    if (!params.amount || params.amount <= 0) {
      throw new Error('Float top-up amount must be a positive number greater than zero.');
    }
    const allocNumber = `FLT-${Date.now().toString().slice(-6)}`;
    const recordTimestamp = params.createdAt ? new Date(params.createdAt).toISOString() : new Date().toISOString();
    const fullAllocation: FloatAllocation = {
      id: crypto.randomUUID(),
      allocation_number: allocNumber,
      branch_id: params.branchId,
      branch_code: params.branchCode,
      wallet_type: params.walletType,
      amount: params.amount,
      reference_notes: params.referenceNotes || 'Head Office Imprest Inflow',
      authorized_by_name: params.authorizedByName,
      received_by_name: params.receivedByName,
      status: 'Verified',
      created_at: recordTimestamp,
    };

    // 1. Credit Branch Wallet
    const currentWallet = await this.getBranchWallet(params.branchId);
    let newBalance = 0;
    if (params.walletType === 'Cash') {
      currentWallet.cash_balance += params.amount;
      newBalance = currentWallet.cash_balance;
    } else {
      currentWallet.upi_balance += params.amount;
      newBalance = currentWallet.upi_balance;
    }
    await this.updateBranchWallet(currentWallet);

    // 2. Record Ledger
    await this.appendLedgerEntry({
      branch_id: params.branchId,
      branch_code: params.branchCode,
      wallet_type: params.walletType,
      transaction_type: 'Float_Topup',
      reference_number: allocNumber,
      debit_amount: 0,
      credit_amount: params.amount,
      running_balance: newBalance,
      remarks: params.referenceNotes || 'Head office cash drawer injection',
      cashier_name: params.receivedByName,
      created_at: recordTimestamp,
    });

    // 3. Insert Float Record
    try {
      const { error } = await supabase.from('float_allocations').insert([fullAllocation]);
      if (error) throw error;
    } catch (e) {
      console.warn('Float allocation insert fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'float_topup',
        table: 'float_allocations',
        action: 'insert',
        payload: fullAllocation,
        description: `Float injection ${allocNumber}`,
      });
    }

    // 4. Audit Log
    await logSecurityEvent({
      userName: params.receivedByName,
      userRole: 'Cashier',
      actionType: 'Float_Topup',
      targetEntity: 'float_allocations',
      targetIdentifier: allocNumber,
      eventDescription: `Injected ₹${params.amount} ${params.walletType} Float into Showroom ${params.branchCode}`,
      justification: params.referenceNotes || 'Daily till float replenishment',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return fullAllocation;
  }

  async recordSafeDrop(params: SafeDropParams): Promise<{ dropNumber: string; newCashBalance: number }> {
    if (!params.amount || params.amount <= 0) {
      throw new Error('Safe drop amount must be a positive number greater than zero.');
    }

    // 1. Try atomic PostgreSQL RPC
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_safe_drop_atomic', {
        p_branch_id: params.branchId,
        p_branch_code: params.branchCode,
        p_amount: params.amount,
        p_dropped_by: params.transferredByName,
        p_witnessed_by: params.verifiedByName || null,
        p_remarks: params.reason || null,
      });

      if (!rpcError && rpcData) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('asopalav:ledger-updated'));
          window.dispatchEvent(new Event('asopalav:wallet-updated'));
        }
        return {
          dropNumber: rpcData.drop_number,
          newCashBalance: Number(rpcData.new_cash_balance) || 0,
        };
      }
    } catch (rpcEx) {
      console.warn('Atomic safe drop RPC fallback to client workflow:', rpcEx);
    }

    // 2. Resilient Client Fallback
    const currentWallet = await this.getBranchWallet(params.branchId);
    if (currentWallet.cash_balance < params.amount) {
      throw new Error(
        `Insufficient cash in drawer (₹${currentWallet.cash_balance.toLocaleString('en-IN')}) for a safe drop of ₹${params.amount.toLocaleString('en-IN')}.`
      );
    }

    currentWallet.cash_balance -= params.amount;
    await this.updateBranchWallet(currentWallet);

    const dropNumber = `SD-${Date.now().toString().slice(-6)}`;

    try {
      await supabase.from('safe_drops').insert([
        {
          drop_number: dropNumber,
          branch_id: params.branchId,
          branch_code: params.branchCode,
          amount: params.amount,
          dropped_by_name: params.transferredByName,
          witnessed_by_name: params.verifiedByName || null,
          status: 'In_Safe',
          remarks: params.reason || 'Safe Drop: Transferred excess cash from till to showroom vault',
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('Safe drops table insert fallback:', e);
    }

    await this.appendLedgerEntry({
      branch_id: params.branchId,
      branch_code: params.branchCode,
      wallet_type: 'Cash',
      transaction_type: 'Safe_Drop',
      reference_number: dropNumber,
      debit_amount: params.amount,
      credit_amount: 0,
      running_balance: currentWallet.cash_balance,
      remarks: params.reason || 'Safe Drop: Transferred excess cash from till to showroom vault',
      cashier_name: params.transferredByName,
      authorized_by_name: params.verifiedByName,
    });

    await logSecurityEvent({
      userName: params.transferredByName,
      userRole: 'Cashier',
      actionType: 'Safe_Drop',
      targetEntity: 'branch_wallets',
      targetIdentifier: dropNumber,
      eventDescription: `Transferred ₹${params.amount} excess cash from till to showroom safe. New till balance: ₹${currentWallet.cash_balance}.`,
      justification: params.reason || 'Excess cash safe drop above threshold',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return { dropNumber, newCashBalance: currentWallet.cash_balance };
  }

  // --------------------------------------------------------------------------
  // 5. STAFF ADVANCES & TOUCH SIGNATURES
  // --------------------------------------------------------------------------
  async getStaffAdvances(branchId?: string): Promise<StaffAdvance[]> {
    const code = normalizeBranchCode(branchId);
    const isAll = !branchId || branchId === 'ALL' || code === 'ALL';
    const canonicalId = isAll ? 'ALL' : normalizeBranchId(branchId);

    try {
      let query = supabase
        .from('staff_advances')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isAll) {
        query = query.or(`branch_id.eq.${canonicalId},branch_id.eq.${code},branch_code.eq.${code}`);
      }

      const { data, error } = await query;
      if (!error && data !== null) {
        localStorage.setItem(`asopalav_advances_${canonicalId}`, JSON.stringify(data.slice(0, 200)));
        return data;
      }
    } catch (e) {
      console.warn('Advances fetched from local store fallback:', e);
    }

    const keysToCheck = isAll
      ? ['asopalav_advances_ALL', 'asopalav_advances_Aellp-ASI', 'asopalav_advances_ASI', 'asopalav_advances_CG', 'asopalav_advances_NAV', 'asopalav_advances_SUR']
      : [`asopalav_advances_${canonicalId}`, `asopalav_advances_${code}`, `asopalav_advances_${branchId}`, 'asopalav_advances_ALL', 'asopalav_advances_Aellp-ASI'];

    for (const key of keysToCheck) {
      const local = localStorage.getItem(key);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (isAll) return parsed;
            const filtered = parsed.filter(
              (a: any) =>
                normalizeBranchCode(a.branch_code) === code ||
                normalizeBranchCode(a.branch_id) === code ||
                normalizeBranchId(a.branch_id) === canonicalId
            );
            if (filtered.length > 0) return filtered;
            return parsed; // fallback
          }
        } catch {
          // Ignore
        }
      }
    }

    return [];
  }

  async disburseStaffAdvance(params: DisburseAdvanceParams): Promise<StaffAdvance> {
    const { advance, userName, userRole } = params;
    if (!advance.advance_amount || advance.advance_amount <= 0) {
      throw new Error('Advance amount must be a positive number greater than zero.');
    }
    if (advance.advance_amount > 10000000) {
      throw new Error('Advance amount exceeds maximum allowed limit of ₹1,00,00,000.');
    }

    const fullAdvance: StaffAdvance = {
      ...params.advance,
      id: crypto.randomUUID(),
      bills_submitted_amount: 0,
      cash_returned_amount: 0,
      unsettled_balance: params.advance.advance_amount,
      settlement_proofs: [],
      status: 'Active_Unsettled',
      created_at: new Date().toISOString(),
    };

    // 0. Primary Database Atomic RPC (Zero Race Conditions, Single Round-Trip)
    try {
      const allowNegative = useOverrideStore.getState().isNegativeWalletAllowed();
      const { data: atomicData, error: rpcError } = await supabase.rpc('disburse_staff_advance_atomic', {
        p_advance: fullAdvance,
        p_user_name: userName,
        p_user_role: userRole,
        p_allow_negative: allowNegative,
      });

      if (!rpcError && atomicData) {
        const atomicAdvance = atomicData as StaffAdvance;
        const existing = await this.getStaffAdvances(params.advance.branch_id);
        localStorage.setItem(
          `asopalav_advances_${params.advance.branch_id}`,
          JSON.stringify([atomicAdvance, ...existing])
        );

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('asopalav:advances-updated'));
          window.dispatchEvent(new Event('asopalav:wallet-updated'));
        }
        return atomicAdvance;
      }

      if (rpcError) {
        if (rpcError.message && !rpcError.message.includes('function') && !rpcError.message.includes('not exist') && !rpcError.message.includes('PGRST202')) {
          throw new Error(rpcError.message);
        }
      }
    } catch (rpcEx: any) {
      if (rpcEx?.message && !rpcEx.message.includes('function') && !rpcEx.message.includes('not exist') && !rpcEx.message.includes('PGRST202')) {
        throw rpcEx;
      }
    }

    // 1. Deduct from Branch Wallet with Liquidity Guard (or SuperAdmin Overdraft Override)
    const currentWallet = await this.getBranchWallet(params.advance.branch_id);
    const allowNegative = useOverrideStore.getState().isNegativeWalletAllowed();
    let newBalance = 0;
    if (params.advance.payment_method === 'Physical_Cash') {
      if (currentWallet.cash_balance < params.advance.advance_amount && !allowNegative) {
        throw new Error(
          `Insufficient Cash Drawer Balance: Available till balance is ₹${currentWallet.cash_balance.toLocaleString('en-IN')}, but advance requires ₹${params.advance.advance_amount.toLocaleString('en-IN')}. Please top up cash float before issuing advance.`
        );
      }
      currentWallet.cash_balance = currentWallet.cash_balance - params.advance.advance_amount;
      newBalance = currentWallet.cash_balance;
    } else {
      if (currentWallet.upi_balance < params.advance.advance_amount && !allowNegative) {
        throw new Error(
          `Insufficient Online/UPI Wallet Balance: Available bank balance is ₹${currentWallet.upi_balance.toLocaleString('en-IN')}, but advance requires ₹${params.advance.advance_amount.toLocaleString('en-IN')}. Please top up account balance before issuing advance.`
        );
      }
      currentWallet.upi_balance = currentWallet.upi_balance - params.advance.advance_amount;
      newBalance = currentWallet.upi_balance;
    }
    await this.updateBranchWallet(currentWallet);

    const advanceRemarks = `Staff Advance to ${params.advance.staff_name} for ${params.advance.purpose}`;

    // 2. Record Ledger
    await this.appendLedgerEntry({
      branch_id: params.advance.branch_id,
      branch_code: params.advance.branch_code,
      wallet_type: params.advance.payment_method === 'Physical_Cash' ? 'Cash' : 'UPI',
      transaction_type: 'Advance_Out',
      reference_number: params.advance.receipt_number,
      debit_amount: params.advance.advance_amount,
      credit_amount: 0,
      running_balance: newBalance,
      remarks: advanceRemarks,
      cashier_name: params.userName,
    });

    // 3. Save to storage & DB
    const existing = await this.getStaffAdvances(params.advance.branch_id);
    localStorage.setItem(
      `asopalav_advances_${params.advance.branch_id}`,
      JSON.stringify([fullAdvance, ...existing])
    );

    const { error: advInsertError } = await supabase.from('staff_advances').insert([fullAdvance]);
    if (advInsertError) {
      console.error('Advance insert error:', advInsertError);
      throw new Error(advInsertError.message || 'Failed to save staff advance in database.');
    }

    // 4. Audit Log
    await logSecurityEvent({
      userName: params.userName,
      userRole: params.userRole,
      actionType: 'Disburse_Advance',
      targetEntity: 'staff_advances',
      targetIdentifier: params.advance.receipt_number,
      eventDescription: `Given advance ₹${params.advance.advance_amount} to ${params.advance.staff_name} (${params.advance.staff_code}) with signature`,
      justification: params.advance.purpose,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return fullAdvance;
  }

  async settleStaffAdvance(params: SettleAdvanceParams) {
    const advances = await this.getStaffAdvances(params.branchId);
    const target = advances.find((a) => a.id === params.advanceId || a.receipt_number === params.receiptNumber);

    if (!target) throw new Error('Advance record not found.');

    if (params.billsSubmittedAmount < 0 || params.cashReturnedAmount < 0) {
      throw new Error('Settlement amounts cannot be negative.');
    }

    const totalSettlingNow = params.billsSubmittedAmount + params.cashReturnedAmount;
    if (totalSettlingNow <= 0) {
      throw new Error('Total settlement amount must be greater than ₹0.');
    }

    if (totalSettlingNow > target.unsettled_balance) {
      throw new Error(
        `Total settlement amount (₹${totalSettlingNow.toLocaleString('en-IN')}) cannot exceed remaining unsettled balance of ₹${target.unsettled_balance.toLocaleString('en-IN')}.`
      );
    }

    const newBillsAmount = target.bills_submitted_amount + params.billsSubmittedAmount;
    const newCashReturnAmount = target.cash_returned_amount + params.cashReturnedAmount;
    const newUnsettled = Math.max(0, target.advance_amount - (newBillsAmount + newCashReturnAmount));

    let newStatus: StaffAdvance['status'] = 'Active_Unsettled';
    if (newUnsettled === 0) {
      newStatus = newBillsAmount > 0 ? 'Settled_Bills' : 'Settled_Cash';
    }

    const updatedProofs = [...target.settlement_proofs, ...params.settlementProofs];

    // 1. If cash was returned, credit Cash Wallet
    if (params.cashReturnedAmount > 0) {
      // M-6 Security: Check if accounting period is locked before crediting wallet
      const settlementDate = format(new Date(), 'yyyy-MM-dd');
      const isPeriodLocked = await this.checkIsPeriodLocked(settlementDate);
      if (isPeriodLocked && !isPrivilegedAdminRole(params.userRole)) {
        throw new Error(`Cannot record settlement: Accounting period for ${settlementDate} is LOCKED. Contact Super Admin or Admin to unlock.`);
      }

      const currentWallet = await this.getBranchWallet(params.branchId);
      currentWallet.cash_balance += params.cashReturnedAmount;
      await this.updateBranchWallet(currentWallet);

      await this.appendLedgerEntry({
        branch_id: params.branchId,
        branch_code: params.branchCode,
        wallet_type: 'Cash',
        transaction_type: 'Advance_Return_In',
        reference_number: `RET-${params.receiptNumber}`,
        debit_amount: 0,
        credit_amount: params.cashReturnedAmount,
        running_balance: currentWallet.cash_balance,
        remarks: `Cash return settlement for advance ${params.receiptNumber}`,
        cashier_name: params.userName,
      });
    }

    // 2. If bills were submitted, auto-generate Expense Voucher for accounting & Tally sync
    if (params.billsSubmittedAmount > 0) {
      try {
        await supabase.from('expense_categories').upsert([
          { category_name: 'Staff Advance Settlement Bill', color_theme: 'Vanilla', is_active: true }
        ]);
      } catch (e) {
        console.warn('Category ensure fallback:', e);
      }

      const settlementVoucher = {
        id: crypto.randomUUID(),
        voucher_number: `BILL-${params.receiptNumber}`,
        branch_id: params.branchId,
        branch_code: params.branchCode,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        // H-3 Fix: Use 'Advance_Settlement' payment_type so Tally export excludes this from
        // cash flow totals. Funds were already debited at advance disbursement time.
        // Double-counting in Tally export is prevented by filtering payment_type !== 'Advance_Settlement'.
        payment_type: 'Advance_Settlement',
        payment_method: 'Physical_Cash',
        total_amount: params.billsSubmittedAmount,
        recipient_name: target.staff_name,
        category_name: 'Staff Advance Settlement Bill',
        department_name: 'Staff Imprest',
        remarks: `[ADV-SETTLEMENT] Bill for Advance #${params.receiptNumber} (${target.purpose}) — excluded from Tally cash flow. Original debit was at advance disbursement.`,
        bill_photo_urls: params.settlementProofs || [],
        created_by_name: params.userName,
        status: 'Approved',
        created_at: new Date().toISOString(),
      };

      await this.insertExpenseVoucherRecord(settlementVoucher);

      await logSecurityEvent({
        userName: params.userName,
        userRole: params.userRole,
        actionType: 'Create_Voucher',
        targetEntity: 'expense_vouchers',
        targetIdentifier: settlementVoucher.voucher_number,
        eventDescription: `Auto-generated expense voucher ₹${params.billsSubmittedAmount} for advance settlement #${params.receiptNumber}`,
        justification: `Settlement of advance by ${target.staff_name}`,
      });
    }

    // 3. Update DB & Local Cache
    const updatedAdvance: StaffAdvance = {
      ...target,
      bills_submitted_amount: newBillsAmount,
      cash_returned_amount: newCashReturnAmount,
      unsettled_balance: newUnsettled,
      settlement_proofs: updatedProofs,
      status: newStatus,
    };

    const newAdvancesList = advances.map((a) => (a.id === updatedAdvance.id ? updatedAdvance : a));
    localStorage.setItem(`asopalav_advances_${params.branchId}`, JSON.stringify(newAdvancesList));

    const { error: advUpErr } = await supabase
      .from('staff_advances')
      .update({
        bills_submitted_amount: newBillsAmount,
        cash_returned_amount: newCashReturnAmount,
        unsettled_balance: newUnsettled,
        settlement_proofs: updatedProofs,
        status: newStatus,
      })
      .eq('receipt_number', params.receiptNumber);

    if (advUpErr) {
      console.error('Advance settlement update error:', advUpErr);
      throw new Error(advUpErr.message);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
      if (params.billsSubmittedAmount > 0) {
        window.dispatchEvent(new Event('asopalav:vouchers-updated'));
      }
    }

    return updatedAdvance;
  }

  async flagForSalaryDeduction(receiptNumber: string, month: string, userName: string, branchId: string = 'Aellp-ASI') {
    const advances = await this.getStaffAdvances(branchId);
    const updated = advances.map((a) => {
      if (a.receipt_number === receiptNumber) {
        return {
          ...a,
          status: 'Flagged_Salary_Deduction' as const,
          salary_deduction_month: month,
          salary_deducted_at: new Date().toISOString(),
          salary_deducted_by_name: userName,
        };
      }
      return a;
    });
    localStorage.setItem(`asopalav_advances_${branchId}`, JSON.stringify(updated));

    try {
      const { error } = await supabase
        .from('staff_advances')
        .update({
          status: 'Flagged_Salary_Deduction',
          salary_deduction_month: month,
          salary_deducted_at: new Date().toISOString(),
          salary_deducted_by_name: userName,
        })
        .eq('receipt_number', receiptNumber);
      if (error) throw error;
    } catch (e) {
      console.warn('Salary deduction flag fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'flag_salary_deduction',
        table: 'staff_advances',
        action: 'update',
        payload: {
          status: 'Flagged_Salary_Deduction',
          salary_deduction_month: month,
          salary_deducted_at: new Date().toISOString(),
          salary_deducted_by_name: userName,
        },
        matchField: 'receipt_number',
        matchValue: receiptNumber,
        description: `Flag salary deduction ${receiptNumber} (${month})`,
      });
    }

    await logSecurityEvent({
      userName,
      userRole: 'Store_Manager',
      actionType: 'Salary_Deduction_Tag',
      targetEntity: 'staff_advances',
      targetIdentifier: receiptNumber,
      eventDescription: `Flagged unsettled advance ${receiptNumber} for payroll deduction in month ${month}`,
      justification: 'Unsettled imprest at month-end closing',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
    }
  }

  async waiveStaffAdvance(
    receiptNumber: string,
    userName: string,
    userRole: string,
    reason: string,
    branchId: string = 'Aellp-ASI'
  ) {
    const advances = await this.getStaffAdvances(branchId);
    const target = advances.find((a) => a.receipt_number === receiptNumber);
    if (!target) throw new Error('Advance not found');

    const waivedAmount = target.unsettled_balance;
    const updated = advances.map((a) => {
      if (a.receipt_number === receiptNumber) {
        return {
          ...a,
          unsettled_balance: 0,
          status: 'Settled_Bills' as const,
        };
      }
      return a;
    });
    localStorage.setItem(`asopalav_advances_${branchId}`, JSON.stringify(updated));

    try {
      const { error } = await supabase
        .from('staff_advances')
        .update({
          unsettled_balance: 0,
          status: 'Settled_Bills',
        })
        .eq('receipt_number', receiptNumber);
      if (error) throw error;
    } catch (e) {
      console.warn('Waive advance DB fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'waive_advance',
        table: 'staff_advances',
        action: 'update',
        payload: {
          unsettled_balance: 0,
          status: 'Settled_Bills',
        },
        matchField: 'receipt_number',
        matchValue: receiptNumber,
        description: `Waive advance ${receiptNumber}`,
      });
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Waive_Advance',
      targetEntity: 'staff_advances',
      targetIdentifier: receiptNumber,
      eventDescription: `Super Admin waived/forgave remaining advance balance of ₹${waivedAmount} for ${target.staff_name}`,
      justification: reason || 'Executive waiver by Super Admin',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
    }
  }

  async deleteStaffAdvance(
    receiptNumber: string,
    userName: string,
    userRole: string,
    reason: string,
    branchId: string = 'Aellp-ASI'
  ) {
    const advances = await this.getStaffAdvances(branchId);
    const target = advances.find((a) => a.receipt_number === receiptNumber);
    if (!target) throw new Error('Advance not found');

    // Refund wallet if active unsettled
    if (target.unsettled_balance > 0) {
      const currentWallet = await this.getBranchWallet(target.branch_id);
      currentWallet.cash_balance += target.unsettled_balance;
      await this.updateBranchWallet(currentWallet);

      await this.appendLedgerEntry({
        branch_id: target.branch_id,
        branch_code: target.branch_code,
        wallet_type: 'Cash',
        transaction_type: 'Adjustment',
        reference_number: `ADV-PURGE-${receiptNumber}`,
        debit_amount: 0,
        credit_amount: target.unsettled_balance,
        running_balance: currentWallet.cash_balance,
        remarks: `SUPERADMIN ADVANCE PURGE: ${reason}`,
        cashier_name: userName,
      });
    }

    const filtered = advances.filter((a) => a.receipt_number !== receiptNumber);
    localStorage.setItem(`asopalav_advances_${branchId}`, JSON.stringify(filtered));

    try {
      const { error } = await supabase.from('staff_advances').delete().eq('receipt_number', receiptNumber);
      if (error) throw error;
    } catch (e) {
      console.warn('Advance delete DB fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'delete_advance',
        table: 'staff_advances',
        action: 'delete',
        payload: {},
        matchField: 'receipt_number',
        matchValue: receiptNumber,
        description: `Delete advance ${receiptNumber}`,
      });
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Advance',
      targetEntity: 'staff_advances',
      targetIdentifier: receiptNumber,
      eventDescription: `Permanently deleted advance record ${receiptNumber} (₹${target.advance_amount}) for ${target.staff_name}`,
      justification: reason || 'Super Admin advance deletion',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }
  }

  /**
   * Batch flags multiple overdue advances for payroll deduction
   */
  async batchFlagOverdueForSalaryDeduction(
    advanceIdsOrReceipts: string[],
    month: string,
    userName: string,
    branchId: string = 'ALL'
  ): Promise<{ count: number; totalAmount: number }> {
    if (!advanceIdsOrReceipts || advanceIdsOrReceipts.length === 0) {
      return { count: 0, totalAmount: 0 };
    }

    const advances = await this.getStaffAdvances(branchId);
    const targetSet = new Set(advanceIdsOrReceipts);
    let totalAmount = 0;
    let count = 0;

    const now = new Date().toISOString();
    const updated = advances.map((a) => {
      if (targetSet.has(a.id) || targetSet.has(a.receipt_number)) {
        totalAmount += Number(a.unsettled_balance) || 0;
        count++;
        return {
          ...a,
          status: 'Flagged_Salary_Deduction' as const,
          salary_deduction_month: month,
          salary_deducted_at: now,
          salary_deducted_by_name: userName,
        };
      }
      return a;
    });

    if (branchId !== 'ALL') {
      localStorage.setItem(`asopalav_advances_${branchId}`, JSON.stringify(updated));
    }

    try {
      // Update by IDs or receipt numbers
      const isUUID = advanceIdsOrReceipts[0] && advanceIdsOrReceipts[0].includes('-');
      const field = isUUID ? 'id' : 'receipt_number';

      const { error } = await supabase
        .from('staff_advances')
        .update({
          status: 'Flagged_Salary_Deduction',
          salary_deduction_month: month,
          salary_deducted_at: now,
          salary_deducted_by_name: userName,
        })
        .in(field, advanceIdsOrReceipts);

      if (error) throw error;
    } catch (e) {
      console.warn('Batch flag salary deduction fallback:', e);
    }

    await logSecurityEvent({
      userName,
      userRole: 'Store_Manager',
      actionType: 'Salary_Deduction_Tag',
      targetEntity: 'staff_advances',
      targetIdentifier: `BATCH-${count}-ADVANCES`,
      eventDescription: `Batch flagged ${count} overdue advances (₹${totalAmount.toLocaleString('en-IN')}) for HR salary deduction in month ${month}`,
      justification: 'Automated 30-day overdue payroll recovery sync',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
    }
    return { count, totalAmount };
  }

  /**
   * Batch marks flagged salary deductions as cleared / recovered from employee pay
   */
  async batchClearSalaryDeductions(
    advanceIdsOrReceipts: string[],
    userName: string,
    userRole: string = 'Super_Admin',
    reason: string = 'HR Payroll processed',
    branchId: string = 'ALL'
  ): Promise<{ count: number; totalAmount: number }> {
    if (!advanceIdsOrReceipts || advanceIdsOrReceipts.length === 0) {
      return { count: 0, totalAmount: 0 };
    }

    const advances = await this.getStaffAdvances(branchId);
    const targetSet = new Set(advanceIdsOrReceipts);
    let totalAmount = 0;
    let count = 0;

    const updated = advances.map((a) => {
      if (targetSet.has(a.id) || targetSet.has(a.receipt_number)) {
        totalAmount += Number(a.unsettled_balance) || Number(a.advance_amount) || 0;
        count++;
        return {
          ...a,
          status: 'Cleared_Salary_Deduction' as const,
          unsettled_balance: 0,
        };
      }
      return a;
    });

    if (branchId !== 'ALL') {
      localStorage.setItem(`asopalav_advances_${branchId}`, JSON.stringify(updated));
    }

    try {
      const isUUID = advanceIdsOrReceipts[0] && advanceIdsOrReceipts[0].includes('-');
      const field = isUUID ? 'id' : 'receipt_number';

      const { error } = await supabase
        .from('staff_advances')
        .update({
          status: 'Cleared_Salary_Deduction',
          unsettled_balance: 0,
        })
        .in(field, advanceIdsOrReceipts);

      if (error) throw error;
    } catch (e) {
      console.warn('Batch clear salary deduction fallback:', e);
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Settle_Advance',
      targetEntity: 'staff_advances',
      targetIdentifier: `BATCH-${count}-PAYROLL-CLEARED`,
      eventDescription: `Confirmed recovery of ${count} advances (₹${totalAmount.toLocaleString('en-IN')}) via HR Payroll deduction: ${reason}`,
      justification: reason || 'Payroll payout clearance confirmed',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:advances-updated'));
    }
    return { count, totalAmount };
  }

  /**
   * Generates a formal HR Payroll Deduction Schedule CSV for Tally Payroll & Excel
   */
  generateHRPayrollDeductionCSV(advances: StaffAdvance[], targetMonth?: string): string {
    const sanitizeCsv = (str: any) => {
      const sanitized = String(str || '').replace(/"/g, '""');
      if (/^[=+\-@|\t\r]/.test(sanitized)) {
        return `'${sanitized}`;
      }
      return sanitized;
    };

    const headers = [
      'Staff Code',
      'Staff Employee Name',
      'Department',
      'Showroom Branch',
      'Advance Receipt Number',
      'Advance Disbursal Date',
      'Original Advance Amount (INR)',
      'Bills Submitted Amount (INR)',
      'Cash Returned Amount (INR)',
      'Unsettled Amount to Deduct (INR)',
      'Payroll Recovery Month',
      'Deduction Status',
      'Authorized By',
      'Flagged At Timestamp',
    ];

    const targetList = targetMonth && targetMonth !== 'ALL'
      ? advances.filter((a) => a.salary_deduction_month === targetMonth || a.status === 'Flagged_Salary_Deduction')
      : advances.filter((a) => a.status === 'Flagged_Salary_Deduction' || a.status === 'Cleared_Salary_Deduction' || a.unsettled_balance > 0);

    const rows = targetList.map((a) => {
      return [
        `"${sanitizeCsv(a.staff_code)}"`,
        `"${sanitizeCsv(a.staff_name)}"`,
        `"${sanitizeCsv(a.department_name || 'General')}"`,
        `"${sanitizeCsv(a.branch_code || 'ASI')}"`,
        `"${sanitizeCsv(a.receipt_number)}"`,
        `"${sanitizeCsv(a.advance_date)}"`,
        a.advance_amount,
        a.bills_submitted_amount || 0,
        a.cash_returned_amount || 0,
        a.unsettled_balance,
        `"${sanitizeCsv(a.salary_deduction_month || targetMonth || 'Current Month')}"`,
        `"${sanitizeCsv(a.status === 'Cleared_Salary_Deduction' ? 'Deducted & Cleared' : a.status === 'Flagged_Salary_Deduction' ? 'Flagged for Payroll' : 'Pending Imprest')}"`,
        `"${sanitizeCsv(a.salary_deducted_by_name || a.disbursed_by_name || 'Store Manager')}"`,
        `"${sanitizeCsv(a.salary_deducted_at || a.created_at)}"`,
      ].join(',');
    });

    return 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  }

  // --------------------------------------------------------------------------
  // 6. DAILY CASH CLOSING & DENOMINATION AUDIT (F9)
  // --------------------------------------------------------------------------
  async getCurrencyDenominations(): Promise<CurrencyDenomination[]> {
    try {
      const { data } = await supabase.from('currency_denominations').select('*').order('sort_order', { ascending: true });
      if (data && data.length > 0) return data;
    } catch (e) {
      console.warn('Using default RBI currency denominations', e);
    }
    return [
      { denomination_value: 500, display_label: '₹500 Note', is_coin: false, sort_order: 1, is_active: true },
      { denomination_value: 200, display_label: '₹200 Note', is_coin: false, sort_order: 2, is_active: true },
      { denomination_value: 100, display_label: '₹100 Note', is_coin: false, sort_order: 3, is_active: true },
      { denomination_value: 50, display_label: '₹50 Note', is_coin: false, sort_order: 4, is_active: true },
      { denomination_value: 20, display_label: '₹20 Note', is_coin: false, sort_order: 5, is_active: true },
      { denomination_value: 10, display_label: '₹10 Note', is_coin: false, sort_order: 6, is_active: true },
      { denomination_value: 5, display_label: '₹5 Coin', is_coin: true, sort_order: 7, is_active: true },
      { denomination_value: 2, display_label: '₹2 Coin', is_coin: true, sort_order: 8, is_active: true },
      { denomination_value: 1, display_label: '₹1 Coin', is_coin: true, sort_order: 9, is_active: true },
    ];
  }

  async getCashClosing(branchId: string, closingDate: string): Promise<CashClosing | null> {
    try {
      const { data, error } = await supabase
        .from('cash_closings')
        .select('*')
        .eq('branch_id', branchId)
        .eq('closing_date', closingDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) return data;
    } catch (e) {
      console.warn('Error fetching cash closing from DB:', e);
    }

    try {
      const offlineQueue = useOfflineQueue.getState().mutations;
      const match = offlineQueue.find(
        (m) =>
          m.table === 'cash_closings' &&
          m.payload?.branch_id === branchId &&
          m.payload?.closing_date === closingDate
      );
      if (match) return match.payload;
    } catch {
      // ignore
    }
    return null;
  }

  async saveCashClosing(params: SaveCashClosingParams): Promise<CashClosing> {
    const fullClosing: CashClosing = {
      id: crypto.randomUUID(),
      closing_date: params.closingDate,
      branch_id: params.branchId,
      branch_code: params.branchCode,
      opening_cash: params.openingCash,
      cash_inflow: params.cashInflow,
      cash_outflow: params.cashOutflow,
      expected_cash: params.expectedCash,
      actual_cash: params.actualCash,
      variance: params.variance,
      variance_disposition: params.varianceDisposition || (params.variance === 0 ? null : 'Unresolved'),
      charge_staff_code: params.chargeStaffCode || null,
      charge_staff_name: params.chargeStaffName || null,
      denominations_detail: params.denominationsDetail,
      denominations_breakdown: params.denominationsBreakdown,
      closing_notes: params.closingNotes,
      cashier_name: params.cashierName,
      verified_by_name: params.verifiedByName,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from('cash_closings').upsert([fullClosing]);
      if (error) throw error;
    } catch (e) {
      console.warn('Cash closing fallback to offline queue:', e);
      useOfflineQueue.getState().enqueueMutation({
        type: 'cash_closing',
        table: 'cash_closings',
        action: 'upsert',
        payload: fullClosing,
        description: `Cash closing ${params.branchCode} ${params.closingDate}`,
      });
    }

    // 1. Reconcile Branch Wallet Cash Balance to verified physically counted cash
    try {
      const currentWallet = await this.getBranchWallet(params.branchId);
      currentWallet.cash_balance = params.actualCash;
      await this.updateBranchWallet(currentWallet);

      if (params.variance !== 0) {
        const dispText = params.varianceDisposition ? ` [Disposition: ${params.varianceDisposition.replace('_', ' ')}]` : '';
        await this.appendLedgerEntry({
          branch_id: params.branchId,
          branch_code: params.branchCode,
          wallet_type: 'Cash',
          transaction_type: 'Adjustment',
          reference_number: `F9-REC-${params.branchCode}-${params.closingDate.replace(/-/g, '')}`,
          debit_amount: params.variance < 0 ? Math.abs(params.variance) : 0,
          credit_amount: params.variance > 0 ? params.variance : 0,
          running_balance: params.actualCash,
          remarks: `F9 Daily Cash Closing Reconciliation (${params.variance >= 0 ? '+' : ''}₹${params.variance})${dispText}`,
          cashier_name: params.verifiedByName,
        });

        // Trigger notification for variance
        useNotificationStore.getState().addNotification({
          title: `Daily Closing Cash ${params.variance < 0 ? 'Shortage' : 'Excess'} Detected`,
          message: `${params.branchCode} closing on ${params.closingDate} has a variance of ${params.variance >= 0 ? '+' : ''}₹${params.variance}. Disposition: ${params.varianceDisposition || 'Unresolved'}.`,
          type: 'closing_variance',
          target_roles: ['Store_Manager', 'Super_Admin', 'Auditor'],
          branch_id: params.branchId,
          amount: Math.abs(params.variance),
        });
      }
    } catch (err) {
      console.warn('Wallet closing reconciliation fallback:', err);
    }

    // 2. Update Till Session to Closed
    const sessionNumber = `SES-${params.branchCode}-${params.closingDate.replace(/-/g, '')}-01`;
    try {
      await supabase
        .from('drawer_sessions')
        .update({
          status: 'Closed',
          closed_at: new Date().toISOString(),
          actual_closing: params.actualCash,
          expected_closing: params.expectedCash,
          variance: params.variance,
          denominations_breakdown: params.denominationsBreakdown,
          verified_by_name: params.verifiedByName,
        })
        .eq('session_number', sessionNumber);
    } catch (e) {
      console.warn('Drawer session update fallback:', e);
    }

    // Audit Log
    await logSecurityEvent({
      userName: params.verifiedByName,
      userRole: 'Store_Manager',
      actionType: 'Daily_F9_Lock',
      targetEntity: 'cash_closings',
      targetIdentifier: `${params.branchCode}-${params.closingDate}`,
      eventDescription: `Completed F9 Daily Cash Closing. Actual: ₹${params.actualCash}, Expected: ₹${params.expectedCash}, Variance: ₹${params.variance}`,
      justification: params.closingNotes || 'Evening cash drawer lock & tally sign-off',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }

    return fullClosing;
  }

  async reopenCashClosing(
    closingDate: string,
    branchId: string,
    branchCode: string,
    userName: string,
    userRole: string,
    reason: string
  ) {
    const sessionNumber = `SES-${branchCode}-${closingDate.replace(/-/g, '')}-01`;
    try {
      await supabase
        .from('drawer_sessions')
        .update({
          status: 'Open',
          closed_at: null,
        })
        .eq('session_number', sessionNumber);
    } catch (e) {
      console.warn('Drawer session reopen fallback:', e);
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Daily_F9_Unlock',
      targetEntity: 'cash_closings',
      targetIdentifier: `${branchCode}-${closingDate}`,
      eventDescription: `Super Admin reopened closed drawer session for branch ${branchCode} on ${closingDate}`,
      justification: reason || 'Audit recount and adjustments',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
      window.dispatchEvent(new Event('asopalav:wallet-updated'));
    }
  }

  async updateCashClosing(
    closingDate: string,
    branchCode: string,
    updates: Partial<CashClosing>,
    userName: string,
    userRole: string,
    reason: string
  ) {
    try {
      await supabase
        .from('cash_closings')
        .update(updates)
        .eq('closing_date', closingDate)
        .eq('branch_code', branchCode);
    } catch (e) {
      console.warn('Cash closing update DB fallback:', e);
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Cash_Closing',
      targetEntity: 'cash_closings',
      targetIdentifier: `${branchCode}-${closingDate}`,
      eventDescription: `Super Admin updated cash closing details for ${branchCode} on ${closingDate}`,
      justification: reason || 'Closing record correction',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:ledger-updated'));
    }
  }

  // --------------------------------------------------------------------------
  // MASTER DATA FULL CRUD (BRANCHES, CATEGORIES, DEPTS, COURIERS, USERS)
  // --------------------------------------------------------------------------
  async createBranch(branch: any, userName: string, userRole: string) {
    const branchId = branch.branch_id || `Aellp-${(branch.branch_code || 'BR').toUpperCase()}`;
    const payload = { ...branch, branch_id: branchId };
    const { error } = await supabase.from('branches').insert([payload]);
    if (error) throw new Error(error.message);

    // Ensure wallet row exists
    await supabase.from('branch_wallets').upsert([
      { branch_id: branchId, cash_balance: 0, upi_balance: 0, updated_at: new Date().toISOString() }
    ]);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Branch',
      targetEntity: 'branches',
      targetIdentifier: payload.branch_code,
      eventDescription: `Created showroom branch: ${payload.branch_name} (${payload.branch_code})`,
      justification: 'Showroom network expansion',
    });

    useBranchStore.getState().fetchBranchesAndWallets(true);
    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'branches' } }));
    }
  }

  async updateBranch(branchId: string, updates: any, userName: string, userRole: string) {
    const { error } = await supabase.from('branches').update(updates).eq('branch_id', branchId);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Branch',
      targetEntity: 'branches',
      targetIdentifier: branchId,
      eventDescription: `Updated branch settings for ${branchId}: ${Object.keys(updates).join(', ')}`,
      justification: 'Branch parameter update by Super Admin',
    });

    useBranchStore.getState().fetchBranchesAndWallets(true);
    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'branches' } }));
    }
  }

  async deleteBranch(branchId: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('branches').update({ is_active: false, updated_at: new Date().toISOString() }).eq('branch_id', branchId);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Branch',
      targetEntity: 'branches',
      targetIdentifier: branchId,
      eventDescription: `Decommissioned / removed branch ${branchId}`,
      justification: reason || 'Showroom closure / decommission',
    });

    useBranchStore.getState().fetchBranchesAndWallets(true);
    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'branches' } }));
    }
  }

  async createCategory(cat: any, userName: string, userRole: string) {
    const { error } = await supabase.from('expense_categories').insert([cat]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Category',
      targetEntity: 'expense_categories',
      targetIdentifier: cat.category_name,
      eventDescription: `Added new expense category: ${cat.category_name}`,
      justification: 'Master data configuration',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'expense_categories' } }));
    }
  }

  async updateCategory(categoryName: string, updates: any, userName: string, userRole: string) {
    const { error } = await supabase.from('expense_categories').update(updates).eq('category_name', categoryName);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Category',
      targetEntity: 'expense_categories',
      targetIdentifier: categoryName,
      eventDescription: `Updated expense category ${categoryName}`,
      justification: 'Category modification by Super Admin',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'expense_categories' } }));
    }
  }

  async deleteCategory(categoryName: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('expense_categories').update({ is_active: false, updated_at: new Date().toISOString() }).eq('category_name', categoryName);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Category',
      targetEntity: 'expense_categories',
      targetIdentifier: categoryName,
      eventDescription: `Deleted expense category ${categoryName}`,
      justification: reason || 'Master category cleanup',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'expense_categories' } }));
    }
  }

  async createDepartment(dept: any, userName: string, userRole: string) {
    const { error } = await supabase.from('departments').insert([dept]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Department',
      targetEntity: 'departments',
      targetIdentifier: dept.department_name,
      eventDescription: `Added new department: ${dept.department_name}`,
      justification: 'Organizational chart update',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'departments' } }));
    }
  }

  async updateDepartment(deptCode: string, updates: any, userName: string, userRole: string) {
    const { error } = await supabase.from('departments').update(updates).eq('department_code', deptCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Department',
      targetEntity: 'departments',
      targetIdentifier: deptCode,
      eventDescription: `Updated department ${deptCode}`,
      justification: 'Department modification',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'departments' } }));
    }
  }

  async deleteDepartment(deptCode: string, deptName: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('departments').update({ is_active: false, updated_at: new Date().toISOString() }).eq('department_code', deptCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Department',
      targetEntity: 'departments',
      targetIdentifier: deptName || deptCode,
      eventDescription: `Deleted department ${deptName || deptCode}`,
      justification: reason || 'Department removal by Super Admin',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'departments' } }));
    }
  }

  async createCourier(courier: any, userName: string, userRole: string) {
    const { error } = await supabase.from('courier_partners').insert([courier]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Create_Courier',
      targetEntity: 'courier_partners',
      targetIdentifier: courier.partner_name,
      eventDescription: `Added courier partner: ${courier.partner_name}`,
      justification: 'Logistics vendor onboarding',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'courier_partners' } }));
    }
  }

  async updateCourier(partnerCode: string, updates: any, userName: string, userRole: string) {
    const { error } = await supabase.from('courier_partners').update(updates).eq('partner_code', partnerCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Courier',
      targetEntity: 'courier_partners',
      targetIdentifier: partnerCode,
      eventDescription: `Updated courier partner ${partnerCode}`,
      justification: 'Courier detail update',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'courier_partners' } }));
    }
  }

  async deleteCourier(partnerCode: string, partnerName: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('courier_partners').update({ is_active: false, updated_at: new Date().toISOString() }).eq('partner_code', partnerCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Courier',
      targetEntity: 'courier_partners',
      targetIdentifier: partnerName || partnerCode,
      eventDescription: `Deleted courier partner ${partnerName || partnerCode}`,
      justification: reason || 'Courier vendor decommission',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'courier_partners' } }));
    }
  }

  async updateRolePermissions(roleCode: string, permissions: Partial<RolePermissions>, userName: string, userRole: string) {
    const { error } = await supabase.from('role_permissions').update(permissions).eq('role_code', roleCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_Permissions',
      targetEntity: 'role_permissions',
      targetIdentifier: roleCode,
      eventDescription: `Modified permissions matrix for role ${roleCode}`,
      justification: 'RBAC security policy update by Super Admin',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async deleteAppUser(userId: string, username: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('app_users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_User',
      targetEntity: 'app_users',
      targetIdentifier: username || userId,
      eventDescription: `Deleted user account @${username}`,
      justification: reason || 'User offboarding by Super Admin',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async deleteStaffMember(staffCode: string, staffName: string, userName: string, userRole: string, reason?: string) {
    const { error } = await supabase.from('staff_members').update({ is_active: false, updated_at: new Date().toISOString() }).eq('staff_code', staffCode);
    if (error) throw new Error(error.message);

    // Direct cut of all linked app_users login access
    try {
      await supabase
        .from('app_users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .or(`staff_code.eq.${staffCode},id.eq.${staffCode}`);
    } catch (e) {
      console.warn('Could not revoke linked app_users on staff delete:', e);
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_User',
      targetEntity: 'staff_members',
      targetIdentifier: staffCode,
      eventDescription: `Removed staff member ${staffName} (${staffCode}) and revoked linked user login access`,
      justification: reason || 'Staff departure from showroom',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'staff_members' } }));
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async saveBranch(branch: any, isEdit: boolean, userName: string, userRole: string) {
    const branchCode = (branch.branch_code || 'BR').toUpperCase();
    const branchId = branch.branch_id || `Aellp-${branchCode}`;
    const payload: Record<string, any> = {
      branch_id: branchId,
      branch_code: branchCode,
      branch_name: (branch.branch_name || '').trim(),
      short_name: (branch.short_name || branch.branch_name || '').trim(),
      entity_company_name: (branch.entity_company_name || 'Asopalav Endeavours LLP').trim(),
      pan_number: branch.pan_number ? String(branch.pan_number).trim() : null,
      gstin: branch.gstin ? String(branch.gstin).trim() : null,
      accountant_name: (branch.accountant_name || '').trim(),
      contact_phone: (branch.contact_phone || '').trim(),
      contact_email: (branch.contact_email || '').trim(),
      city: (branch.city || 'Ahmedabad').trim(),
      state: (branch.state || 'Gujarat').trim(),
      address: (branch.address || '').trim(),
      min_cash_threshold: Number(branch.min_cash_threshold) || 3000,
      is_active: branch.is_active ?? true,
    };

    if (branch.max_cash_ceiling !== undefined && branch.max_cash_ceiling !== '') {
      payload.max_cash_ceiling = Number(branch.max_cash_ceiling) || 25000;
    }
    if (branch.max_upi_ceiling !== undefined && branch.max_upi_ceiling !== '') {
      payload.max_upi_ceiling = Number(branch.max_upi_ceiling) || 50000;
    }

    let { error } = await supabase.from('branches').upsert([payload]);
    if (error && error.message && error.message.includes('column of') && error.message.includes('branches')) {
      console.warn('[Supabase Schema Adaptor] Retrying branch upsert without ceiling columns:', error.message);
      delete payload.max_cash_ceiling;
      delete payload.max_upi_ceiling;
      const retry = await supabase.from('branches').upsert([payload]);
      error = retry.error;
    }
    if (error) throw new Error(error.message);

    // Guarantee sub-wallet row exists
    await supabase.from('branch_wallets').upsert([
      {
        branch_id: branchId,
        cash_balance: branch.cash_balance !== undefined ? Number(branch.cash_balance) : 0,
        upi_balance: branch.upi_balance !== undefined ? Number(branch.upi_balance) : 0,
        updated_at: new Date().toISOString(),
      },
    ]);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_Branch' : 'Create_Branch',
      targetEntity: 'branches',
      targetIdentifier: payload.branch_code,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} showroom branch ${payload.branch_name} (${payload.branch_code})`,
      justification: 'Showroom master management',
    });

    useBranchStore.getState().fetchBranchesAndWallets(true);
    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'branches' } }));
    }
  }

  async saveCategory(category: any, isEdit: boolean, userName: string, userRole: string) {
    const payload = {
      category_name: (category.category_name || '').trim(),
      color_theme: category.color_theme || 'Vanilla',
      is_active: category.is_active ?? true,
    };
    if (!payload.category_name) throw new Error('Category Name is required.');

    const { error } = await supabase.from('expense_categories').upsert([payload]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_Category' : 'Create_Category',
      targetEntity: 'expense_categories',
      targetIdentifier: payload.category_name,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} expense category ${payload.category_name}`,
      justification: 'Expense category master management',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'expense_categories' } }));
    }
  }

  async saveDepartment(department: any, isEdit: boolean, userName: string, userRole: string) {
    const payload = {
      department_code: (department.department_code || '').trim().toUpperCase(),
      department_name: (department.department_name || '').trim(),
      is_active: department.is_active ?? true,
    };
    if (!payload.department_code || !payload.department_name) {
      throw new Error('Department Code and Name are required.');
    }

    const { error } = await supabase.from('departments').upsert([payload]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_Department' : 'Create_Department',
      targetEntity: 'departments',
      targetIdentifier: payload.department_code,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} department ${payload.department_name} (${payload.department_code})`,
      justification: 'Department master management',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'departments' } }));
    }
  }

  async saveCourier(courier: any, isEdit: boolean, userName: string, userRole: string) {
    const rawPhone = courier.contact_phone ? String(courier.contact_phone).trim() : null;
    let cleanPhone: string | null = null;
    if (rawPhone && rawPhone !== '-' && rawPhone !== '+91' && rawPhone.toLowerCase() !== 'null' && rawPhone.toLowerCase() !== 'na') {
      const digits = rawPhone.replace(/[^0-9]/g, '');
      if (digits.length >= 10) {
        const clean10 = digits.startsWith('91') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
        cleanPhone = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5, 10)}`;
      } else if (digits.length > 0) {
        cleanPhone = rawPhone;
      }
    }

    const payload = {
      partner_code: (courier.partner_code || '').trim().toUpperCase(),
      partner_name: (courier.partner_name || '').trim(),
      contact_phone: cleanPhone,
      is_active: courier.is_active ?? true,
    };
    if (!payload.partner_code || !payload.partner_name) {
      throw new Error('Courier Partner Code and Name are required.');
    }

    const { error } = await supabase.from('courier_partners').upsert([payload]);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_Courier' : 'Create_Courier',
      targetEntity: 'courier_partners',
      targetIdentifier: payload.partner_code,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} courier partner ${payload.partner_name} (${payload.partner_code})`,
      justification: 'Courier master management',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'courier_partners' } }));
    }
  }

  async saveAppUser(userRecord: any, isEdit: boolean, userName: string, userRole: string) {
    const id = userRecord.id || `USR-${Date.now().toString().slice(-6)}`;
    // Normalize role code if legacy Showroom_Cashier is passed
    let normalizedRole = userRecord.role_code || 'Cashier';
    if (normalizedRole === 'Showroom_Cashier' || normalizedRole === 'Store_Cashier') {
      normalizedRole = 'Cashier';
    }
    const payload: any = {
      ...userRecord,
      id,
      role_code: normalizedRole,
      theme_preference: userRecord.theme_preference || 'Dark',
      is_active: userRecord.is_active ?? true,
    };

    // Helper to securely hash plain text passwords/pins using bcrypt
    const ensureHashed = (val?: string) => {
      if (!val) return undefined;
      if (val.startsWith('$2a$') || val.startsWith('$2b$') || val.startsWith('$2y$')) {
        return val;
      }
      return bcrypt.hashSync(val, 10);
    };

    if (payload.password_hash) {
      payload.password_hash = ensureHashed(payload.password_hash);
    }
    if (payload.lock_pin_hash) {
      payload.lock_pin_hash = ensureHashed(payload.lock_pin_hash);
    }

    if (payload.staff_code && payload.is_active !== false) {
      // Check if linked staff member is active
      try {
        const { data: staffData } = await supabase
          .from('staff_members')
          .select('is_active, first_name, last_name')
          .eq('staff_code', payload.staff_code)
          .maybeSingle();

        if (staffData && staffData.is_active === false) {
          throw new Error(`Cannot grant login access: Linked staff member ${staffData.first_name} ${staffData.last_name} (${payload.staff_code}) is marked as inactive or resigned.`);
        }
      } catch (e: any) {
        if (e.message && e.message.includes('Cannot grant login access')) {
          throw e;
        }
      }
    }

    // Persist staff link in local cache mapping
    try {
      const linksRaw = localStorage.getItem('asopalav_user_staff_links') || '{}';
      const links = JSON.parse(linksRaw);
      if (payload.staff_code) {
        links[id] = payload.staff_code;
        if (payload.username) links[payload.username.toLowerCase()] = payload.staff_code;
      } else {
        delete links[id];
        if (payload.username) delete links[payload.username.toLowerCase()];
      }
      localStorage.setItem('asopalav_user_staff_links', JSON.stringify(links));
    } catch {
      // Ignore local storage errors
    }

    if (isEdit) {
      if (!payload.password_hash) delete payload.password_hash;
      if (!payload.lock_pin_hash) delete payload.lock_pin_hash;
    }

    const executeUserDbOp = async (dataPayload: any) => {
      if (isEdit) {
        const { error: updateErr, data } = await supabase
          .from('app_users')
          .update(dataPayload)
          .eq('id', id)
          .select();

        if (updateErr) {
          throw updateErr;
        }

        if (!data || data.length === 0) {
          const insertData = { ...dataPayload };
          if (!insertData.password_hash) insertData.password_hash = bcrypt.hashSync('Admin@123', 10);
          if (!insertData.lock_pin_hash) insertData.lock_pin_hash = bcrypt.hashSync('1234', 10);
          const { error: insertErr } = await supabase.from('app_users').insert([insertData]);
          if (insertErr) throw insertErr;
        }
      } else {
        const insertData = { ...dataPayload };
        if (!insertData.password_hash) insertData.password_hash = bcrypt.hashSync('Admin@123', 10);
        if (!insertData.lock_pin_hash) insertData.lock_pin_hash = bcrypt.hashSync('1234', 10);
        const { error: insertErr } = await supabase.from('app_users').insert([insertData]);
        if (insertErr) {
          if (insertErr.code === '23505') {
            const { error: updateErr } = await supabase.from('app_users').update(insertData).eq('id', id);
            if (updateErr) throw updateErr;
          } else {
            throw insertErr;
          }
        }
      }
    };

    // Execute with automatic schema cache fallback
    try {
      await executeUserDbOp(payload);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes('staff_code') ||
        errMsg.includes('studio_password') ||
        errMsg.includes('schema cache') ||
        err?.code === 'PGRST204' ||
        err?.code === '42703'
      ) {
        console.warn('Supabase app_users schema cache notice, retrying with core columns:', errMsg);
        const fallbackPayload = { ...payload };
        delete fallbackPayload.staff_code;
        delete fallbackPayload.studio_password;
        try {
          await executeUserDbOp(fallbackPayload);
        } catch (retryErr: any) {
          throw new Error(retryErr?.message || 'Failed to save user account in Supabase.');
        }
      } else {
        throw new Error(errMsg);
      }
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_User' : 'Create_User',
      targetEntity: 'app_users',
      targetIdentifier: payload.username,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} login account @${payload.username} (${payload.role_code})${payload.staff_code ? ` linked to staff ${payload.staff_code}` : ''}`,
      justification: 'User credentials and RBAC assignment',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async saveStaffMember(staffMember: any, isEdit: boolean, userName: string, userRole: string) {
    if (!staffMember.staff_code || !staffMember.first_name) {
      throw new Error('Staff Code and First Name are required.');
    }

    const branchId = staffMember.branch_id || 'Aellp-ASI';
    const branchCode = staffMember.branch_code || branchId.replace(/^Aellp-/, '') || 'ASI';
    const lastName = (staffMember.last_name || '').trim() || null;
    const designation = (staffMember.designation || '').trim() || null;
    const departmentName = (staffMember.department_name || '').trim() || null;
    
    // Clean mobile number
    let mobileNumber: string | null = null;
    const rawMobile = (staffMember.mobile_number || '').trim();
    if (rawMobile && rawMobile !== '-' && rawMobile !== '+91' && rawMobile.toLowerCase() !== 'null' && rawMobile.toLowerCase() !== 'na') {
      const digits = rawMobile.replace(/[^0-9]/g, '');
      if (digits.length >= 10) {
        const clean10 = digits.startsWith('91') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
        mobileNumber = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5, 10)}`;
      } else if (digits.length > 0) {
        mobileNumber = rawMobile;
      }
    }

    const payload = {
      staff_code: staffMember.staff_code.trim().toUpperCase(),
      first_name: staffMember.first_name.trim(),
      middle_name: staffMember.middle_name ? staffMember.middle_name.trim() : null,
      last_name: lastName,
      avatar_url: staffMember.avatar_url || null,
      mobile_number: mobileNumber,
      branch_id: branchId,
      branch_code: branchCode,
      department_code: staffMember.department_code || null,
      department_name: departmentName,
      designation: designation,
      is_active: staffMember.is_active ?? true,
    };

    const { error } = await supabase.from('staff_members').upsert([payload]);
    if (error) {
      console.error('Staff member upsert error:', error);
      throw new Error(error.message || 'Failed to save staff member in Supabase.');
    }

    // DIRECT CUT: If staff member is marked inactive/quit, immediately revoke login access
    if (payload.is_active === false) {
      try {
        await supabase
          .from('app_users')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .or(`staff_code.eq.${payload.staff_code},id.eq.${payload.staff_code}`);
        
        await logSecurityEvent({
          userName,
          userRole,
          actionType: 'Update_User',
          targetEntity: 'app_users',
          targetIdentifier: payload.staff_code,
          eventDescription: `Directly revoked login access for inactive/resigned staff ${payload.first_name} ${payload.last_name} (${payload.staff_code})`,
          justification: 'Staff departure / inactivation access cutoff',
        });
      } catch (err) {
        console.warn('Could not deactivate linked user login for staff:', err);
      }
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_User' : 'Create_User',
      targetEntity: 'staff_members',
      targetIdentifier: payload.staff_code,
      eventDescription: `${isEdit ? 'Updated' : 'Added'} staff member ${payload.first_name} ${payload.last_name} (${payload.staff_code})`,
      justification: 'Staff personnel directory update',
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'staff_members' } }));
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async toggleStaffActiveStatus(
    staffCode: string,
    isActive: boolean,
    staffName: string,
    userName: string,
    userRole: string,
    reason?: string
  ) {
    const { error } = await supabase
      .from('staff_members')
      .update({ is_active: isActive })
      .eq('staff_code', staffCode);
    if (error) throw new Error(error.message);

    if (!isActive) {
      // Direct cut/revocation of all linked login accounts
      try {
        await supabase
          .from('app_users')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .or(`staff_code.eq.${staffCode},id.eq.${staffCode}`);
      } catch (e) {
        console.warn('Error revoking login on staff toggle:', e);
      }
    }

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Update_User',
      targetEntity: 'staff_members',
      targetIdentifier: staffCode,
      eventDescription: isActive
        ? `Reactivated staff profile for ${staffName} (${staffCode})`
        : `Deactivated staff member ${staffName} (${staffCode}) and revoked system login access`,
      justification: reason || (isActive ? 'Staff reinstatement' : 'Staff departure / access cutoff'),
    });

    useVoucherStore.getState().invalidateMasterData();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { table: 'staff_members' } }));
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  // --------------------------------------------------------------------------
  // 7. USER & ROLE MANAGEMENT
  // --------------------------------------------------------------------------
  async getAppUsers(): Promise<AppUser[]> {
    let users: AppUser[] = [];
    try {
      const { data } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: true });
      if (data && data.length > 0) users = data;
    } catch (e) {
      console.warn('App users fetch fallback:', e);
    }

    // Merge staff_code mapping from local link registry if column is not yet present on remote DB
    try {
      const linksRaw = localStorage.getItem('asopalav_user_staff_links');
      if (linksRaw) {
        const links = JSON.parse(linksRaw);
        users = users.map((u) => {
          const linkedStaffCode = u.staff_code || links[u.id] || links[u.username?.toLowerCase()];
          return linkedStaffCode ? { ...u, staff_code: linkedStaffCode } : u;
        });
      }
    } catch {
      // Ignore parsing errors
    }

    return users;
  }

  async getAppRoles(): Promise<AppRole[]> {
    try {
      const { data } = await supabase
        .from('app_roles')
        .select('*')
        .order('created_at', { ascending: true });
      if (data && data.length > 0) return data;
    } catch (e) {
      console.warn('App roles fetch fallback:', e);
    }
    return [];
  }

  async getAllRolePermissions(): Promise<RolePermissions[]> {
    try {
      const { data } = await supabase
        .from('role_permissions')
        .select('*');
      if (data && data.length > 0) return data;
    } catch (e) {
      console.warn('Role permissions fetch fallback:', e);
    }
    return [];
  }

  async getRolePermissions(roleCode: string): Promise<RolePermissions | null> {
    try {
      const { data } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role_code', roleCode)
        .maybeSingle();
      return data || null;
    } catch (e) {
      console.warn('Role permissions fetch single fallback:', e);
      return null;
    }
  }

  async saveRole(
    roleData: { role_code: string; role_title: string; description?: string; is_system_role?: boolean },
    permissionsData: Partial<RolePermissions>,
    isEdit: boolean,
    userName: string,
    userRole: string
  ) {
    const roleCode = roleData.role_code.trim();
    if (!roleCode || !roleData.role_title) {
      throw new Error('Role Code and Role Title are required.');
    }

    // 1. Upsert into app_roles
    const rolePayload = {
      role_code: roleCode,
      role_title: roleData.role_title.trim(),
      description: roleData.description?.trim() || null,
      is_system_role: roleData.is_system_role ?? false,
    };
    const { error: roleError } = await supabase.from('app_roles').upsert([rolePayload]);
    if (roleError) throw new Error(roleError.message);

    // 2. Upsert into role_permissions
    const permPayload = {
      role_code: roleCode,
      can_create_voucher: permissionsData.can_create_voucher ?? true,
      can_void_voucher: permissionsData.can_void_voucher ?? false,
      can_backdate_voucher: permissionsData.can_backdate_voucher ?? false,
      can_disburse_advance: permissionsData.can_disburse_advance ?? false,
      can_settle_advance: permissionsData.can_settle_advance ?? false,
      max_advance_limit: Number(permissionsData.max_advance_limit) || 5000,
      can_inject_float: permissionsData.can_inject_float ?? false,
      can_verify_f9_closing: permissionsData.can_verify_f9_closing ?? false,
      can_export_tally: permissionsData.can_export_tally ?? false,
      can_download_hr_payroll: permissionsData.can_download_hr_payroll ?? false,
      can_view_all_branches: permissionsData.can_view_all_branches ?? false,
      can_view_audit_logs: permissionsData.can_view_audit_logs ?? false,
      can_manage_users_roles: permissionsData.can_manage_users_roles ?? false,
      can_manage_periods: permissionsData.can_manage_periods ?? false,
      updated_at: new Date().toISOString(),
    };
    const { error: permError } = await supabase.from('role_permissions').upsert([permPayload]);
    if (permError) throw new Error(permError.message);

    // 3. Security Audit Log
    await logSecurityEvent({
      userName,
      userRole,
      actionType: isEdit ? 'Update_Role' : 'Create_Role',
      targetEntity: 'app_roles',
      targetIdentifier: roleCode,
      eventDescription: `${isEdit ? 'Updated' : 'Created'} role ${roleData.role_title} (${roleCode})`,
      justification: 'RBAC role and permissions configuration',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async deleteRole(roleCode: string, userName: string, userRole: string) {
    const { error } = await supabase.from('app_roles').delete().eq('role_code', roleCode);
    if (error) throw new Error(error.message);

    await logSecurityEvent({
      userName,
      userRole,
      actionType: 'Delete_Role',
      targetEntity: 'app_roles',
      targetIdentifier: roleCode,
      eventDescription: `Deleted role ${roleCode}`,
      justification: 'Role removal from system',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('asopalav:users-roles-updated'));
    }
  }

  async generateNextStaffCode(branchCode: string): Promise<string> {
    try {
      const code = (branchCode || 'ASI').toUpperCase();
      const { data } = await supabase
        .from('staff_members')
        .select('staff_code')
        .eq('branch_code', code);

      let maxNum = 0;
      if (data && data.length > 0) {
        data.forEach((s) => {
          const match = (s.staff_code || '').match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
      }
      const nextNum = maxNum + 1;
      const padded = String(nextNum).padStart(3, '0');
      return `${code}-${padded}`;
    } catch (e) {
      return `${branchCode || 'ASI'}-001`;
    }
  }

  async getStaffMembers(branchId?: string): Promise<StaffMember[]> {
    try {
      let query = supabase
        .from('staff_members')
        .select('*')
        .eq('is_active', true)
        .order('first_name', { ascending: true });

      if (branchId && branchId !== 'ALL') {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;
      if (data && data.length > 0) return data;
    } catch (e) {
      console.warn('Staff members fetch fallback:', e);
    }
    return [];
  }

  // --------------------------------------------------------------------------
  // 8. BULK MASTER DATA IMPORT
  // --------------------------------------------------------------------------
  async bulkImportMasterData(
    classification: 'categories' | 'departments' | 'couriers' | 'payments' | 'staff' | 'branches',
    records: any[],
    userName: string,
    userRole: string
  ): Promise<{ success: boolean; insertedCount: number; skippedCount?: number; message: string }> {
    if (!records || records.length === 0) {
      return { success: false, insertedCount: 0, message: 'No records to import.' };
    }

    try {
      let targetTable = '';
      let formattedRecords: any[] = [];

      switch (classification) {
        case 'categories':
          targetTable = 'expense_categories';
          formattedRecords = records.map((r) => ({
            category_name: typeof r === 'string' ? r.trim() : (r.category_name || r.name || '').trim(),
            color_theme: r.color_theme || 'Vanilla',
            is_active: true,
          }));
          break;

        case 'departments':
          targetTable = 'departments';
          formattedRecords = records.map((r) => {
            const rawName = typeof r === 'string' ? r.trim() : (r.department_name || r.name || '').trim();
            const rawCode = (typeof r === 'object' && r.department_code) 
              ? r.department_code.trim() 
              : rawName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20);
            return {
              department_code: rawCode || 'DEPT',
              department_name: rawName || rawCode,
              is_active: true,
            };
          });
          break;

        case 'couriers':
          targetTable = 'courier_partners';
          formattedRecords = records.map((r) => {
            const rawName = typeof r === 'string' ? r.trim() : (r.partner_name || r.name || '').trim();
            const rawCode = (typeof r === 'object' && r.partner_code)
              ? r.partner_code.trim()
              : rawName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20);
            
            let phone: string | null = null;
            const rawPhone = typeof r === 'object' && (r.contact_phone || r.phone || r.mobile) ? String(r.contact_phone || r.phone || r.mobile).trim() : null;
            if (rawPhone && rawPhone !== '-' && rawPhone !== '+91' && rawPhone.toLowerCase() !== 'null' && rawPhone.toLowerCase() !== 'na') {
              const digits = rawPhone.replace(/[^0-9]/g, '');
              if (digits.length >= 10) {
                const clean10 = digits.startsWith('91') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
                phone = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5, 10)}`;
              } else if (digits.length > 0) {
                phone = rawPhone;
              }
            }

            return {
              partner_code: rawCode || 'COU',
              partner_name: rawName,
              contact_phone: phone,
              is_active: true,
            };
          });
          break;

        case 'payments':
          targetTable = 'payment_methods';
          formattedRecords = records.map((r) => ({
            method_name: typeof r === 'string' ? r.trim() : (r.method_name || r.name || '').trim(),
            is_active: true,
          }));
          break;

        case 'staff':
          targetTable = 'staff_members';
          formattedRecords = records.map((r, i) => {
            const code = (r.staff_code || `STF-${1000 + i}`).trim().toUpperCase();
            const firstName = (r.first_name || (r.name ? r.name.split(' ')[0] : '')).trim();
            const middleName = r.middle_name ? String(r.middle_name).trim() : null;
            const lastName = r.last_name ? String(r.last_name).trim() : null;
            
            // Clean mobile number without fake defaults
            let mobile: string | null = null;
            const rawMobile = r.mobile_number || r.mobile || r.phone || r.phone_number || r.contact_phone;
            if (rawMobile) {
              const str = String(rawMobile).trim();
              const digits = str.replace(/[^0-9]/g, '');
              if (digits.length >= 10) {
                const clean10 = digits.startsWith('91') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
                mobile = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5, 10)}`;
              } else if (str !== '-' && str !== '+91' && str.toLowerCase() !== 'null' && str.toLowerCase() !== 'na' && digits.length > 0) {
                mobile = str;
              }
            }

            const departmentName = r.department_name ? String(r.department_name).trim() : null;
            const designation = r.designation ? String(r.designation).trim() : null;
            const branchId = r.branch_id || 'Aellp-ASI';
            const branchCode = r.branch_code || (branchId.replace(/^Aellp-/, '') || 'ASI');

            return {
              staff_code: code,
              first_name: firstName,
              middle_name: middleName || null,
              last_name: lastName || null,
              mobile_number: mobile || null,
              branch_id: branchId,
              branch_code: branchCode,
              department_name: departmentName || null,
              designation: designation || null,
              is_active: r.is_active ?? true,
            };
          });
          break;

        case 'branches':
          targetTable = 'branches';
          formattedRecords = records.map((r) => {
            const code = (r.branch_code || 'ASI').toUpperCase();
            const id = r.branch_id || `Aellp-${code}`;
            return {
              branch_id: id,
              branch_code: code,
              branch_name: r.branch_name || `Asopalav - ${code}`,
              short_name: r.short_name || code,
              entity_company_name: 'Asopalav Endeavours LLP',
              accountant_name: r.accountant_name || 'Showroom Accountant',
              contact_phone: r.contact_phone || '+91 9925009050',
              contact_email: r.contact_email || 'account@asopalav.com',
              city: r.city || 'Ahmedabad',
              state: r.state || 'Gujarat',
              address: r.address || `${code} Showroom, Gujarat`,
              min_cash_threshold: Number(r.min_cash_threshold) || 3000,
              is_active: true,
            };
          });
          break;
      }

      // SMART DUPLICATE CHECK: Query existing database records to prevent duplicate creation
      const existingSet = new Set<string>();
      try {
        if (classification === 'staff') {
          const { data } = await supabase.from('staff_members').select('staff_code');
          (data || []).forEach((s: any) => {
            if (s.staff_code) existingSet.add(s.staff_code.trim().toUpperCase());
          });
        } else if (classification === 'categories') {
          const { data } = await supabase.from('expense_categories').select('category_name');
          (data || []).forEach((c: any) => {
            if (c.category_name) existingSet.add(c.category_name.trim().toLowerCase());
          });
        } else if (classification === 'departments') {
          const { data } = await supabase.from('departments').select('department_code, department_name');
          (data || []).forEach((d: any) => {
            if (d.department_code) existingSet.add(d.department_code.trim().toUpperCase());
            if (d.department_name) existingSet.add(d.department_name.trim().toUpperCase());
          });
        } else if (classification === 'couriers') {
          const { data } = await supabase.from('courier_partners').select('partner_code, partner_name');
          (data || []).forEach((c: any) => {
            if (c.partner_code) existingSet.add(c.partner_code.trim().toUpperCase());
            if (c.partner_name) existingSet.add(c.partner_name.trim().toUpperCase());
          });
        } else if (classification === 'branches') {
          const { data } = await supabase.from('branches').select('branch_code, branch_id');
          (data || []).forEach((b: any) => {
            if (b.branch_code) existingSet.add(b.branch_code.trim().toUpperCase());
            if (b.branch_id) existingSet.add(b.branch_id.trim().toUpperCase());
          });
        }
      } catch (checkErr) {
        console.warn('Could not query existing records prior to bulk import:', checkErr);
      }

      // Separate records into new vs already existing / in-batch duplicates
      const seenInBatch = new Set<string>();
      const newRecords: any[] = [];
      const duplicateRecords: any[] = [];

      for (const rec of formattedRecords) {
        let uniqueKey = '';
        if (classification === 'staff') {
          uniqueKey = (rec.staff_code || '').trim().toUpperCase();
        } else if (classification === 'categories') {
          uniqueKey = (rec.category_name || '').trim().toLowerCase();
        } else if (classification === 'departments') {
          uniqueKey = (rec.department_code || rec.department_name || '').trim().toUpperCase();
        } else if (classification === 'couriers') {
          uniqueKey = (rec.partner_code || rec.partner_name || '').trim().toUpperCase();
        } else if (classification === 'branches') {
          uniqueKey = (rec.branch_code || rec.branch_id || '').trim().toUpperCase();
        }

        if (!uniqueKey || existingSet.has(uniqueKey) || seenInBatch.has(uniqueKey)) {
          duplicateRecords.push(rec);
        } else {
          seenInBatch.add(uniqueKey);
          newRecords.push(rec);
        }
      }

      // If all records already exist in the database, reject the import with an error
      if (newRecords.length === 0) {
        return {
          success: false,
          insertedCount: 0,
          skippedCount: duplicateRecords.length,
          message: `Duplicate Import Rejected: All ${duplicateRecords.length} record(s) already exist in your database. No new records were created.`,
        };
      }

      // Insert only the truly new records into Asopalav
      if (targetTable && newRecords.length > 0) {
        const { error } = await supabase.from(targetTable).insert(newRecords);
        if (error) {
          console.error(`Direct insert error in ${targetTable}:`, error);
          throw new Error(error.message || `Database error while saving records into ${targetTable}.`);
        }
      }

      // Audit Log
      await logSecurityEvent({
        userName,
        userRole,
        actionType: 'Bulk_Import_Master_Data',
        targetEntity: targetTable || classification,
        targetIdentifier: `${newRecords.length} new records (${duplicateRecords.length} duplicates skipped)`,
        eventDescription: `Bulk imported ${newRecords.length} new records into ${classification} (${duplicateRecords.length} existing in database skipped)`,
        justification: 'Automated Master Data spreadsheet import with duplicate prevention',
      });

      // Dispatch global window event for live refresh
      window.dispatchEvent(new CustomEvent('asopalav:master-data-updated', { detail: { classification } }));

      return {
        success: true,
        insertedCount: newRecords.length,
        skippedCount: duplicateRecords.length,
        message: duplicateRecords.length > 0
          ? `Imported ${newRecords.length} new record(s). ${duplicateRecords.length} item(s) already exist in the database and were skipped.`
          : `Successfully imported all ${newRecords.length} record(s).`,
      };
    } catch (err: any) {
      console.error('Bulk import error:', err);
      return {
        success: false,
        insertedCount: 0,
        message: err.message || 'Failed to import master data.',
      };
    }
  }
}

export const erpService = new ERPService();
