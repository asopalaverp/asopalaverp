import React, { useState, useEffect, useCallback } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { erpService } from '@/lib/erpService';
import { Branch, AppUser, StaffMember, ExpenseCategory, Department, CourierPartner, AppRole } from '@/types/database';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { SupabaseFieldRow } from '@/components/ui/SupabaseFieldRow';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Trash2,
  AlertCircle,
  Code2,
  Copy,
  Check,
  Save,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { cn, cleanIndianPhoneInput } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';

export type MasterDrawerType = 'branch' | 'category' | 'department' | 'courier' | 'user' | 'staff' | 'role';

export interface MasterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  type: MasterDrawerType;
  record?: any;
  onSuccess: () => void;
}

const tableNames: Record<MasterDrawerType, string> = {
  branch: 'master_branches',
  category: 'expense_categories',
  department: 'master_departments',
  courier: 'master_couriers',
  user: 'users',
  staff: 'master_staff',
  role: 'roles',
};

export const MasterDataDrawer: React.FC<MasterDrawerProps> = ({
  isOpen,
  onClose,
  type,
  record,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const { branches } = useBranchStore();
  const isDeveloper = user?.role_code === 'Developer' || user?.role_code === 'Super_Admin';
  const isSuperAdmin = user?.role_code === 'Super_Admin' || isDeveloper;
  const isEdit = Boolean(record);

  useScrollLock(isOpen);

  const [activeTab, setActiveTab] = useState<'form' | 'developer'>('form');
  const [formData, setFormData] = useState<any>({});
  const [availableRoles, setAvailableRoles] = useState<AppRole[]>([]);
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isCustomStaffCode, setIsCustomStaffCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (type === 'user' || type === 'role') {
        erpService.getAppRoles().then((rolesList) => {
          if (rolesList && rolesList.length > 0) {
            setAvailableRoles(rolesList);
          }
        });
      }
      if (type === 'user') {
        erpService.getStaffMembers().then((staffList) => {
          if (staffList && staffList.length > 0) {
            setAvailableStaff(staffList);
          }
        });
      }
    }
  }, [isOpen, type]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('form');
      setConfirmDelete(false);
      setDeleteReason('');
      setError('');
      setIsCustomStaffCode(false);

      if (record) {
        setFormData({ ...record });
      } else {
        switch (type) {
          case 'branch':
            setFormData({
              branch_name: '',
              branch_code: '',
              city: '',
              state: '',
              gstin: '',
              min_cash_threshold: 0,
              max_cash_ceiling: 0,
              max_upi_ceiling: 0,
              is_active: true,
            });
            break;
          case 'category':
            setFormData({
              category_name: '',
              color_theme: '',
              is_active: true,
            });
            break;
          case 'department':
            setFormData({
              department_name: '',
              department_code: '',
              description: '',
              is_active: true,
            });
            break;
          case 'courier':
            setFormData({
              partner_name: '',
              partner_code: '',
              contact_phone: '',
              is_active: true,
            });
            break;
          case 'user':
            setFormData({
              username: '',
              first_name: '',
              last_name: '',
              email: '',
              role_code: 'Cashier',
              assigned_branches: ['*'],
              password_hash: '',
              lock_pin_hash: '',
              is_active: true,
            });
            break;
          case 'staff': {
            const defaultBranch = branches[0] || { branch_id: 'Aellp-ASI', branch_code: 'ASI' };
            setFormData({
              staff_code: '',
              first_name: '',
              middle_name: '',
              last_name: '',
              department_name: '',
              designation: '',
              mobile_number: '',
              branch_id: defaultBranch.branch_id,
              branch_code: defaultBranch.branch_code,
              is_active: true,
            });
            // Auto-generate next Staff ID based on active branch
            erpService.generateNextStaffCode(defaultBranch.branch_code).then((code) => {
              setFormData((prev: any) => ({ ...prev, staff_code: code }));
            });
            break;
          }
          case 'role':
            setFormData({
              role_code: '',
              role_title: '',
              description: '',
              is_system_role: false,
              can_create_voucher: true,
              can_void_voucher: false,
              can_backdate_voucher: false,
              can_disburse_advance: false,
              can_settle_advance: false,
              max_advance_limit: 5000,
              can_inject_float: false,
              can_verify_f9_closing: false,
              can_export_tally: false,
              can_download_hr_payroll: false,
              can_view_all_branches: false,
              can_view_audit_logs: false,
              can_manage_users_roles: false,
              can_manage_periods: false,
            });
            break;
        }
      }
    }
  }, [isOpen, record, type, branches]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const handleSave = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userName = `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim() || 'Super Admin';
      const userRole = user?.role_code || 'Super_Admin';

      if (type === 'branch') {
        if (!formData.branch_name || !formData.branch_code) {
          throw new Error('Branch Name and Code are required.');
        }
        await erpService.saveBranch(formData, isEdit, userName, userRole);
      } else if (type === 'category') {
        if (!formData.category_name) {
          throw new Error('Category Name is required.');
        }
        await erpService.saveCategory(formData, isEdit, userName, userRole);
      } else if (type === 'department') {
        if (!formData.department_name || !formData.department_code) {
          throw new Error('Department Name and Code are required.');
        }
        await erpService.saveDepartment(formData, isEdit, userName, userRole);
      } else if (type === 'courier') {
        if (!formData.partner_name || !formData.partner_code) {
          throw new Error('Partner Name and Code are required.');
        }
        await erpService.saveCourier(formData, isEdit, userName, userRole);
      } else if (type === 'user') {
        if (!formData.username || !formData.first_name) {
          throw new Error('Username and First Name are required.');
        }
        const isSuperAdminOrDev = formData.role_code === 'Super_Admin' || formData.role_code === 'Developer';
        if (!formData.staff_code && formData.username !== 'aellpadmin' && !isEdit && !isSuperAdminOrDev) {
          throw new Error('Please select and link an active Staff Member profile for this operational login account (Cashier, Store Manager, Auditor, etc.). Super Admin and Developer accounts do not require a staff profile.');
        }
        await erpService.saveAppUser(formData, isEdit, userName, userRole);
      } else if (type === 'staff') {
        if (!formData.staff_code || !formData.first_name) {
          throw new Error('Staff Code and First Name are required.');
        }
        const bId = formData.branch_id || branches[0]?.branch_id || 'Aellp-ASI';
        const foundBranch = branches.find((b) => b.branch_id === bId);
        const bCode = formData.branch_code || foundBranch?.branch_code || bId.replace(/^Aellp-/, '') || 'ASI';

        await erpService.saveStaffMember(
          {
            ...formData,
            branch_id: bId,
            branch_code: bCode,
            last_name: (formData.last_name || '').trim() || null,
            department_name: (formData.department_name || '').trim() || null,
            designation: (formData.designation || '').trim() || null,
            mobile_number: (formData.mobile_number || '').trim() || null,
          },
          isEdit,
          userName,
          userRole
        );
      } else if (type === 'role') {
        if (isEdit && record?.is_system_role) {
          throw new Error('Core system role permissions cannot be modified. Create a custom role instead.');
        }
        if (!formData.role_code || !formData.role_title) {
          throw new Error('Role Code and Role Title are required.');
        }
        await erpService.saveRole(
          {
            role_code: formData.role_code,
            role_title: formData.role_title,
            description: formData.description,
            is_system_role: formData.is_system_role || false,
          },
          formData,
          isEdit,
          userName,
          userRole
        );
      }

      showToast({
        type: 'success',
        title: isEdit ? 'Record Updated' : 'Record Created',
        message: `Successfully saved ${type} entry into Supabase database.`,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save record.');
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Database error occurred.',
      });
    } finally {
      setLoading(false);
    }
  }, [formData, isEdit, type, user, branches, onSuccess]);

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter to Save
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSave]);

  const handleDelete = async () => {
    if (!deleteReason || deleteReason.trim().length < 3) {
      setError('Deletion reason is mandatory for audit logging.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Super Admin';
      const userRole = user?.role_code || 'Super_Admin';

      if (type === 'branch') {
        await erpService.deleteBranch(record.branch_id, userName, userRole, deleteReason);
      } else if (type === 'category') {
        await erpService.deleteCategory(record.category_name, userName, userRole, deleteReason);
      } else if (type === 'department') {
        await erpService.deleteDepartment(
          record.department_code,
          record.department_name || record.department_code,
          userName,
          userRole,
          deleteReason
        );
      } else if (type === 'courier') {
        await erpService.deleteCourier(
          record.partner_code,
          record.partner_name || record.partner_code,
          userName,
          userRole,
          deleteReason
        );
      } else if (type === 'role') {
        if (record.is_system_role) {
          throw new Error('Core system roles (Super Admin, Manager, Cashier) cannot be deleted.');
        }
        await erpService.deleteRole(record.role_code, userName, userRole);
      } else if (type === 'user') {
        await erpService.deleteAppUser(
          record.id,
          record.username,
          userName,
          userRole,
          deleteReason
        );
      } else if (type === 'staff') {
        await erpService.deleteStaffMember(
          record.staff_code,
          `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.staff_code,
          userName,
          userRole,
          deleteReason
        );
      }

      showToast({
        type: 'success',
        title: 'Record Removed',
        message: `Successfully deactivated ${type} entry.`,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete record.');
      showToast({
        type: 'error',
        title: 'Deactivation Failed',
        message: err.message || 'Database error occurred.',
      });
    } finally {
      setLoading(false);
    }
  };

  const tableName = tableNames[type];

  const entityLabels: Record<MasterDrawerType, string> = {
    branch: 'Shop Branch',
    category: 'Expense Category',
    department: 'Shop Department',
    courier: 'Courier Partner',
    user: 'Login Account',
    staff: 'Staff Member',
    role: 'Role & Permissions',
  };

  const drawerTitle = (
    <div className="flex items-center gap-2 text-sm font-sans font-medium text-slate-800 dark:text-zinc-200">
      <span>{isEdit ? 'Edit' : 'Add New'} {entityLabels[type]}</span>
      <span className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-zinc-400 font-mono text-xs border border-slate-200 dark:border-[#2e2e2e]">
        {tableName}
      </span>
    </div>
  );

  const drawerFooter = (
    <>
      <div className="flex items-center gap-2">
        {isEdit && isSuperAdmin && (
          <button
            type="button"
            onClick={() => setConfirmDelete(!confirmDelete)}
            className="p-2 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] hover:border-rose-300 dark:hover:border-rose-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-medium transition-colors cursor-pointer"
            title="Delete record permanently"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] bg-transparent hover:bg-slate-100 dark:hover:bg-[#222222] text-slate-800 dark:text-zinc-200 text-xs font-medium font-sans transition-colors cursor-pointer min-h-[34px]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#34b27b] text-[#171717] text-xs font-semibold font-sans transition-colors cursor-pointer shadow-xs min-h-[34px]"
        >
          <span>{loading ? 'Saving...' : 'Save'}</span>
          <span className="font-mono text-[10px] text-[#171717]/80 bg-black/10 px-1 py-0.5 rounded leading-none">
            Ctrl ↵
          </span>
        </button>
      </div>
    </>
  );

  const inputStyles = "w-full h-9 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#2e2e2e] rounded-[6px] px-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e] disabled:opacity-60 disabled:bg-slate-50 dark:disabled:bg-[#141414] font-mono text-xs transition-colors";

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={drawerTitle}
      size="xl"
      footer={drawerFooter}
    >
      <div className="w-full space-y-4 font-sans text-xs">
        {/* Navigation Tabs (if Developer) */}
        {isDeveloper && (
          <div className="flex items-center gap-1 p-0.5 rounded-[6px] bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={cn(
                'flex-1 py-1.5 px-3 rounded-[4px] text-xs font-sans transition-colors cursor-pointer min-h-[30px]',
                activeTab === 'form'
                  ? 'bg-white dark:bg-[#222222] text-slate-900 dark:text-white font-medium shadow-xs border border-slate-200 dark:border-[#333]'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-medium'
              )}
            >
              Row Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('developer')}
              className={cn(
                'flex-1 py-1.5 px-3 rounded-[4px] text-xs font-sans transition-colors cursor-pointer min-h-[30px]',
                activeTab === 'developer'
                  ? 'bg-white dark:bg-[#222222] text-slate-900 dark:text-white font-medium shadow-xs border border-slate-200 dark:border-[#333]'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-medium'
              )}
            >
              JSON Payload
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-[6px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-sans flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Supabase Row Editor Form */}
        {activeTab === 'form' && (
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. Branch Form (master_branches) */}
            {type === 'branch' && (
              <div className="space-y-4">
                <SupabaseFieldRow columnName="id" dataType="uuid" isPrimaryKey description="Primary database identifier">
                  <input
                    type="text"
                    disabled
                    value={formData.branch_id || (isEdit ? record?.branch_id : 'Auto-generated uuid')}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="branch_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.branch_name || ''}
                    onChange={(e) => handleChange('branch_name', e.target.value)}
                    placeholder="e.g. Asopalav - Satellite"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="branch_code" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.branch_code || ''}
                    onChange={(e) => handleChange('branch_code', e.target.value.toUpperCase())}
                    placeholder="ASI"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="city" dataType="varchar">
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="Ahmedabad"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="state" dataType="varchar">
                  <input
                    type="text"
                    value={formData.state || ''}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder="Gujarat"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="gstin" dataType="varchar">
                  <input
                    type="text"
                    value={formData.gstin || ''}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                    placeholder="24ABVFA8046N1ZQ"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="min_cash_threshold" dataType="numeric" description="Minimum cash float maintained in showroom drawer">
                  <input
                    type="number"
                    value={formData.min_cash_threshold ?? ''}
                    onChange={(e) => handleChange('min_cash_threshold', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 3000"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="max_cash_ceiling" dataType="numeric" description="Trigger for safe-drop to main vault">
                  <input
                    type="number"
                    value={formData.max_cash_ceiling ?? ''}
                    onChange={(e) => handleChange('max_cash_ceiling', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 25000"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="is_active" dataType="boolean">
                  <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                    <input
                      type="checkbox"
                      checked={formData.is_active ?? true}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                      className="rounded text-[#3ecf8e] focus:ring-0 w-4 h-4 bg-[#181818] border-[#2e2e2e]"
                    />
                    <span className="text-slate-700 dark:text-zinc-300 font-mono text-xs">
                      {formData.is_active ? 'TRUE' : 'FALSE'}
                    </span>
                  </label>
                </SupabaseFieldRow>
              </div>
            )}

            {/* 2. Category Form (expense_categories) */}
            {type === 'category' && (
              <div className="space-y-4">
                <SupabaseFieldRow columnName="id" dataType="uuid" isPrimaryKey description="Primary category key">
                  <input
                    type="text"
                    disabled
                    value={formData.id || (isEdit ? record?.category_name : 'Auto-generated uuid')}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="category_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.category_name || ''}
                    onChange={(e) => handleChange('category_name', e.target.value)}
                    placeholder="e.g. Printing & Stationery"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="color_theme" dataType="varchar" description="Tally Prime Ledger Mapping group">
                  <input
                    type="text"
                    value={formData.color_theme || ''}
                    onChange={(e) => handleChange('color_theme', e.target.value)}
                    placeholder="e.g. Administrative Expenses"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="is_active" dataType="boolean">
                  <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                    <input
                      type="checkbox"
                      checked={formData.is_active ?? true}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                      className="rounded text-[#3ecf8e] focus:ring-0 w-4 h-4 bg-[#181818] border-[#2e2e2e]"
                    />
                    <span className="text-slate-700 dark:text-zinc-300 font-mono text-xs">
                      {formData.is_active ? 'TRUE' : 'FALSE'}
                    </span>
                  </label>
                </SupabaseFieldRow>
              </div>
            )}

            {/* 3. Department Form (master_departments) */}
            {type === 'department' && (
              <div className="space-y-4">
                <SupabaseFieldRow columnName="id" dataType="uuid" isPrimaryKey description="Primary department ID">
                  <input
                    type="text"
                    disabled
                    value={formData.department_code || (isEdit ? record?.department_code : 'Auto-generated uuid')}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="department_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.department_name || ''}
                    onChange={(e) => handleChange('department_name', e.target.value)}
                    placeholder="e.g. Bridal & Haute Couture"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="department_code" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.department_code || ''}
                    onChange={(e) => handleChange('department_code', e.target.value.toUpperCase())}
                    placeholder="BRIDAL"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="description" dataType="text">
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Showroom operational division..."
                    className={inputStyles}
                  />
                </SupabaseFieldRow>
              </div>
            )}

            {/* 4. Courier Form (master_couriers) */}
            {type === 'courier' && (
              <div className="space-y-4">
                <SupabaseFieldRow columnName="id" dataType="uuid" isPrimaryKey>
                  <input
                    type="text"
                    disabled
                    value={formData.partner_code || (isEdit ? record?.partner_code : 'Auto-generated uuid')}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="partner_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.partner_name || ''}
                    onChange={(e) => handleChange('partner_name', e.target.value)}
                    placeholder="e.g. Blue Dart Express"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="partner_code" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.partner_code || ''}
                    onChange={(e) => handleChange('partner_code', e.target.value.toUpperCase())}
                    placeholder="BLUEDART"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="contact_phone" dataType="varchar">
                  <input
                    type="text"
                    value={formData.contact_phone || ''}
                    onChange={(e) => handleChange('contact_phone', cleanIndianPhoneInput(e.target.value))}
                    placeholder="+91 98765 43210"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>
              </div>
            )}

            {/* 5. User Form (users) */}
            {type === 'user' && (
              <div className="space-y-4">
                {/* Linked Staff Member Selector */}
                {(() => {
                  const isSuperAdminOrDev = formData.role_code === 'Super_Admin' || formData.role_code === 'Developer';
                  return (
                    <>
                      <SupabaseFieldRow
                        columnName="staff_code"
                        dataType="varchar"
                        required={!isEdit && formData.username !== 'aellpadmin' && !isSuperAdminOrDev}
                        description={
                          isSuperAdminOrDev
                            ? 'Optional for Super Admin & Developer root accounts (System Owner)'
                            : 'Required: Link this operational account to an active staff member profile'
                        }
                      >
                        <SearchableSelect
                          options={[
                            {
                              value: '',
                              label: isSuperAdminOrDev
                                ? '-- No Staff Profile (Super Admin / Dev Root) --'
                                : '-- Select Active Staff Member Profile --',
                            },
                            ...availableStaff.map((s) => ({
                              value: s.staff_code,
                              label: `${s.first_name} ${s.last_name !== '-' ? s.last_name : ''}`.trim(),
                              sublabel: `${s.staff_code} • ${s.designation || 'Staff'}`,
                              badge: s.branch_code || s.branch_id,
                            })),
                          ]}
                          value={formData.staff_code || ''}
                          onChange={(selectedCode) => {
                            const selectedStaff = availableStaff.find((s) => s.staff_code === selectedCode);
                            if (selectedStaff) {
                              const cleanFirst = selectedStaff.first_name || '';
                              const cleanLast = selectedStaff.last_name !== '-' ? selectedStaff.last_name : '';
                              const branchId = selectedStaff.branch_id || `Aellp-${selectedStaff.branch_code || 'ASI'}`;
                              const suggestedUsername = !formData.username || !isEdit
                                ? `${cleanFirst.toLowerCase().replace(/[^a-z0-9]/g, '')}.${selectedCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`
                                : formData.username;

                              setFormData((prev: any) => ({
                                ...prev,
                                staff_code: selectedCode,
                                first_name: cleanFirst,
                                last_name: cleanLast,
                                assigned_branches: [branchId],
                                username: suggestedUsername,
                                email: prev.email || `${cleanFirst.toLowerCase()}@asopalav.com`,
                              }));
                            } else {
                              handleChange('staff_code', selectedCode);
                            }
                          }}
                          placeholder="Search active staff member profile..."
                          searchPlaceholder="Search by name, code or branch..."
                        />
                      </SupabaseFieldRow>

                      {isSuperAdminOrDev ? (
                        <div className="p-2.5 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-[11px] text-slate-700 dark:text-zinc-300 space-y-1">
                          <div className="font-semibold flex items-center gap-1.5 font-sans text-emerald-600 dark:text-[#3ecf8e]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Super Admin / Developer Root Account</span>
                          </div>
                          <p className="text-[10.5px] leading-tight text-slate-500 dark:text-[#a1a1a1]">
                            Super Admin &amp; Developer accounts operate with system-wide root authority and do not need to be registered as branch floor staff.
                          </p>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-1">
                          <div className="font-semibold flex items-center gap-1.5 font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#3ecf8e]" />
                            <span>Automatic Access Cutoff Policy</span>
                          </div>
                          <p className="text-[10.5px] leading-tight text-slate-600 dark:text-[#a1a1a1]">
                            If a staff member leaves or is marked <strong>Inactive / Resigned</strong>, their system login access and POS counter PIN are instantly and automatically revoked.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}

                <SupabaseFieldRow columnName="id" dataType="uuid" isPrimaryKey>
                  <input
                    type="text"
                    disabled
                    value={formData.id || (isEdit ? record?.id : 'Auto-generated uuid')}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="username" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.username || ''}
                    onChange={(e) => handleChange('username', e.target.value.toLowerCase())}
                    placeholder="rajesh.asi042"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="first_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.first_name || ''}
                    onChange={(e) => handleChange('first_name', e.target.value)}
                    placeholder="Rajesh"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="role_code" dataType="varchar" required>
                  <SearchableSelect
                    options={
                      availableRoles.length > 0
                        ? availableRoles.map((r) => ({
                            value: r.role_code,
                            label: `${r.role_title} (${r.role_code})`,
                            sublabel: r.description,
                            badge: r.role_code,
                          }))
                        : [
                            { value: 'Super_Admin', label: 'Super Administrator (HQ)' },
                            { value: 'Developer', label: 'Lead Developer' },
                            { value: 'Store_Manager', label: 'Store Operations Manager' },
                            { value: 'Cashier', label: 'Showroom Cashier' },
                            { value: 'Auditor', label: 'Internal Financial Auditor' },
                          ]
                    }
                    value={formData.role_code || 'Cashier'}
                    onChange={(val) => handleChange('role_code', val)}
                    placeholder="Select system role..."
                    searchPlaceholder="Search role..."
                    allowCustom={false}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow
                  columnName="password_hash"
                  dataType="varchar"
                  required={!isEdit}
                  description={isEdit ? 'Leave blank to keep current password' : 'Encrypted credential for terminal login'}
                >
                  <input
                    type="password"
                    required={!isEdit}
                    value={formData.password_hash || ''}
                    onChange={(e) => handleChange('password_hash', e.target.value)}
                    placeholder={isEdit ? '••••••••••••' : 'Enter login password'}
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="last_name" dataType="varchar">
                  <input
                    type="text"
                    value={formData.last_name || ''}
                    onChange={(e) => handleChange('last_name', e.target.value)}
                    placeholder="Patel"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="email" dataType="varchar">
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="user@asopalav.com"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="lock_pin_hash" dataType="varchar" description="4-Digit POS Fast Terminal Lock PIN">
                  <input
                    type="password"
                    maxLength={4}
                    value={formData.lock_pin_hash || ''}
                    onChange={(e) => handleChange('lock_pin_hash', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1234"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>
              </div>
            )}

            {/* 6. Staff Form (master_staff) */}
            {type === 'staff' && (
              <div className="space-y-4">
                <SupabaseFieldRow
                  columnName="staff_code"
                  dataType="varchar"
                  required
                  isPrimaryKey
                  badge={
                    isSuperAdmin && !isEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          const nextState = !isCustomStaffCode;
                          setIsCustomStaffCode(nextState);
                          if (!nextState) {
                            const bId = formData.branch_id || branches[0]?.branch_id || 'Aellp-ASI';
                            const bObj = branches.find((b) => b.branch_id === bId);
                            const bCode = bObj?.branch_code || 'ASI';
                            erpService.generateNextStaffCode(bCode).then((code) => {
                              setFormData((prev: any) => ({ ...prev, staff_code: code }));
                            });
                          }
                        }}
                        className="text-[10px] font-mono text-[#3ecf8e] hover:underline cursor-pointer ml-2"
                      >
                        {isCustomStaffCode ? 'Auto Seq' : 'Custom'}
                      </button>
                    ) : undefined
                  }
                >
                  <input
                    type="text"
                    required
                    disabled={isEdit || (!isSuperAdmin && !isCustomStaffCode)}
                    value={formData.staff_code || ''}
                    onChange={(e) => handleChange('staff_code', e.target.value.toUpperCase())}
                    placeholder="ASI-042"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="first_name" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.first_name || ''}
                    onChange={(e) => handleChange('first_name', e.target.value)}
                    placeholder="Ramesh"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="branch_id" dataType="varchar" required>
                  <SearchableSelect
                    options={branches.map((b) => ({
                      value: b.branch_id,
                      label: b.branch_code,
                      sublabel: b.branch_name.replace(/^Asopalav\s*-\s*/i, ''),
                    }))}
                    value={formData.branch_id || ''}
                    onChange={async (bId) => {
                      const bObj = branches.find((b) => b.branch_id === bId);
                      const bCode = bObj?.branch_code || bId.replace(/^Aellp-/, '') || 'ASI';
                      setFormData((prev: any) => ({
                        ...prev,
                        branch_id: bId,
                        branch_code: bCode,
                      }));
                      if (!isEdit && !isCustomStaffCode) {
                        const nextCode = await erpService.generateNextStaffCode(bCode);
                        setFormData((prev: any) => ({ ...prev, staff_code: nextCode }));
                      }
                    }}
                    placeholder="Select showroom branch..."
                    searchPlaceholder="Search branch name or code..."
                    allowCustom={false}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="last_name" dataType="varchar">
                  <input
                    type="text"
                    value={formData.last_name || ''}
                    onChange={(e) => handleChange('last_name', e.target.value)}
                    placeholder="Patel"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="department_name" dataType="varchar">
                  <input
                    type="text"
                    value={formData.department_name || ''}
                    onChange={(e) => handleChange('department_name', e.target.value)}
                    placeholder="Showroom Sales"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="designation" dataType="varchar">
                  <input
                    type="text"
                    value={formData.designation || ''}
                    onChange={(e) => handleChange('designation', e.target.value)}
                    placeholder="Senior Sales Specialist"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="mobile_number" dataType="varchar">
                  <input
                    type="text"
                    value={formData.mobile_number || ''}
                    onChange={(e) => handleChange('mobile_number', cleanIndianPhoneInput(e.target.value))}
                    placeholder="+91 98765 43210"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>
              </div>
            )}

            {/* 7. Role Form (roles) */}
            {type === 'role' && (
              <div className="space-y-4">
                <SupabaseFieldRow columnName="role_code" dataType="varchar" required isPrimaryKey>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={formData.role_code || ''}
                    onChange={(e) => handleChange('role_code', e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
                    placeholder="Floor_Supervisor"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                <SupabaseFieldRow columnName="role_title" dataType="varchar" required>
                  <input
                    type="text"
                    required
                    value={formData.role_title || ''}
                    onChange={(e) => handleChange('role_title', e.target.value)}
                    placeholder="Floor Supervisor"
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Optional Fields Divider */}
                <div className="pt-4 pb-1 border-t border-slate-200 dark:border-[#262626] space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Optional Fields</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#707070]">These are columns that do not need any value</p>
                </div>

                <SupabaseFieldRow columnName="description" dataType="text">
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Terminal rights and operational authorization..."
                    className={inputStyles}
                  />
                </SupabaseFieldRow>

                {/* Granular Permissions Section */}
                <SupabaseFieldRow columnName="permissions" dataType="jsonb" description="14 Granular RBAC capabilities">
                  <div className="p-3 rounded-[6px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#2e2e2e] space-y-3 font-sans">
                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold text-slate-800 dark:text-zinc-200 block font-sans">
                        Vouchers & Advances
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_create_voucher ?? true}
                            onChange={(e) => handleChange('can_create_voucher', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Create Expense Vouchers</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_void_voucher ?? false}
                            onChange={(e) => handleChange('can_void_voucher', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Void Vouchers</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_disburse_advance ?? false}
                            onChange={(e) => handleChange('can_disburse_advance', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Disburse Staff Advance</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_settle_advance ?? false}
                            onChange={(e) => handleChange('can_settle_advance', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Settle Staff IOUs</span>
                        </label>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-[#282828] space-y-2">
                      <span className="text-[11px] font-semibold text-slate-800 dark:text-zinc-200 block font-sans">
                        Treasury & Administration
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_inject_float ?? false}
                            onChange={(e) => handleChange('can_inject_float', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Inject Safe Float</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_verify_f9_closing ?? false}
                            onChange={(e) => handleChange('can_verify_f9_closing', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Verify Cash Closing</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_export_tally ?? false}
                            onChange={(e) => handleChange('can_export_tally', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">Export Tally Prime</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formData.can_view_audit_logs ?? false}
                            onChange={(e) => handleChange('can_view_audit_logs', e.target.checked)}
                            className="rounded text-[#3ecf8e] focus:ring-0"
                          />
                          <span className="text-slate-700 dark:text-zinc-300">View Audit Logs</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </SupabaseFieldRow>
              </div>
            )}

            {/* Delete Confirmation Box */}
            {confirmDelete && (
              <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-[6px] space-y-2.5 font-sans">
                <span className="text-xs text-rose-800 dark:text-rose-400 font-medium block">
                  Confirm Permanent Deletion (Super Admin)
                </span>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Mandatory reason for audit trail..."
                  className="w-full h-8 bg-white dark:bg-[#141414] border border-rose-300 dark:border-rose-800/60 rounded-[4px] px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none font-sans"
                />
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="h-7 px-3 rounded-[4px] bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  {loading ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            )}
          </form>
        )}

        {/* Tab 2: Developer Payload */}
        {activeTab === 'developer' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-600 dark:text-gray-400 flex items-center gap-1.5 font-medium">
                <Code2 className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Entity JSON Payload</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopyText(JSON.stringify(formData, null, 2), 'json')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-white dark:bg-[#202020] hover:bg-slate-50 text-slate-700 dark:text-white border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono cursor-pointer"
              >
                {copiedCode === 'json' ? <Check className="w-3 h-3 text-[#3ecf8e] stroke-[2.5]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode === 'json' ? 'COPIED' : 'COPY JSON'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-[6px] bg-[#111111] text-[#3ecf8e] border border-[#222222] font-mono text-[11px] overflow-x-auto select-text leading-relaxed">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </SlideOverDrawer>
  );
};
