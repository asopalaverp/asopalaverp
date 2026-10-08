import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore, isPrivilegedAdminRole } from '@/store/authStore';
import { erpService } from '@/lib/erpService';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { formatINR, formatDate, numberToWordsINR, triggerHaptic } from '@/lib/utils';
import { useVouchers } from '@/hooks/useVouchers';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StaffSplitTable, SplitItem } from '@/components/vouchers/StaffSplitTable';
import { VendorSplitTable } from '@/components/vouchers/VendorSplitTable';
import { VendorSplitItem } from '@/types/database';
import {
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
  Check,
  Code2,
  FileCode,
  ShieldCheck,
  Smartphone,
  Truck,
  Edit3,
  Save,
  Undo,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import { useOverrideStore } from '@/store/overrideStore';

function parseLegacyStaffSplits(voucher: any, staffList: any[]): SplitItem[] {
  if (!voucher) return [];
  const recipient = voucher.recipient_name || '';
  const totalAmount = Number(voucher.total_amount) || 0;

  let names: string[] = [];
  // 1. Check parenthesized format: "7 Staff (Sagar, Ramesh, Merajbhai, PARMAL, HARSH, Prakash, Bharat)"
  const parenMatch = recipient.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    names = parenMatch[1].split(',').map((n: string) => n.trim()).filter(Boolean);
  }

  // 2. If no names from recipient, check remarks if separated by '/' or ','
  if (names.length === 0 && voucher.remarks && (voucher.remarks.includes('/') || voucher.remarks.includes(','))) {
    const delimiter = voucher.remarks.includes('/') ? '/' : ',';
    const rawParts = voucher.remarks.split(delimiter).map((n: string) => n.trim()).filter(Boolean);
    if (rawParts.length >= 2) {
      names = rawParts;
    }
  }

  if (names.length === 0) return [];

  const perPerson = names.length > 0 ? Math.floor(totalAmount / names.length) : 0;
  const remainder = names.length > 0 ? totalAmount - perPerson * names.length : 0;

  return names.map((rawName: string, idx: number) => {
    const cleanName = rawName.replace(/^staff\s*[:-]?\s*/i, '').trim();
    const matched = staffList.find(
      (s: any) =>
        (s.staff_code && s.staff_code.toLowerCase() === cleanName.toLowerCase()) ||
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(cleanName.toLowerCase()) ||
        cleanName.toLowerCase().includes(s.first_name.toLowerCase())
    );

    return {
      staffCode: matched ? matched.staff_code : '',
      staffName: matched ? `${matched.first_name} ${matched.last_name}`.trim() : cleanName,
      departmentName: matched?.department_name || voucher.department_name || 'Store Operations',
      categoryName: voucher.category_name || 'Staff Welfare & Food',
      amount: idx === 0 ? perPerson + remainder : perPerson,
    };
  });
}

function parseLegacyVendorSplits(voucher: any): VendorSplitItem[] {
  if (!voucher) return [];
  const recipient = voucher.recipient_name || '';
  const totalAmount = Number(voucher.total_amount) || 0;

  let names: string[] = [];
  const parenMatch = recipient.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    names = parenMatch[1].split(',').map((n: string) => n.trim()).filter(Boolean);
  }

  if (names.length === 0) return [];

  const perVendor = names.length > 0 ? Math.floor(totalAmount / names.length) : 0;
  const remainder = names.length > 0 ? totalAmount - perVendor * names.length : 0;

  return names.map((vName: string, idx: number) => ({
    vendor_name: vName.trim(),
    category_name: voucher.category_name || 'General Expense',
    department_name: voucher.department_name || 'Main Shop Floor',
    bill_number: voucher.bill_number || '',
    description: voucher.remarks || '',
    amount: idx === 0 ? perVendor + remainder : perVendor,
  }));
}

