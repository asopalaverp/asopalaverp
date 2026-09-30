import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useOverrideStore, OverrideDuration, OverridePolicies } from '@/store/overrideStore';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  RotateCcw,
  AlertTriangle,
  Lock,
  Unlock,
  Wallet,
  Receipt,
  Calendar,
  HandCoins,
  Coins,
  FileCode2,
  Clock,
  Sparkles,
  X,
  Check,
} from 'lucide-react';

export const SuperAdminOverridesCard: React.FC = () => {
  const { user } = useAuthStore();
  const {
    policies,
    duration,
    expiresAt,
    lastModifiedBy,
    lastModifiedAt,
    togglePolicy,
    setMasterOverride,
    resetAllOverrides,
    isAnyOverrideActive,
  } = useOverrideStore();

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: 'master' | 'reset' | 'policy';
    policyKey?: keyof OverridePolicies;
    policyTitle?: string;
    nextValue?: boolean;
  }>({ open: false, type: 'master' });

  const isSuperAdmin = user?.role_code === 'Super_Admin' || user?.role_code === 'Developer';
  if (!isSuperAdmin) return null;

  const anyActive = isAnyOverrideActive();
  const userName = `${user?.first_name || 'Super'} ${user?.last_name || 'Admin'}`.trim();
  const userRole = user?.role_code || 'Super_Admin';

  const policyItems: {
    key: keyof OverridePolicies;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    riskLevel: 'high' | 'medium' | 'low';
    riskLabel: string;
  }[] = [
    {
      key: 'allowNegativeWallet',
      title: 'Allow Payment When Cash Box is Low / Empty',
      description:
        'Permits adding expense bills or staff advances even if the counter cash box balance is ₹0 or insufficient for urgent payments.',
      icon: Wallet,
      riskLevel: 'high',
      riskLabel: 'Negative Cash Risk',
    },
    {
      key: 'allow40A3Exceeded',
      title: 'Allow Cash Above ₹10,000 Tax Limit',
      description:
        'Allows creating cash bills above ₹10,000 (Courier > ₹35,000) for emergency expenses with an automatic audit note.',
      icon: Receipt,
      riskLevel: 'medium',
      riskLabel: 'Tax Flag',
    },
    {
      key: 'allowLockedPeriodEntry',
      title: 'Allow Adding Expenses in Locked Months',
      description:
        'Allows adding or adjusting expense bills in past months that were already locked by accounts.',
      icon: Calendar,
      riskLevel: 'high',
      riskLabel: 'Past Month Change',
    },
    {
      key: 'allowAutoVoucherDigits',
      title: 'Allow Bills Without Paper Book Number',
      description:
        'Allows making expense vouchers when the physical paper bill book is misplaced or during rush hours.',
      icon: FileCode2,
      riskLevel: 'low',
      riskLabel: 'Quick Bill',
    },
    {
      key: 'allowExcessAdvances',
      title: 'Allow Staff Advances Above Limit',
      description:
        'Allows giving advances above the normal ceiling or when a staff member still has an unsettled advance.',
      icon: HandCoins,
      riskLevel: 'medium',
      riskLabel: 'Advance Balance Risk',
    },
    {
      key: 'allowCeilingExceeded',
      title: 'Allow Cash in Box Above Safe Limit',
      description:
        'Allows keeping more cash in the counter cash box without safe-drop warning popups.',
      icon: Coins,
      riskLevel: 'low',
      riskLabel: 'Cash in Box',
    },
    {
      key: 'allowCashierVoidVoucher',
      title: 'Allow Cashiers to Void & Cancel Bills',
      description:
        'Allows counter cashiers to void mistyped or cancelled bills without requiring Store Manager or Super Admin login.',
      icon: Unlock,
      riskLevel: 'medium',
      riskLabel: 'Void Bill Access',
    },
    {
      key: 'allowCashierClosingReopen',
      title: 'Allow Cashiers to Adjust Locked Daily Closing',
      description:
        'Allows cashiers to reopen and adjust denomination note counts after today\'s evening closing was already submitted and locked.',
      icon: Lock,
      riskLevel: 'medium',
      riskLabel: 'Recount Access',
    },
  ];

  const handleRequestMasterToggle = () => {
    if (!policies.masterOverride) {
      setConfirmModal({
        open: true,
        type: 'master',
        policyTitle: 'Emergency Master Override (God Mode)',
        nextValue: true,
      });
    } else {
      setMasterOverride(false, duration, userName, userRole);
      showToast({
        type: 'info',
        title: 'Master Override Deactivated',
        message: 'Strict accounting rules and audit validation restored.',
      });
    }
  };

  const handleRequestResetAll = () => {
    setConfirmModal({
      open: true,
      type: 'reset',
      policyTitle: 'Reset All Emergency Overrides',
    });
  };

  const handleConfirmAction = () => {
    if (confirmModal.type === 'master') {
      setMasterOverride(true, duration, userName, userRole);
      showToast({
        type: 'warning',
        title: 'Master Override Activated',
        message: `All validation checks bypassed for duration: ${duration.toUpperCase()}.`,
      });
    } else if (confirmModal.type === 'reset') {
      resetAllOverrides(userName, userRole);
      showToast({
        type: 'info',
        title: 'Overrides Cleared',
        message: 'All standard accounting controls and cash limits active.',
      });
    }
    setConfirmModal({ open: false, type: 'master' });
  };

  return (
    <div className="space-y-4 font-sans select-none">
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <h2 className="text-xs font-medium text-slate-900 dark:text-white uppercase tracking-wider font-mono">
            Emergency Override Switches
          </h2>
          <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            ADMIN ONLY
          </span>
        </div>

        {anyActive && (
          <button
            type="button"
            onClick={handleRequestResetAll}
            className="flex items-center gap-1.5 px-3 py-1 rounded-[6px] border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-xs font-medium transition-colors cursor-pointer"
            title="Restore all strict accounting rules"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Overrides</span>
          </button>
        )}
      </div>

      {/* Main Switchboard Card */}
      <div className="border border-slate-200 dark:border-[#242424] rounded-[12px] bg-white dark:bg-[#141414] overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-[#202020]">
        {/* 1. Emergency Master Switch (God Mode) */}
        <div
          className={cn(
            'p-4 sm:p-5 transition-colors',
            policies.masterOverride
              ? 'bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30'
              : 'bg-slate-50/50 dark:bg-[#171717]/60'
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 border transition-colors',
                  policies.masterOverride
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-slate-100 dark:bg-[#202020] text-slate-500 dark:text-[#a1a1a1] border-slate-200 dark:border-[#2e2e2e]'
                )}
              >
                <Zap className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                    Emergency Master Override (God Mode)
                  </h3>
                  {policies.masterOverride && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 animate-pulse">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-[#a1a1a1] leading-relaxed max-w-xl">
                  Simultaneously bypasses all strict accounting validation guards (negative wallet, tax limits, locked periods, physical serial numbers). Use only during retail rushes or emergency hardware/system outages.
                </p>
              </div>
            </div>

            {/* Master Toggle & Duration */}
            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              {policies.masterOverride && (
                <div className="flex items-center gap-1 bg-white dark:bg-[#202020] p-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] text-[11px] font-mono">
                  <Clock className="w-3 h-3 text-amber-500 ml-1" />
                  {(['1h', '4h', 'today', 'indefinite'] as OverrideDuration[]).map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setMasterOverride(true, dur, userName, userRole)}
                      className={cn(
                        'px-1.5 py-0.5 rounded-[4px] transition-all cursor-pointer uppercase',
                        duration === dur
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                      )}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={policies.masterOverride}
                onClick={handleRequestMasterToggle}
                className={cn(
                  'w-12 h-6 rounded-full p-1 transition-colors cursor-pointer relative focus:outline-none shadow-inner',
                  policies.masterOverride
                    ? 'bg-amber-500'
                    : 'bg-slate-200 dark:bg-[#2e2e2e]'
                )}
                title={`Click to ${policies.masterOverride ? 'disable' : 'enable'} Emergency Master Override`}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform transform shadow-md',
                    policies.masterOverride ? 'translate-x-6' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 1.5 FEATURED CASHIER DATE RESTRICTION SWITCH */}
        <div
          className={cn(
            'p-4 sm:p-5 transition-colors border-b border-slate-100 dark:border-[#202020]',
            policies.allowBackdatedEntries
              ? 'bg-amber-500/10 dark:bg-amber-500/15'
              : 'bg-emerald-500/5 dark:bg-emerald-500/[0.04]'
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 border transition-colors',
                  policies.allowBackdatedEntries
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-[#3ecf8e] border-emerald-500/30'
                )}
              >
                <Calendar className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                    Cashier Date Selection Restriction
                  </h3>
                  <span
                    className={cn(
                      'text-[10px] font-mono font-bold px-2 py-0.5 rounded-[4px] border',
                      policies.allowBackdatedEntries
                        ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border-emerald-500/30'
                    )}
                  >
                    {policies.allowBackdatedEntries ? 'PAST DATES ALLOWED (UNLOCKED)' : 'TODAY ONLY LOCKED (DEFAULT)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#a1a1a1] leading-relaxed max-w-xl">
                  {policies.allowBackdatedEntries
                    ? '⚠️ Cashiers can currently select yesterday or older past dates to record retroactive vouchers.'
                    : '🔒 Cashiers are strictly restricted to Today\'s date only in Add Expense and all transaction date pickers. Super Admin and Developer accounts can always select any date.'}
                </p>
              </div>
            </div>

            {/* Direct ON / OFF Action Button */}
            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => togglePolicy('allowBackdatedEntries', userName, userRole)}
                className={cn(
                  'px-3.5 py-1.5 rounded-[6px] text-xs font-semibold font-sans flex items-center gap-2 transition-all cursor-pointer shadow-xs border',
                  policies.allowBackdatedEntries
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400'
                    : 'bg-slate-100 dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] text-slate-800 dark:text-zinc-200 border-slate-300 dark:border-[#383838]'
                )}
              >
                {policies.allowBackdatedEntries ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Allowing Past Dates (Click to Lock)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                    <span>Locked to Today Only (Click to Allow)</span>
                  </>
                )}
              </button>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={policies.allowBackdatedEntries}
                onClick={() => togglePolicy('allowBackdatedEntries', userName, userRole)}
                className={cn(
                  'w-12 h-6 rounded-full p-1 transition-colors cursor-pointer relative focus:outline-none shadow-inner',
                  policies.allowBackdatedEntries
                    ? 'bg-amber-500'
                    : 'bg-slate-200 dark:bg-[#2e2e2e]'
                )}
                title="Toggle Cashier Date Selection Restriction"
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform transform shadow-md',
                    policies.allowBackdatedEntries ? 'translate-x-6' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Granular Policy Switch List */}
        <div className="divide-y divide-slate-100 dark:divide-[#202020]">
          {policyItems.map((item) => {
            const Icon = item.icon;
            const isEnabled = policies[item.key] || policies.masterOverride;
            const isMasterControlled = policies.masterOverride && !policies[item.key];

            return (
              <div
                key={item.key}
                className={cn(
                  'p-4 sm:p-5 flex items-start justify-between gap-4 transition-colors',
                  isEnabled ? 'bg-amber-500/5 dark:bg-amber-500/[0.04]' : 'hover:bg-slate-50/50 dark:hover:bg-[#171717]/40'
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0 border transition-colors mt-0.5',
                      isEnabled
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-slate-100 dark:bg-[#1d1d1d] text-slate-500 dark:text-[#707070] border-slate-200 dark:border-[#282828]'
                    )}
                  >
                    <Icon className="w-4 h-4 stroke-[1.8]" />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-medium text-slate-900 dark:text-white font-sans">
                        {item.title}
                      </h4>
                      <span
                        className={cn(
                          'text-[10px] font-mono font-medium px-1.5 py-0.2 rounded border',
                          item.riskLevel === 'high'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : item.riskLevel === 'medium'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            : 'bg-slate-100 dark:bg-[#202020] text-slate-600 dark:text-[#a1a1a1] border-slate-200 dark:border-[#2e2e2e]'
                        )}
                      >
                        {item.riskLabel}
                      </span>
                      {isMasterControlled && (
                        <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                          (Enforced by Master God Mode)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#8e8e8e] leading-relaxed max-w-2xl font-sans">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Switch Toggle */}
                <div className="shrink-0 pt-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    disabled={policies.masterOverride}
                    onClick={() => togglePolicy(item.key, userName, userRole)}
                    className={cn(
                      'w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer relative focus:outline-none',
                      isEnabled
                        ? 'bg-emerald-500 dark:bg-[#3ecf8e]'
                        : 'bg-slate-200 dark:bg-[#2e2e2e]',
                      policies.masterOverride && 'opacity-60 cursor-not-allowed'
                    )}
                    title={`Click to toggle ${item.title}`}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full bg-white transition-transform transform shadow-xs',
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Footer Audit & Security Status */}
        <div className="p-3.5 bg-slate-50 dark:bg-[#171717] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-500 dark:text-[#707070]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
            <span>
              Audit Trail:{' '}
              {lastModifiedBy ? (
                <span className="text-slate-800 dark:text-zinc-200">
                  Last updated by {lastModifiedBy} at {new Date(lastModifiedAt || Date.now()).toLocaleTimeString()}
                </span>
              ) : (
                'Standard system rules enforced.'
              )}
            </span>
          </div>

          {expiresAt && (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px]">
              <Clock className="w-3.5 h-3.5" />
              <span>Expires at {new Date(expiresAt).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONFIRMATION PREVIEW MODAL                                                */}
      {/* ========================================================================= */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setConfirmModal({ open: false, type: 'master' })}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[8px] bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                  {confirmModal.type === 'master' ? 'Activate Master Override' : 'Reset All Overrides'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#888888]">
                  {confirmModal.type === 'master'
                    ? 'Bypasses accounting safety constraints.'
                    : 'Restores all standard financial rules.'}
                </p>
              </div>
            </div>

            {/* Verification Slip */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Action:</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono">
                  {confirmModal.type === 'master' ? 'GOD MODE ACTIVATION' : 'RESTORE CONTROLS'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Requested By:</span>
                <span className="text-slate-800 dark:text-zinc-200">{userName} ({userRole})</span>
              </div>
              {confirmModal.type === 'master' && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                  <span className="text-slate-500 dark:text-[#888888]">Active Duration:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 font-bold uppercase">{duration}</span>
                </div>
              )}
              <div className="space-y-1 py-1">
                <span className="text-slate-500 dark:text-[#888888] block">Security Notice:</span>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed bg-amber-500/10 p-2 rounded-[6px] border border-amber-500/20">
                  {confirmModal.type === 'master'
                    ? 'All cash ceiling limits, negative cash blocks, backdate blocks, and 40A(3) checks will be bypassed across all counter terminals.'
                    : 'All normal safety checks will be reactivated immediately. Any active bypasses will end.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#242424]">
              <button
                type="button"
                onClick={() => setConfirmModal({ open: false, type: 'master' })}
                className="px-4 py-2 rounded-[6px] border border-slate-300 dark:border-[#333] text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] transition-colors cursor-pointer"
              >
                Back &amp; Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={cn(
                  'px-5 py-2 rounded-[6px] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs',
                  confirmModal.type === 'master'
                    ? 'bg-amber-500 hover:bg-amber-600 text-black'
                    : 'bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717]'
                )}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>
                  {confirmModal.type === 'master' ? 'Confirm & Enable God Mode' : 'Confirm & Reset'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOverridesCard;
