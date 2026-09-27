import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useOverrideStore } from '@/store/overrideStore';
import { erpService } from '@/lib/erpService';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Check,
  Building2,
  Wallet,
  ArrowRight,
  Sparkles,
  Printer,
} from 'lucide-react';

interface BatchRow {
  id: string;
  voucherNumber: string;
  payee: string;
  category: string;
  department: string;
  billNumber: string;
  amount: number | '';
  remarks: string;
}

interface MultiBillBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: { category_name: string }[];
  departments: { department_name: string }[];
  currentCashBalance: number;
  currentUpiBalance: number;
  onSuccess?: () => void;
}

const COMMON_CATEGORIES = [
  'Tea & Refreshments',
  'Auto & Local Conveyance',
  'Tailoring & Alterations',
  'Courier & Logistics',
  'Showroom Cleaning & Housekeeping',
  'Stationery & Office Supplies',
];

export const MultiBillBatchModal: React.FC<MultiBillBatchModalProps> = ({
  isOpen,
  onClose,
  categories,
  departments,
  currentCashBalance,
  currentUpiBalance,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const { selectedBranchId, getActiveBranch } = useBranchStore();
  const { is40A3ExceededAllowed, isNegativeWalletAllowed } = useOverrideStore();

  const activeBranch = getActiveBranch();
  const branchCode = activeBranch?.branch_code || 'ASI';
  const branchId = activeBranch?.branch_id || selectedBranchId;

  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<'Physical_Cash' | 'Online_UPI'>('Physical_Cash');
  const [startVoucherDigits, setStartVoucherDigits] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedBatch, setSubmittedBatch] = useState<{ count: number; total: number; numbers: string[] } | null>(null);

  // Initialize with 3 rows
  const [rows, setRows] = useState<BatchRow[]>([
    { id: '1', voucherNumber: '', payee: '', category: 'Tea & Refreshments', department: '', billNumber: '', amount: '', remarks: '' },
    { id: '2', voucherNumber: '', payee: '', category: 'Tea & Refreshments', department: '', billNumber: '', amount: '', remarks: '' },
    { id: '3', voucherNumber: '', payee: '', category: 'Tea & Refreshments', department: '', billNumber: '', amount: '', remarks: '' },
  ]);

  // Update voucher numbers when starting number changes
  useEffect(() => {
    if (!startVoucherDigits) return;
    const startNum = parseInt(startVoucherDigits, 10);
    if (isNaN(startNum)) return;

    setRows((prev) =>
      prev.map((r, idx) => {
        const num = String(startNum + idx).padStart(5, '0');
        return {
          ...r,
          voucherNumber: `${branchCode}-${new Date().getFullYear()}-${num}`,
        };
      })
    );
  }, [startVoucherDigits, branchCode]);

  if (!isOpen) return null;

  const totalBatchAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const activeTillBalance = paymentMethod === 'Physical_Cash' ? currentCashBalance : currentUpiBalance;
  const balanceAfterBatch = activeTillBalance - totalBatchAmount;
  const isOverdraft = balanceAfterBatch < 0 && !isNegativeWalletAllowed();

  const handleAddRow = () => {
    triggerHaptic('light');
    const nextIdx = rows.length;
    let nextVoucher = '';
    if (startVoucherDigits) {
      const startNum = parseInt(startVoucherDigits, 10);
      if (!isNaN(startNum)) {
        nextVoucher = `${branchCode}-${new Date().getFullYear()}-${String(startNum + nextIdx).padStart(5, '0')}`;
      }
    }
    const lastCategory = rows[rows.length - 1]?.category || 'Tea & Refreshments';

    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        voucherNumber: nextVoucher,
        payee: '',
        category: lastCategory,
        department: '',
        billNumber: '',
        amount: '',
        remarks: '',
      },
    ]);
  };

  const handleDuplicateRow = (idx: number) => {
    triggerHaptic('light');
    const source = rows[idx];
    const newRows = [...rows];
    newRows.splice(idx + 1, 0, {
      ...source,
      id: crypto.randomUUID(),
      amount: '',
      voucherNumber: '',
    });
    setRows(newRows);
  };

  const handleDeleteRow = (id: string) => {
    if (rows.length <= 1) {
      showToast({ type: 'warning', title: 'Minimum Row Required', message: 'Batch must contain at least one bill.' });
      return;
    }
    triggerHaptic('medium');
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof BatchRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleBulkSetCategory = (cat: string) => {
    triggerHaptic('selection');
    setRows((prev) => prev.map((r) => ({ ...r, category: cat })));
    showToast({ type: 'info', title: 'Category Applied', message: `Set all rows to "${cat}"` });
  };

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validation
    const validRows = rows.filter((r) => (Number(r.amount) > 0) || r.payee.trim());
    if (validRows.length === 0) {
      showToast({ type: 'error', title: 'Empty Batch', message: 'Please enter at least one bill with payee and amount.' });
      return;
    }

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      if (!r.payee.trim()) {
        showToast({ type: 'error', title: 'Missing Payee', message: `Row #${i + 1} requires a payee/vendor name.` });
        return;
      }
      if (!r.amount || Number(r.amount) <= 0) {
        showToast({ type: 'error', title: 'Invalid Amount', message: `Row #${i + 1} amount must be greater than zero.` });
        return;
      }
      if (paymentMethod === 'Physical_Cash' && Number(r.amount) > 10000 && !is40A3ExceededAllowed()) {
        showToast({
          type: 'error',
          title: 'Section 40A(3) Limit Exceeded',
          message: `Row #${i + 1} for ₹${Number(r.amount).toLocaleString('en-IN')} exceeds the ₹10,000 cash statutory limit.`,
        });
        return;
      }
      if (!r.voucherNumber.trim()) {
        showToast({ type: 'error', title: 'Missing Voucher Number', message: `Row #${i + 1} requires a voucher number.` });
        return;
      }
    }

    if (isOverdraft) {
      showToast({
        type: 'error',
        title: 'Insufficient Till Balance',
        message: `Total batch sum ₹${totalBatchAmount.toLocaleString('en-IN')} exceeds available drawer cash ₹${activeTillBalance.toLocaleString('en-IN')}.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await erpService.createBatchVouchersWithLedger({
        branch_id: branchId,
        branch_code: branchCode,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        userName: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Cashier',
        userRole: user?.role_code || 'Cashier',
        items: validRows.map((r) => ({
          voucher_number: r.voucherNumber.trim(),
          recipient_name: r.payee.trim(),
          category_name: r.category.trim() || 'General Expenses',
          department_name: r.department.trim() || null,
          department_code: null,
          bill_number: r.billNumber.trim() || null,
          amount: Number(r.amount),
          remarks: r.remarks.trim() || 'Rush Mode Multi-Bill entry',
        })),
      });

      triggerHaptic('heavy');
      showToast({
        type: 'success',
        title: 'Batch Created Successfully!',
        message: `Recorded ${res.createdVouchers.length} vouchers totaling ₹${res.totalBatchAmount.toLocaleString('en-IN')}.`,
      });

      setSubmittedBatch({
        count: res.createdVouchers.length,
        total: res.totalBatchAmount,
        numbers: res.createdVouchers.map((v) => v.voucher_number),
      });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      triggerHaptic('error');
      showToast({
        type: 'error',
        title: 'Batch Creation Failed',
        message: err?.message || 'Could not record batch vouchers.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150 select-none font-sans">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-[16px] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#262626] bg-slate-50/50 dark:bg-[#181818] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 fill-amber-500/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Rush Mode — Multi-Bill Batch Entry</span>
                </h2>
                <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium">
                  High-Speed Counter
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5 font-sans">
                Quickly record multiple petty cash vouchers in a single till payout without closing the window.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submittedBatch ? (
          /* Success Screen */
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shadow-sm">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                Batch Successfully Recorded!
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#888888] mt-1 font-mono">
                {submittedBatch.count} vouchers created • Total Paid: ₹{submittedBatch.total.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#1a1a1a] rounded-[8px] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-600 dark:text-zinc-400 max-w-md w-full max-h-32 overflow-y-auto text-left space-y-1">
              {submittedBatch.numbers.map((num, i) => (
                <div key={num} className="flex items-center justify-between">
                  <span>Bill #{i + 1}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{num}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSubmittedBatch(null);
                  setRows([
                    { id: '1', voucherNumber: '', payee: '', category: 'Tea & Refreshments', department: '', billNumber: '', amount: '', remarks: '' },
                    { id: '2', voucherNumber: '', payee: '', category: 'Tea & Refreshments', department: '', billNumber: '', amount: '', remarks: '' },
                  ]);
                }}
                className="h-9 px-4 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#202020] text-xs font-medium hover:bg-slate-100 dark:hover:bg-[#282828] transition-colors cursor-pointer"
              >
                Enter Another Batch
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-medium transition-colors cursor-pointer shadow-xs"
              >
                Done & Return to Counter
              </button>
            </div>
          </div>
        ) : (
          /* Batch Entry Form */
          <form onSubmit={handleSubmitBatch} className="flex-1 flex flex-col overflow-hidden">
            {/* Batch Controls Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-[#262626] bg-slate-50/70 dark:bg-[#181818] grid grid-cols-1 sm:grid-cols-4 gap-3 relative z-20">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 block mb-1">
                  Payment Date
                </label>
                <DatePicker
                  value={paymentDate}
                  onChange={setPaymentDate}
                  size="sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 block mb-1">
                  Starting Bill Book No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. 00142"
                  value={startVoucherDigits}
                  onChange={(e) => setStartVoucherDigits(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-8 px-2.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-xs font-mono text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 block mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full h-8 px-2.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-xs font-sans text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none cursor-pointer"
                >
                  <option value="Physical_Cash">Physical Cash Drawer</option>
                  <option value="Online_UPI">Online / Shop UPI</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 block mb-1">
                  Quick Category Preset
                </label>
                <select
                  onChange={(e) => {
                    if (e.target.value) handleBulkSetCategory(e.target.value);
                  }}
                  defaultValue=""
                  className="w-full h-8 px-2 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-xs text-slate-700 dark:text-zinc-300 focus:border-[#3ecf8e] focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>Set All Rows To...</option>
                  {COMMON_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rows Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto p-4 space-y-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262626] text-[11px] font-mono uppercase text-slate-500 dark:text-[#888888]">
                    <th className="pb-2 w-8 text-center">#</th>
                    <th className="pb-2 w-32">Voucher #</th>
                    <th className="pb-2 min-w-[140px]">Payee / Vendor</th>
                    <th className="pb-2 min-w-[140px]">Category</th>
                    <th className="pb-2 w-28">Bill Ref #</th>
                    <th className="pb-2 w-28 text-right">Amount (₹)</th>
                    <th className="pb-2 min-w-[130px]">Remarks</th>
                    <th className="pb-2 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#202020]">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="group hover:bg-slate-50/50 dark:hover:bg-[#1a1a1a]/50">
                      <td className="py-1.5 text-center font-mono text-[11px] text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.voucherNumber}
                          onChange={(e) => handleUpdateRow(row.id, 'voucherNumber', e.target.value)}
                          placeholder={`${branchCode}-2026-00000`}
                          className="w-full h-7 px-2 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] font-mono text-[11px] text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.payee}
                          onChange={(e) => handleUpdateRow(row.id, 'payee', e.target.value)}
                          placeholder="e.g. Raju Tea Stall"
                          className="w-full h-7 px-2 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-xs text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          list="categories-datalist"
                          value={row.category}
                          onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)}
                          placeholder="Category"
                          className="w-full h-7 px-2 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-xs text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.billNumber}
                          onChange={(e) => handleUpdateRow(row.id, 'billNumber', e.target.value)}
                          placeholder="Optional"
                          className="w-full h-7 px-2 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-[11px] font-mono text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="1"
                          step="any"
                          value={row.amount}
                          onChange={(e) => handleUpdateRow(row.id, 'amount', e.target.value ? Number(e.target.value) : '')}
                          placeholder="0.00"
                          className={cn(
                            "w-full h-7 px-2 rounded-[4px] border text-right font-mono text-xs focus:outline-none",
                            Number(row.amount) > 10000 && paymentMethod === 'Physical_Cash'
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
                              : "border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-slate-900 dark:text-white focus:border-[#3ecf8e]"
                          )}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => handleUpdateRow(row.id, 'remarks', e.target.value)}
                          placeholder="Particulars"
                          className="w-full h-7 px-2 rounded-[4px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] text-xs text-slate-900 dark:text-white focus:border-[#3ecf8e] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(idx)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                            title="Duplicate Row"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete Row"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <datalist id="categories-datalist">
                {categories.map((c) => (
                  <option key={c.category_name} value={c.category_name} />
                ))}
              </datalist>

              <button
                type="button"
                onClick={handleAddRow}
                className="mt-2 h-7 px-3 rounded-[4px] border border-dashed border-slate-300 dark:border-[#333] hover:border-emerald-500 text-slate-600 dark:text-zinc-400 hover:text-emerald-700 dark:hover:text-[#3ecf8e] text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Row (Enter)</span>
              </button>
            </div>

            {/* Sticky Bottom Summary Bar */}
            <div className="p-4 border-t border-slate-200 dark:border-[#262626] bg-slate-50/80 dark:bg-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 dark:text-[#888888] block text-[10px] uppercase">Bills in Batch</span>
                  <strong className="text-slate-900 dark:text-white">{rows.length} bills</strong>
                </div>

                <div className="border-l border-slate-200 dark:border-[#2c2c2c] pl-4">
                  <span className="text-slate-500 dark:text-[#888888] block text-[10px] uppercase">Batch Total Payout</span>
                  <strong className="text-base text-emerald-600 dark:text-[#3ecf8e]">
                    ₹{totalBatchAmount.toLocaleString('en-IN')}
                  </strong>
                </div>

                <div className="border-l border-slate-200 dark:border-[#2c2c2c] pl-4 hidden md:block">
                  <span className="text-slate-500 dark:text-[#888888] block text-[10px] uppercase">Current Till Balance</span>
                  <span className="text-slate-700 dark:text-zinc-300">
                    ₹{activeTillBalance.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="border-l border-slate-200 dark:border-[#2c2c2c] pl-4 hidden md:block">
                  <span className="text-slate-500 dark:text-[#888888] block text-[10px] uppercase">Balance After Payout</span>
                  <span className={cn("font-medium", balanceAfterBatch < 0 ? "text-rose-500" : "text-slate-700 dark:text-zinc-300")}>
                    ₹{balanceAfterBatch.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-3.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || totalBatchAmount <= 0}
                  className="h-9 px-5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] disabled:opacity-50 text-[#171717] font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <span>Recording Batch...</span>
                  ) : (
                    <>
                      <span>Record Batch & Disburse Till</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