export const VoucherDetailDrawer: React.FC = () => {
  const { activeDrawerVoucher, setActiveDrawerVoucher, closeDrawer, openLightbox } = useUIStore();
  const { user, can } = useAuthStore();
  const { isCashierVoidAllowed } = useOverrideStore();
  const { categories, departments, staff, couriers, refresh } = useVouchers();

  const [activeAction, setActiveAction] = useState<'none' | 'void' | 'delete'>('none');
  const [actionReason, setActionReason] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false);
  const [editRecipient, setEditRecipient] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editStaffCode, setEditStaffCode] = useState('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editBillNumber, setEditBillNumber] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Physical_Cash' | 'Online_UPI'>('Physical_Cash');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCourier, setEditCourier] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [staffSplits, setStaffSplits] = useState<any[]>([]);
  const [editStaffSplits, setEditStaffSplits] = useState<SplitItem[]>([]);
  const [editVendorSplits, setEditVendorSplits] = useState<VendorSplitItem[]>([]);

  // Populate edit fields when active voucher changes
  useEffect(() => {
    if (activeDrawerVoucher) {
      setEditRecipient(activeDrawerVoucher.recipient_name || '');
      setEditCategory(activeDrawerVoucher.category_name || '');
      setEditDepartment(activeDrawerVoucher.department_name || '');
      setEditStaffCode(activeDrawerVoucher.requested_by_staff_code || '');
      setEditStaffName(activeDrawerVoucher.requested_by_staff_name || '');
      setEditBillNumber(activeDrawerVoucher.bill_number || '');
      setEditPaymentMethod(activeDrawerVoucher.payment_method || 'Physical_Cash');
      setEditPaymentDate(activeDrawerVoucher.payment_date ? activeDrawerVoucher.payment_date.slice(0, 10) : '');
      setEditAmount(Number(activeDrawerVoucher.total_amount) || 0);
      setEditCourier(activeDrawerVoucher.courier_partner_name || '');
      setEditRemarks(activeDrawerVoucher.remarks || '');
      setEditReason('');
      setIsEditing(false);
      setActiveAction('none');
      setFeedback(null);

      // Fetch staff splits if this is a staff voucher
      const isStaffType =
        activeDrawerVoucher.payment_type === 'Staff_Split' ||
        Boolean(activeDrawerVoucher.recipient_name && /\bStaff\b/i.test(activeDrawerVoucher.recipient_name));

      if (isStaffType) {
        erpService.getVoucherSplits(activeDrawerVoucher.voucher_number).then((splits) => {
          let list: any[] = splits || [];
          if (list.length === 0) {
            // Auto-extract from legacy recipient or remarks if database has no split records
            const parsed = parseLegacyStaffSplits(activeDrawerVoucher, staff);
            if (parsed.length > 0) {
              list = parsed.map((p, idx) => ({
                id: `legacy-${activeDrawerVoucher.voucher_number}-${idx}`,
                voucher_number: activeDrawerVoucher.voucher_number,
                branch_id: activeDrawerVoucher.branch_id,
                branch_code: activeDrawerVoucher.branch_code,
                staff_code: p.staffCode,
                staff_name: p.staffName,
                department_name: p.departmentName,
                category_name: p.categoryName,
                amount: p.amount,
                created_at: activeDrawerVoucher.created_at,
              }));
            }
          }

          setStaffSplits(list);
          setEditStaffSplits(
            list.map((s: any) => ({
              staffCode: s.staff_code || s.staffCode || '',
              staffName: s.staff_name || s.staffName || '',
              departmentName: s.department_name || s.departmentName || '',
              categoryName: s.category_name || s.categoryName || '',
              amount: Number(s.amount) || 0,
            }))
          );
        });
      } else {
        setStaffSplits([]);
        setEditStaffSplits([]);
      }

      if (activeDrawerVoucher.vendor_splits && Array.isArray(activeDrawerVoucher.vendor_splits) && activeDrawerVoucher.vendor_splits.length > 0) {
        setEditVendorSplits(activeDrawerVoucher.vendor_splits);
      } else {
        const parsedVendors = parseLegacyVendorSplits(activeDrawerVoucher);
        setEditVendorSplits(parsedVendors);
      }
    }
  }, [activeDrawerVoucher, staff]);

  if (!activeDrawerVoucher) return null;

  const v = activeDrawerVoucher;
  const isPrivileged = isPrivilegedAdminRole(user?.role_code);
  const isDeveloper = isPrivileged;
  const isSuperAdmin = isPrivileged;
  const allowCashierVoid = isCashierVoidAllowed();
  const canVoid = can('can_void_voucher') || isSuperAdmin || user?.role_code === 'Store_Manager' || allowCashierVoid;

  const isStaffVoucher = v.payment_type === 'Staff_Split' || editStaffSplits.length > 0 || staffSplits.length > 0;
  const isMultiVendorVoucher = (v.vendor_splits && v.vendor_splits.length > 0) || editVendorSplits.length > 0;

  const handleSaveEdit = async () => {
    if (isStaffVoucher) {
      if (editStaffSplits.length === 0) {
        setFeedback({ type: 'error', message: 'Please add at least one staff member.' });
        return;
      }
      const invalid = editStaffSplits.find((s) => !s.staffName.trim() || Number(s.amount) <= 0);
      if (invalid) {
        setFeedback({ type: 'error', message: 'All staff split entries must have a valid staff name and amount > ₹0.' });
        return;
      }
    } else if (isMultiVendorVoucher) {
      if (editVendorSplits.length === 0) {
        setFeedback({ type: 'error', message: 'Please add at least one vendor item.' });
        return;
      }
      const invalid = editVendorSplits.find((s) => !s.vendor_name.trim() || Number(s.amount) <= 0);
      if (invalid) {
        setFeedback({ type: 'error', message: 'All vendor split entries must have a vendor name and amount > ₹0.' });
        return;
      }
    } else {
      if (!editRecipient || !editRecipient.trim()) {
        setFeedback({ type: 'error', message: 'Payee / Vendor name is required.' });
        return;
      }
      if (!editCategory || !editCategory.trim()) {
        setFeedback({ type: 'error', message: 'Expense Category is required.' });
        return;
      }
    }

    if (editAmount <= 0) {
      setFeedback({ type: 'error', message: 'Amount must be greater than zero.' });
      return;
    }
    if (!editReason || editReason.trim().length < 3) {
      setFeedback({ type: 'error', message: 'Admin modification justification is mandatory (min 3 chars).' });
      return;
    }

    setSavingEdit(true);
    setFeedback(null);

    try {
      const updates: any = {
        recipient_name: isStaffVoucher
          ? `${editStaffSplits.length} Staff (${editStaffSplits.map((s) => s.staffName.split(' ')[0]).join(', ')})`
          : isMultiVendorVoucher
          ? `${editVendorSplits.length} Vendors (${editVendorSplits.map((v) => v.vendor_name.split(' ')[0]).join(', ')})`
          : editRecipient.trim(),
        category_name: isStaffVoucher
          ? Array.from(new Set(editStaffSplits.map((s) => s.categoryName?.trim()).filter(Boolean))).join(', ') || editCategory || 'Staff Expense'
          : isMultiVendorVoucher
          ? Array.from(new Set(editVendorSplits.map((v) => v.category_name?.trim()).filter(Boolean))).join(', ') || editCategory || 'General Expense'
          : editCategory.trim(),
        department_name: isStaffVoucher
          ? Array.from(new Set(editStaffSplits.map((s) => s.departmentName?.trim()).filter(Boolean))).join(', ') || editDepartment || 'Main Shop Floor'
          : isMultiVendorVoucher
          ? Array.from(new Set(editVendorSplits.map((v) => v.department_name?.trim()).filter(Boolean))).join(', ') || editDepartment || 'Main Shop Floor'
          : editDepartment ? editDepartment.trim() : null,
        requested_by_staff_code: editStaffCode || null,
        requested_by_staff_name: editStaffName || null,
        bill_number: editBillNumber ? editBillNumber.trim() : null,
        payment_method: editPaymentMethod,
        payment_date: editPaymentDate,
        total_amount: editAmount,
        courier_partner_name: editCourier ? editCourier.trim() : null,
        remarks: editRemarks ? editRemarks.trim() : '',
        vendor_splits: isMultiVendorVoucher ? editVendorSplits : undefined,
      };

      await erpService.updateVoucher(
        v.voucher_number,
        updates,
        `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim(),
        user?.role_code || 'Super_Admin',
        editReason.trim(),
        isStaffVoucher ? editStaffSplits : undefined
      );

      // Refresh staff splits view
      if (isStaffVoucher) {
        const freshSplits = await erpService.getVoucherSplits(v.voucher_number);
        setStaffSplits(freshSplits || []);
      }

      const updatedVoucher = {
        ...v,
        ...updates,
      };

      setActiveDrawerVoucher(updatedVoucher);
      setIsEditing(false);
      setFeedback({
        type: 'success',
        message: `Expense Bill #${v.voucher_number} updated successfully.`,
      });
      showToast({
        type: 'success',
        title: 'Bill Updated',
        message: `Voucher #${v.voucher_number} updated in database.`,
      });
      refresh(true);
    } catch (err: any) {
      console.error('Error updating voucher:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to update voucher: ' + (err.message || 'Unknown error'),
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditRecipient(v.recipient_name || '');
    setEditCategory(v.category_name || '');
    setEditDepartment(v.department_name || '');
    setEditStaffCode(v.requested_by_staff_code || '');
    setEditStaffName(v.requested_by_staff_name || '');
    setEditBillNumber(v.bill_number || '');
    setEditPaymentMethod(v.payment_method || 'Physical_Cash');
    setEditPaymentDate(v.payment_date ? v.payment_date.slice(0, 10) : '');
    setEditAmount(Number(v.total_amount) || 0);
    setEditCourier(v.courier_partner_name || '');
    setEditRemarks(v.remarks || '');
    setEditReason('');
    setEditStaffSplits(
      staffSplits.map((s: any) => ({
        staffCode: s.staff_code || '',
        staffName: s.staff_name || '',
        departmentName: s.department_name || '',
        categoryName: s.category_name || '',
        amount: Number(s.amount) || 0,
      }))
    );
    setEditVendorSplits(v.vendor_splits && Array.isArray(v.vendor_splits) ? v.vendor_splits : []);
    setFeedback(null);
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

  const handleStartEdit = () => {
    if (isStaffVoucher && editStaffSplits.length === 0) {
      const parsed = parseLegacyStaffSplits(v, staff);
      if (parsed.length > 0) {
        setEditStaffSplits(parsed);
        setEditAmount(parsed.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
      } else {
        setEditStaffSplits([
          {
            staffCode: v.requested_by_staff_code || '',
            staffName: v.requested_by_staff_name || v.recipient_name || '',
            departmentName: v.department_name || 'Store Operations',
            categoryName: v.category_name || 'Staff Welfare & Food',
            amount: Number(v.total_amount) || 0,
          },
        ]);
      }
    } else if (isMultiVendorVoucher && editVendorSplits.length === 0) {
      const parsed = parseLegacyVendorSplits(v);
      if (parsed.length > 0) {
        setEditVendorSplits(parsed);
        setEditAmount(parsed.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
      }
    }
    setIsEditing(true);
  };

  const drawerFooter = isEditing ? (
    <div className="w-full flex items-center justify-end gap-2.5">
      <button
        type="button"
        onClick={handleCancelEdit}
        className="inline-flex items-center justify-center gap-1.5 h-10 min-h-[40px] px-4 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] text-slate-900 dark:text-white text-xs font-sans transition-colors cursor-pointer"
      >
        <Undo className="w-3.5 h-3.5" />
        <span>Cancel</span>
      </button>

      <button
        type="button"
        disabled={savingEdit}
        onClick={handleSaveEdit}
        className="inline-flex items-center justify-center gap-1.5 h-10 min-h-[40px] px-5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold font-sans transition-colors cursor-pointer shadow-xs disabled:opacity-50"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
      </button>
    </div>
  ) : (
    <div className="w-full flex flex-col gap-2.5">
      {/* Row 1: Admin & Developer Exclusive Action Buttons */}
      {(isPrivileged || canVoid) && (
        <div className="flex items-center gap-2 flex-wrap">
          {isPrivileged && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-[#3ecf8e] text-xs font-medium font-sans transition-colors cursor-pointer shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
              <span>Edit</span>
            </button>
          )}

          {canVoid && v.status !== 'Voided' && (
            <button
              type="button"
              onClick={() => setActiveAction(activeAction === 'void' ? 'none' : 'void')}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-medium font-sans transition-colors cursor-pointer shadow-2xs"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span>Cancel Bill</span>
            </button>
          )}

          {isPrivileged && (
            <button
              type="button"
              onClick={() => setActiveAction(activeAction === 'delete' ? 'none' : 'delete')}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium font-sans transition-colors cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}

      {/* Row 2: Full-width Done Button for All Users */}
      <button
        type="button"
        onClick={closeDrawer}
        className="w-full inline-flex items-center justify-center gap-2 h-10 min-h-[40px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#34b27b] text-[#171717] text-xs font-semibold font-sans transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
      >
        <Check className="w-4 h-4 stroke-[3]" />
        <span>Done</span>
      </button>
    </div>
  );

  return (
    <SlideOverDrawer
      isOpen={Boolean(activeDrawerVoucher)}
      onClose={closeDrawer}
      title={isEditing ? `Edit Bill #${v.voucher_number}` : `Expense Bill #${v.voucher_number}`}
      subtitle={`Recorded ${formatDate(v.payment_date)} • ${v.branch_code} • ${v.payment_method === 'Physical_Cash' ? 'Cash Box' : 'Bank UPI'}`}
      badge={statusBadge}
      size="full"
      footer={drawerFooter}
    >
      <div className="max-w-4xl mx-auto w-full space-y-4 text-xs font-sans">
        {/* EDIT MODE: Full Admin CRUD Form */}
        {isEditing && (
          <div className="space-y-4 font-sans">
            <div className="p-3.5 rounded-[8px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  Editing Expense Voucher #{v.voucher_number}
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 dark:text-[#3ecf8e]">
                Branch: {v.branch_code}
              </span>
            </div>

            {isStaffVoucher ? (
              /* Multi-Staff Split Editor */
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[#282828]">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Staff Multi-Split Allocations ({editStaffSplits.length} members)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Total Calculated:</span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-[#3ecf8e]">
                      {formatINR(editAmount)}
                    </span>
                  </div>
                </div>

                <StaffSplitTable
                  splits={editStaffSplits}
                  staffList={staff}
                  categories={categories}
                  departments={departments}
                  targetAmount={editAmount}
                  onChange={(s) => {
                    setEditStaffSplits(s);
                    const total = s.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                    setEditAmount(total);
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Bill / Invoice No. (Optional)
                    </label>
                    <input
                      type="text"
                      value={editBillNumber}
                      onChange={(e) => setEditBillNumber(e.target.value)}
                      placeholder="e.g. INV-9021"
                      className="w-full h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
                    />
                  </div>
                </div>
              </div>
            ) : isMultiVendorVoucher ? (
              /* Multi-Vendor Split Editor */
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[#282828]">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Multi-Vendor Split Allocations ({editVendorSplits.length} vendors)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Total Calculated:</span>
                    <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                      {formatINR(editAmount)}
                    </span>
                  </div>
                </div>

                <VendorSplitTable
                  splits={editVendorSplits}
                  categories={categories}
                  departments={departments}
                  targetAmount={editAmount}
                  onChange={(s) => {
                    setEditVendorSplits(s);
                    const total = s.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                    setEditAmount(total);
                  }}
                />
              </div>
            ) : (
              /* Standard Single-Vendor Form */
              <>
                {/* Edit Grid: Payee & Amount */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Vendor / Paid To *
                    </label>
                    <input
                      type="text"
                      required
                      value={editRecipient}
                      onChange={(e) => setEditRecipient(e.target.value)}
                      placeholder="e.g. Ramesh Chai / Vendor Name"
                      className="w-full h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Total Amount (₹) *
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-mono text-slate-400 dark:text-zinc-500">₹</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editAmount || ''}
                        onChange={(e) => setEditAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0.00"
                        className="w-full h-10 min-h-[40px] pl-7 pr-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
                      />
                    </div>
                    {editAmount > 0 && (
                      <p className="text-[10px] text-emerald-600 dark:text-[#3ecf8e] font-medium font-sans">
                        {numberToWordsINR(editAmount)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Edit Grid: Category & Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Expense Category *
                    </label>
                    <SearchableSelect
                      value={editCategory}
                      onChange={setEditCategory}
                      options={categories.map((c) => ({
                        value: c.category_name,
                        label: c.category_name,
                      }))}
                      placeholder="Select category..."
                      allowCustom={true}
                      clearable={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Department
                    </label>
                    <SearchableSelect
                      value={editDepartment}
                      onChange={setEditDepartment}
                      options={departments.map((d) => ({
                        value: d.department_name,
                        label: d.department_name,
                      }))}
                      placeholder="Select department..."
                      allowCustom={true}
                      clearable={true}
                    />
                  </div>
                </div>

                {/* Edit Grid: Staff Member & Bill No */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Staff Member (Optional)
                    </label>
                    <SearchableSelect
                      value={editStaffCode}
                      onChange={(val) => {
                        const foundStaff = staff.find((s) => s.staff_code === val);
                        if (foundStaff) {
                          setEditStaffCode(foundStaff.staff_code);
                          setEditStaffName(`${foundStaff.first_name} ${foundStaff.last_name}`.trim());
                        } else {
                          setEditStaffCode(val);
                          setEditStaffName(val);
                        }
                      }}
                      options={staff.map((s) => ({
                        value: s.staff_code,
                        label: `${s.first_name} ${s.last_name}`,
                        subLabel: `${s.staff_code} • ${s.department_name || s.designation || 'Staff'}`,
                      }))}
                      placeholder="Select staff (or leave blank)..."
                      allowCustom={true}
                      clearable={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Bill / Invoice No.
                    </label>
                    <input
                      type="text"
                      value={editBillNumber}
                      onChange={(e) => setEditBillNumber(e.target.value)}
                      placeholder="e.g. INV-9021"
                      className="w-full h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Edit Grid: Payment Method & Payment Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPaymentMethod('Physical_Cash')}
                    className={cn(
                      'h-10 min-h-[40px] rounded-[6px] border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                      editPaymentMethod === 'Physical_Cash'
                        ? 'border-emerald-500 bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e]'
                        : 'border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] text-slate-700 dark:text-zinc-300'
                    )}
                  >
                    <Wallet className="w-3.5 h-3.5 text-amber-500" />
                    <span>Cash Box</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditPaymentMethod('Online_UPI')}
                    className={cn(
                      'h-10 min-h-[40px] rounded-[6px] border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                      editPaymentMethod === 'Online_UPI'
                        ? 'border-emerald-500 bg-[#3ecf8e]/10 text-emerald-700 dark:text-[#3ecf8e]'
                        : 'border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] text-slate-700 dark:text-zinc-300'
                    )}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                    <span>Bank UPI</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={editPaymentDate}
                  onChange={(e) => setEditPaymentDate(e.target.value)}
                  className="w-full h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
                />
              </div>
            </div>

            {/* Courier partner if any */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Courier / Parcel Logistics Partner (Optional)
              </label>
              <input
                type="text"
                value={editCourier}
                onChange={(e) => setEditCourier(e.target.value)}
                placeholder="e.g. Maruti Courier / DTDC"
                className="w-full h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
              />
            </div>

            {/* Remarks / Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Notes / Particulars
              </label>
              <textarea
                rows={2}
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="Details of expense..."
                className="w-full p-2.5 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30"
              />
            </div>

            {/* Audit Justification Reason (Mandatory) */}
            <div className="p-3.5 rounded-[8px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-1.5">
              <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                Mandatory Admin Edit Justification (Audit Log) *
              </label>
              <textarea
                rows={2}
                required
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="State the reason for this bill modification (e.g. Vendor name correction, category change)..."
                className="w-full p-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-amber-300 dark:border-amber-500/40 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Feedback message */}
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

        {/* VIEW MODE: Voucher Details */}
        {!isEditing && (
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

            {/* Staff / Multi-Employee Allocations Breakdown if present */}
            {staffSplits && staffSplits.length > 0 && (
              <div className="p-3.5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#242424] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                    Staff Allocations ({staffSplits.length})
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
                        <th className="py-1.5 px-2">Staff Member</th>
                        <th className="py-1.5 px-2">Department</th>
                        <th className="py-1.5 px-2">Category</th>
                        <th className="py-1.5 px-2 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#222]">
                      {staffSplits.map((s: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-[#1f1f1f]">
                          <td className="py-1.5 px-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-900 dark:text-white">
                            {s.staff_name} {s.staff_code && <span className="font-mono text-slate-400 text-[11px]">({s.staff_code})</span>}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500 dark:text-zinc-400">{s.department_name || '-'}</td>
                          <td className="py-1.5 px-2 text-emerald-600 dark:text-[#3ecf8e] font-medium">{s.category_name || '-'}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-semibold text-slate-900 dark:text-white">₹{formatINR(s.amount)}</td>
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
      </div>
    </SlideOverDrawer>
  );
};
