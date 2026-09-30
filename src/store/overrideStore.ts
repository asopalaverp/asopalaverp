import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/ToastContainer';
import { triggerHaptic } from '@/lib/utils';

/** C-4 Security: Read role from in-memory Zustand store, NOT from localStorage (which is spoofable). */
const getCallerRole = (): string | null => {
  try {
    // Lazy import to avoid circular dependency — authStore imports overrideStore indirectly
    const { useAuthStore } = require('@/store/authStore');
    return useAuthStore.getState().user?.role_code ?? null;
  } catch {
    return null;
  }
};

const isCallerAuthorized = (): boolean => {
  const role = getCallerRole();
  return role === 'Super_Admin' || role === 'Developer';
};

export interface OverridePolicies {
  allowBackdatedEntries: boolean; // Allow cashiers to create expense entries with past/older dates
  allowNegativeWallet: boolean; // Disburse voucher even if wallet has ₹0 or insufficient funds
  allow40A3Exceeded: boolean; // Allow cash transactions > ₹10,000 without blocking
  allowLockedPeriodEntry: boolean; // Allow entry/edits on closed accounting periods
  allowAutoVoucherDigits: boolean; // Allow creating vouchers without physical manual bill book digits
  allowExcessAdvances: boolean; // Allow advances > ₹15,000 or multiple active advances per staff
  allowCeilingExceeded: boolean; // Allow till cash to exceed ₹50,000 without blocking
  allowCashierVoidVoucher: boolean; // Allow cashiers to void/cancel expense vouchers in emergency
  allowCashierClosingReopen: boolean; // Allow cashiers to reopen/adjust locked daily closing count
  masterOverride: boolean; // Emergency master switch: bypasses all rules simultaneously
}

export type OverrideDuration = '1h' | '4h' | 'today' | 'indefinite';

interface OverrideState {
  policies: OverridePolicies;
  duration: OverrideDuration;
  expiresAt: number | null; // Timestamp in ms or null for indefinite
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;

  // Actions
  togglePolicy: (key: keyof OverridePolicies, userName?: string, userRole?: string) => void;
  setPolicy: (key: keyof OverridePolicies, value: boolean, userName?: string, userRole?: string) => void;
  setMasterOverride: (enabled: boolean, duration?: OverrideDuration, userName?: string, userRole?: string) => void;
  resetAllOverrides: (userName?: string, userRole?: string) => void;
  isAnyOverrideActive: () => boolean;

  // Predicate Helpers
  isBackdatedAllowed: () => boolean;
  isNegativeWalletAllowed: () => boolean;
  is40A3ExceededAllowed: () => boolean;
  isLockedPeriodEntryAllowed: () => boolean;
  isAutoVoucherDigitsAllowed: () => boolean;
  isExcessAdvancesAllowed: () => boolean;
  isCeilingExceededAllowed: () => boolean;
  isCashierVoidAllowed: () => boolean;
  isCashierClosingReopenAllowed: () => boolean;
}

const STORAGE_KEY = 'asopalav_admin_overrides_v3';

const DEFAULT_POLICIES: OverridePolicies = {
  allowBackdatedEntries: false,
  allowNegativeWallet: false,
  allow40A3Exceeded: false,
  allowLockedPeriodEntry: false,
  allowAutoVoucherDigits: false,
  allowExcessAdvances: false,
  allowCeilingExceeded: false,
  allowCashierVoidVoucher: false,
  allowCashierClosingReopen: false,
  masterOverride: false,
};

const calculateExpiration = (duration: OverrideDuration): number | null => {
  const now = Date.now();
  switch (duration) {
    case '1h':
      return now + 60 * 60 * 1000;
    case '4h':
      return now + 4 * 60 * 60 * 1000;
    case 'today': {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay.getTime();
    }
    case 'indefinite':
    default:
      return null;
  }
};

const loadInitialState = (): {
  policies: OverridePolicies;
  duration: OverrideDuration;
  expiresAt: number | null;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
} => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Check if expired
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          localStorage.removeItem(STORAGE_KEY);
          return {
            policies: { ...DEFAULT_POLICIES },
            duration: 'indefinite',
            expiresAt: null,
            lastModifiedBy: null,
            lastModifiedAt: null,
          };
        }
        return {
          policies: { ...DEFAULT_POLICIES, ...parsed.policies },
          duration: parsed.duration || 'indefinite',
          expiresAt: parsed.expiresAt || null,
          lastModifiedBy: parsed.lastModifiedBy || null,
          lastModifiedAt: parsed.lastModifiedAt || null,
        };
      }
    } catch {
      // Fallback
    }
  }
  return {
    policies: { ...DEFAULT_POLICIES },
    duration: 'indefinite',
    expiresAt: null,
    lastModifiedBy: null,
    lastModifiedAt: null,
  };
};

const logAuditOverrideChange = async (
  action: string,
  details: Record<string, any>,
  userName: string = 'Super_Admin',
  userRole: string = 'Super_Admin'
) => {
  try {
    const auditPayload = {
      action,
      entity_type: 'System_Policy_Override',
      entity_id: 'GLOBAL_OVERRIDE_SWITCHBOARD',
      user_name: userName,
      user_role: userRole,
      details: JSON.stringify(details),
      created_at: new Date().toISOString(),
    };
    await supabase.from('security_audit_trail').insert([auditPayload]);
  } catch (err) {
    console.warn('Could not write audit trail for override change:', err);
  }
};

const initialState = loadInitialState();

