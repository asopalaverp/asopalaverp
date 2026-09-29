import React, { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { erpService } from '@/lib/erpService';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { formatINR, formatDate, printThermalVoucherSlip, numberToWordsINR, triggerHaptic } from '@/lib/utils';
import { ThermalReceiptSlip } from '@/components/ui/ThermalReceiptSlip';
import {
  Printer,
  XCircle,
  Eye,
  CreditCard,
  FileText,
  AlertTriangle,
  Receipt,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Wallet,
  Tag,
  Copy,
  Check,
  Code2,
  FileCode,
  ShieldCheck,
  Smartphone,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { showToast } from '@/components/ui/ToastContainer';
import { useOverrideStore } from '@/store/overrideStore';
import { SegmentedControl } from '@/components/ui';

export const VoucherDetailDrawer: React.FC = () => {
  const { activeDrawerVoucher, closeDrawer, openLightbox } = useUIStore();
  const { user, can } = useAuthStore();
  const { isCashierVoidAllowed } = useOverrideStore();

  const [activeTab, setActiveTab] = useState<'details' | 'thermal_slip'>('details');
  const [activeAction, setActiveAction] = useState<'none' | 'void' | 'delete'>('none');
  const [actionReason, setActionReason] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!activeDrawerVoucher) return null;

  const v = activeDrawerVoucher;
  const isDeveloper = user?.role_code === 'Developer' || user?.role_code === 'Super_Admin';
  const isSuperAdmin = user?.role_code === 'Super_Admin' || isDeveloper;
  const allowCashierVoid = isCashierVoidAllowed();
  const canVoid = can('can_void_voucher') || isSuperAdmin || user?.role_code === 'Store_Manager' || allowCashierVoid;

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    triggerHaptic('light');
    setCopiedCode(label);
    showToast({
      type: 'success',
      title: 'Copied to Clipboard',
      message: `${label} copied.`,
    });
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const handleVoidVoucher = async () => {
    if (!actionReason || actionReason.trim().length < 3) {
      setFeedback({ type: 'error', message: 'Void reason is required (minimum 3 characters).' });
      return;
    }

    setLoadingAction(true);
    setFeedback(null);
    try {
      await erpService.voidVoucher(
        v,
        actionReason.trim(),
        `${user?.first_name} ${user?.last_name}`,
        user?.role_code || 'Super_Admin'
      );
      showToast({
        type: 'success',
        title: 'Voucher Voided',
        message: `Voucher #${v.voucher_number} voided. Funds refunded to ${v.payment_method.replace('_', ' ')}.`,
      });
      setFeedback({
        type: 'success',
        message: `Voucher ${v.voucher_number} voided and ₹${v.total_amount} refunded to ${v.payment_method}.`,
      });
      setTimeout(() => {
        closeDrawer();
      }, 800);
    } catch (err: any) {
      console.error('Error voiding voucher:', err);
      setFeedback({ type: 'error', message: 'Failed to void voucher: ' + (err.message || 'Unknown error') });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeleteVoucher = async () => {
    if (!actionReason || actionReason.trim().length < 3) {
      setFeedback({ type: 'error', message: 'Super Admin deletion reason is mandatory for audit trail.' });
      return;
    }

    setLoadingAction(true);
    setFeedback(null);
    try {
      await erpService.deleteVoucher(
        v,
        `${user?.first_name} ${user?.last_name}`,
        'Super_Admin',
        actionReason.trim()
      );
      showToast({
        type: 'success',
        title: 'Voucher Deleted',
        message: `Voucher #${v.voucher_number} permanently purged from system.`,
      });
      setFeedback({
        type: 'success',
        message: `Voucher ${v.voucher_number} permanently deleted by Super Admin.`,
      });
      setTimeout(() => {
        closeDrawer();
      }, 800);
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Failed to delete voucher: ' + (err.message || 'Unknown error') });
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePrint = () => {
    printThermalVoucherSlip(v);
    showToast({
      type: 'activity',
      title: 'Printing Bill Slip',
      message: `Thermal 80mm slip for Bill #${v.voucher_number} sent to printer.`,
    });
  };

  const statusBadge = (
    <span
      className={cn(
        'px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium border select-none',
        v.status === 'Approved' || !v.status
          ? 'badge-status-emerald'
          : v.status === 'Voided'
          ? 'badge-status-rose'
          : 'badge-status-amber'
      )}
    >
      ● {v.status || 'Approved'}
    </span>
  );

  const drawerFooter = (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 h-10 min-h-[40px] px-4 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] text-slate-900 dark:text-white text-xs font-sans transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-primary" />
          <span>Print Slip</span>
        </button>

        {canVoid && v.status !== 'Voided' && (
          <button
            type="button"
            onClick={() => setActiveAction(activeAction === 'void' ? 'none' : 'void')}
            className="inline-flex items-center gap-1.5 h-10 min-h-[40px] px-4 rounded-[6px] border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-sans transition-colors cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel Bill (Void)</span>
          </button>
        )}

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveAction(activeAction === 'delete' ? 'none' : 'delete')}
            className="inline-flex items-center gap-1.5 h-10 min-h-[40px] px-4 rounded-[6px] border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white text-xs font-sans transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete (Admin)</span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={closeDrawer}
        className="inline-flex items-center gap-1 h-10 min-h-[40px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-medium font-sans transition-colors cursor-pointer shadow-xs"
      >
        <span>Done</span>
      </button>
    </>
  );

  return (
    <SlideOverDrawer
      isOpen={Boolean(activeDrawerVoucher)}
      onClose={closeDrawer}
      title={`Expense Bill #${v.voucher_number}`}
      subtitle={`Recorded ${formatDate(v.payment_date)} • ${v.branch_code} • ${v.payment_method === 'Physical_Cash' ? 'Cash Box' : 'Bank UPI'}`}
      badge={statusBadge}
      copyId={v.voucher_number}
      size="full"
      footer={drawerFooter}
    >
      <div className="max-w-4xl mx-auto w-full space-y-4 text-xs font-sans">
        {/* Navigation Tabs (iOS Segmented Control) */}
        <div className="w-full">
          <SegmentedControl<'details' | 'thermal_slip'>
            options={[
              { id: 'details', label: 'Bill Details' },
              { id: 'thermal_slip', label: 'Print Slip (80mm)' },
            ]}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            size="sm"
          />
        </div>

        {/* Tab 1: Voucher Details */}
        {activeTab === 'details' && (
          <div className="space-y-4 font-sans">
            {/* Amount Hero Card */}
            <div className="p-4 rounded-[12px] bg-slate-50 dark:bg-[#171717] border border-slate-200 dark:border-[#242424] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 block uppercase tracking-wider font-mono">
                  Total Paid
                </span>
                <div className="text-2xl font-mono tabular-nums font-medium text-slate-900 dark:text-white mt-0.5">
                  {formatINR(v.total_amount)}
                </div>
                <p className="text-xs font-sans text-emerald-600 dark:text-[#3ecf8e] mt-0.5 font-medium">
                  {numberToWordsINR(Number(v.total_amount))}
                </p>
              </div>

              <div className="text-left sm:text-right space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-white dark:bg-[#202020] border border-slate-200 dark:border-[#2e2e2e] text-xs font-mono text-slate-900 dark:text-white">
                  {v.payment_method === 'Physical_Cash' ? (
                    <>
                      <Wallet className="w-3.5 h-3.5 text-amber-500" />
                      <span>Cash</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                      <span>UPI</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Key Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Paid To
                </span>
                <span className="text-xs font-medium text-slate-900 dark:text-white block font-sans">
                  {v.recipient_name}
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Branch
                </span>
                <span className="text-xs font-mono font-medium text-slate-900 dark:text-white block">
                  {v.branch_code}
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Category
                </span>
                <span className="text-xs font-medium text-emerald-600 dark:text-[#3ecf8e] block font-sans">
                  {v.category_name}
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Department
                </span>
                <span className="text-xs font-medium text-slate-900 dark:text-white block font-sans">
                  {v.department_name || 'Main Shop Floor'}
                </span>
              </div>
            </div>

            {/* Bill Info & Staff Requester */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Bill No.
                </span>
                <span className="text-xs font-mono text-slate-900 dark:text-white block">
                  {v.bill_number || 'N/A'}
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Ordered By
                </span>
                <span className="text-xs text-slate-900 dark:text-white font-medium block">
                  {v.requested_by_staff_name ? (
                    <span className="text-emerald-600 dark:text-[#3ecf8e]">
                      {v.requested_by_staff_name} {v.requested_by_staff_code && `(${v.requested_by_staff_code})`}
                    </span>
                  ) : (
                    'Central Counter'
                  )}
                </span>
              </div>

              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Recorded By
                </span>
                <span className="text-xs text-slate-900 dark:text-white block">
                  {v.created_by_name || 'Cashier'}
                </span>
              </div>
            </div>

            {/* Multi-Vendor Line Items Breakdown if present */}
            {v.vendor_splits && v.vendor_splits.length > 0 && (
              <div className="p-3.5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                    Vendor Bills ({v.vendor_splits.length})
                  </span>
                  <span className="text-xs font-mono font-medium text-emerald-600 dark:text-[#3ecf8e]">
                    Total: ₹{formatINR(v.total_amount)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#262626] text-[10px] font-mono text-slate-400 uppercase">
                        <th className="py-1.5 px-2">#</th>
                        <th className="py-1.5 px-2">Vendor</th>
                        <th className="py-1.5 px-2">Category</th>
                        <th className="py-1.5 px-2">Dept</th>
                        <th className="py-1.5 px-2">Bill / Details</th>
                        <th className="py-1.5 px-2 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#222]">
                      {v.vendor_splits.map((vs: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-[#1f1f1f]">
                          <td className="py-1.5 px-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-900 dark:text-white">{vs.vendor_name}</td>
                          <td className="py-1.5 px-2 text-slate-600 dark:text-zinc-300">{vs.category_name}</td>
                          <td className="py-1.5 px-2 text-slate-500 dark:text-zinc-400">{vs.department_name || '-'}</td>
                          <td className="py-1.5 px-2 font-mono text-[11px] text-slate-500">{vs.bill_number || vs.description || '-'}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-semibold text-slate-900 dark:text-white">₹{formatINR(vs.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Courier info if present */}
            {v.courier_partner_name && (
              <div className="p-3 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-slate-900 dark:text-white font-medium">{v.courier_partner_name}</span>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">Parcel Logistics</span>
              </div>
            )}

            {/* Remarks Section */}
            {v.remarks && (
              <div className="p-3.5 rounded-[8px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-1 shadow-xs">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 block">
                  Notes
                </span>
                <p className="text-xs text-slate-900 dark:text-white font-sans leading-relaxed">
                  {v.remarks}
                </p>
              </div>
            )}

            {/* Bill Evidence Photo Attachments */}
            {v.bill_photo_urls && v.bill_photo_urls.length > 0 && (
              <div className="space-y-2 p-3.5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 block">
                    Attached Bill Photo ({v.bill_photo_urls.length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">Click to zoom</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {v.bill_photo_urls.map((url: string, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => openLightbox(url)}
                      className="relative h-20 rounded-[6px] overflow-hidden border border-slate-200 dark:border-[#2e2e2e] cursor-pointer group bg-slate-100 dark:bg-[#202020]"
                    >
                      <img src={url} alt={`Bill #${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Eye className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Void / Delete Confirmation Form */}
            {activeAction !== 'none' && (
              <div className="p-3.5 rounded-[8px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 space-y-2 font-sans text-xs">
                <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>
                    Confirm {activeAction === 'void' ? 'Voucher Void & Till Reversal' : 'Permanent Deletion (Super Admin)'}
                  </span>
                </div>
                <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                  {activeAction === 'void'
                    ? 'Voiding this voucher will immediately refund ₹' + v.total_amount + ' back into the branch cash/UPI wallet balance and record a tamper-proof audit log.'
                    : 'Permanent deletion is restricted to Super Admin and removes this voucher permanently.'}
                </p>
                <textarea
                  rows={2}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={`Mandatory reason for ${activeAction === 'void' ? 'voiding' : 'deleting'} voucher...`}
                  className="w-full bg-white dark:bg-[#141414] border border-rose-300 dark:border-rose-500/40 rounded-[6px] p-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveAction('none')}
                    className="px-3 py-1 rounded-[4px] border border-slate-300 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] text-slate-700 dark:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loadingAction}
                    onClick={activeAction === 'void' ? handleVoidVoucher : handleDeleteVoucher}
                    className="px-3.5 py-1 rounded-[4px] bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer"
                  >
                    {loadingAction ? 'Processing...' : `Confirm ${activeAction === 'void' ? 'Void' : 'Delete'}`}
                  </button>
                </div>
              </div>
            )}

            {/* Feedback Message */}
            {feedback && (
              <div
                className={cn(
                  'p-3 rounded-[6px] border font-sans text-xs font-medium',
                  feedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-900 dark:text-rose-200'
                )}
              >
                {feedback.message}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: 80mm Thermal Receipt Slip Preview */}
        {activeTab === 'thermal_slip' && (
          <div className="space-y-3 font-sans">
            <div className="flex items-center justify-between p-2 rounded-[6px] bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#2e2e2e]">
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                80mm Thermal Slip Layout
              </span>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-sans font-medium cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Slip</span>
              </button>
            </div>
            <div className="max-w-xs mx-auto">
              <ThermalReceiptSlip voucher={v} />
            </div>
          </div>
        )}
      </div>
    </SlideOverDrawer>
  );
};