export const useOverrideStore = create<OverrideState>((set, get) => ({
  policies: initialState.policies,
  duration: initialState.duration,
  expiresAt: initialState.expiresAt,
  lastModifiedBy: initialState.lastModifiedBy,
  lastModifiedAt: initialState.lastModifiedAt,

  togglePolicy: (key, userName = 'Super_Admin', userRole = 'Super_Admin') => {
    const current = get().policies[key];
    get().setPolicy(key, !current, userName, userRole);
  },

  setPolicy: (key, value, userName = 'Super_Admin', userRole = 'Super_Admin') => {
    // Security: verify caller is Super_Admin or Developer via in-memory Zustand state (not spoofable localStorage)
    if (!isCallerAuthorized()) {
      console.warn('[SECURITY] Override policy change blocked: insufficient privileges');
      return;
    }
    triggerHaptic('selection');
    const nowStr = new Date().toISOString();
    set((state) => {
      const updatedPolicies = { ...state.policies, [key]: value };
      const nextState = {
        policies: updatedPolicies,
        lastModifiedBy: userName,
        lastModifiedAt: nowStr,
      };

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            policies: updatedPolicies,
            duration: state.duration,
            expiresAt: state.expiresAt,
            lastModifiedBy: userName,
            lastModifiedAt: nowStr,
          })
        );
      } catch {}

      return nextState;
    });

    logAuditOverrideChange(
      `SUPERADMIN_POLICY_OVERRIDE_${key.toUpperCase()}_${value ? 'ENABLED' : 'DISABLED'}`,
      { policy: key, newValue: value, allPolicies: get().policies },
      userName,
      userRole
    );

    showToast({
      type: value ? 'warning' : 'info',
      title: value ? 'Emergency Rule Override Enabled' : 'Rule Override Disabled',
      message: `${key} is now ${value ? 'ACTIVE (Strict validation bypassed)' : 'RESTORED to strict enforcement'}.`,
    });
  },

  setMasterOverride: (enabled, duration = 'indefinite', userName = 'Super_Admin', userRole = 'Super_Admin') => {
    // Security: verify caller is Super_Admin or Developer via in-memory Zustand state (not spoofable localStorage)
    if (!isCallerAuthorized()) {
      console.warn('[SECURITY] Override policy change blocked: insufficient privileges');
      return;
    }
    triggerHaptic('selection');
    const expiresAt = enabled ? calculateExpiration(duration) : null;
    const nowStr = new Date().toISOString();

    const updatedPolicies: OverridePolicies = {
      allowBackdatedEntries: enabled,
      allowNegativeWallet: enabled,
      allow40A3Exceeded: enabled,
      allowLockedPeriodEntry: enabled,
      allowAutoVoucherDigits: enabled,
      allowExcessAdvances: enabled,
      allowCeilingExceeded: enabled,
      allowCashierVoidVoucher: enabled,
      allowCashierClosingReopen: enabled,
      masterOverride: enabled,
    };

    set({
      policies: updatedPolicies,
      duration,
      expiresAt,
      lastModifiedBy: userName,
      lastModifiedAt: nowStr,
    });

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          policies: updatedPolicies,
          duration,
          expiresAt,
          lastModifiedBy: userName,
          lastModifiedAt: nowStr,
        })
      );
    } catch {}

    logAuditOverrideChange(
      `SUPERADMIN_MASTER_GOD_MODE_${enabled ? 'ACTIVATED' : 'DEACTIVATED'}`,
      { enabled, duration, expiresAt },
      userName,
      userRole
    );

    showToast({
      type: enabled ? 'warning' : 'success',
      title: enabled ? 'MASTER OVERRIDE ACTIVATED' : 'Master Override Deactivated',
      message: enabled
        ? `All strict accounting rules are temporarily bypassed (${duration.toUpperCase()}). All actions are logged.`
        : 'All strict system validation rules have been restored.',
    });
  },

  resetAllOverrides: (userName = 'Super_Admin', userRole = 'Super_Admin') => {
    // Security: verify caller is Super_Admin or Developer via in-memory Zustand state (not spoofable localStorage)
    if (!isCallerAuthorized()) {
      console.warn('[SECURITY] Override policy change blocked: insufficient privileges');
      return;
    }
    triggerHaptic('light');
    set({
      policies: { ...DEFAULT_POLICIES },
      duration: 'indefinite',
      expiresAt: null,
      lastModifiedBy: userName,
      lastModifiedAt: new Date().toISOString(),
    });

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    logAuditOverrideChange('SUPERADMIN_ALL_OVERRIDES_RESET', { reset: true }, userName, userRole);

    showToast({
      type: 'success',
      title: 'All Overrides Reset',
      message: 'All system validation rules restored to strict standard enforcement.',
    });
  },

  isAnyOverrideActive: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) {
      return false;
    }
    return (
      policies.masterOverride ||
      policies.allowBackdatedEntries ||
      policies.allowNegativeWallet ||
      policies.allow40A3Exceeded ||
      policies.allowLockedPeriodEntry ||
      policies.allowAutoVoucherDigits ||
      policies.allowExcessAdvances ||
      policies.allowCeilingExceeded ||
      policies.allowCashierVoidVoucher ||
      policies.allowCashierClosingReopen
    );
  },

  // Predicate Helpers
  isBackdatedAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowBackdatedEntries;
  },

  isNegativeWalletAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowNegativeWallet;
  },

  is40A3ExceededAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allow40A3Exceeded;
  },

  isLockedPeriodEntryAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowLockedPeriodEntry;
  },

  isAutoVoucherDigitsAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowAutoVoucherDigits;
  },

  isExcessAdvancesAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowExcessAdvances;
  },

  isCeilingExceededAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowCeilingExceeded;
  },

  isCashierVoidAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowCashierVoidVoucher;
  },

  isCashierClosingReopenAllowed: () => {
    const { policies, expiresAt } = get();
    if (expiresAt && Date.now() > expiresAt) return false;
    return policies.masterOverride || policies.allowCashierClosingReopen;
  },
}));
