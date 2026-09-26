import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineQueue } from '@/lib/offlineQueue';
import { erpService } from '@/lib/erpService';
import { cn, triggerHaptic } from '@/lib/utils';
import {
  Menu,
  Search,
  Moon,
  Sun,
  Wallet,
  Cloud,
  CloudOff,
  RefreshCw,
  Bell,
  Calculator,
  User,
  Shield,
  Lock,
  LogOut,
  ChevronDown,
  Sparkles,
  Settings,
} from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { Kbd } from '@/components/ui/Kbd';
import {
  AppSidebarCollapseIcon,
  AppSidebarExpandIcon,
} from '@/components/icons/AppIcons';
import { BrandLogo } from '@/components/icons/BrandLogo';
import { useBrandStore } from '@/store/brandStore';
import { useOverrideStore } from '@/store/overrideStore';

interface TopbarProps {
  onOpenKeyboardHelp?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenKeyboardHelp }) => {
  const { brandName, tagline, monogramText } = useBrandStore();
  const {
    activePage,
    setActivePage,
    theme,
    toggleTheme,
    setSearchOpen,
    setCalculatorOpen,
    toggleMobileSidebar,
    toggleSidebarCollapse,
    isSidebarCollapsed,
    setShortcutsModalOpen,
  } = useUIStore();
  const { user, lockScreen, logout, can } = useAuthStore();
  const { getActiveBranch, selectedBranchId } = useBranchStore();
  const { mutations, isOnline, isSyncing, processSyncQueue } = useOfflineQueue();
  const { getUnreadCount } = useNotificationStore();
  const { isCeilingExceededAllowed } = useOverrideStore();

  const [cashBalance, setCashBalance] = useState(0);
  const [upiBalance, setUpiBalance] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const activeBranch = getActiveBranch();
  const maxCashCeiling = activeBranch?.max_cash_ceiling || 25000;
  const isSafeDropAlert = cashBalance > maxCashCeiling && !isCeilingExceededAllowed();

  const username = user?.username || '';
  const userRole = user?.role_code || 'Super_Admin';
  const unreadNotifs = getUnreadCount(username, userRole, selectedBranchId === 'ALL' ? undefined : selectedBranchId);

  const userFullName = `${user?.first_name || 'Admin'} ${user?.last_name || ''}`.trim();
  const userInitials =
    user?.avatar_initials ||
    (user?.first_name
      ? `${user.first_name[0]}${user.last_name ? user.last_name[0] : ''}`.toUpperCase()
      : 'AD');

  // Close user dropdown on outside click or ESC
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  // Live Wallet Balances (Event-driven & cached)
  const refreshWallet = async () => {
    if (!activeBranch?.branch_id) return;
    try {
      const w = await erpService.getBranchWallet(activeBranch.branch_id);
      setCashBalance(w.cash_balance);
      setUpiBalance(w.upi_balance);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    refreshWallet();
    const handleWalletUpdated = () => {
      refreshWallet();
    };
    window.addEventListener('asopalav:wallet-updated', handleWalletUpdated);
    return () => {
      window.removeEventListener('asopalav:wallet-updated', handleWalletUpdated);
    };
  }, [activeBranch?.branch_id]);

  return (
    <header className="border-b border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#141414] sticky top-0 z-20 select-none text-slate-900 dark:text-white font-sans h-12">
      <div className="h-full px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
        {/* ========================================================================= */}
        {/* SECTION 1 (LEFT): BRANDING & PROJECT / BRANCH BREADCRUMBS                 */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          {/* Desktop Sidebar Toggle */}
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            aria-label={`Toggle Sidebar (${isSidebarCollapsed ? 'Expand' : 'Collapse'})`}
            className="hidden lg:flex items-center justify-center w-[34px] h-[34px] rounded-[6px] text-slate-500 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202020] border border-transparent hover:border-slate-200 dark:hover:border-[#2e2e2e] transition-colors cursor-pointer"
            title={`Toggle Sidebar (${isSidebarCollapsed ? 'Expand' : 'Collapse'})`}
          >
            {isSidebarCollapsed ? (
              <AppSidebarExpandIcon className="w-4 h-4 text-slate-500 dark:text-[#a1a1a1]" />
            ) : (
              <AppSidebarCollapseIcon className="w-4 h-4 text-slate-500 dark:text-[#a1a1a1]" />
            )}
          </button>

          {/* Mobile Hamburger Drawer Toggle */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              toggleMobileSidebar();
            }}
            aria-label="Open navigation sidebar"
            className="lg:hidden flex items-center justify-center w-[34px] h-[34px] rounded-[6px] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#202020] border border-transparent hover:border-slate-200 dark:hover:border-[#2e2e2e] transition-colors active:scale-95 cursor-pointer shrink-0"
            title="Open Navigation"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Active Page Name */}
          <div className="flex items-center min-w-0 select-none">
            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate font-sans tracking-tight">
              {activePage === 'dashboard'
                ? 'Dashboard'
                : activePage === 'new-voucher'
                ? 'Add Expense'
                : activePage === 'expenses'
                ? 'All Expenses'
                : activePage === 'treasury'
                ? 'Cash Box & Bank'
                : activePage === 'closing'
                ? 'Daily Cash Closing'
                : activePage === 'advances'
                ? 'Staff Advances'
                : activePage === 'staff'
                ? 'Staff Directory'
                : activePage === 'settings'
                ? 'Shop Settings'
                : activePage === 'audit'
                ? 'Activity History'
                : activePage === 'notifications'
                ? 'Alerts & Messages'
                : activePage === 'profile'
                ? 'My Profile'
                : activePage === 'search'
                ? 'Search Everything'
                : 'Dashboard'}
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2 (RIGHT): SEARCH & OPERATIONAL UTILITY CONTROLS                   */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1A. Mobile Only: Search Icon Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setSearchOpen(true);
            }}
            aria-label="Search"
            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 dark:border-[#282828] bg-slate-50/80 dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-[#222222] hover:border-slate-300 dark:hover:border-[#383838] text-slate-600 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Search"
          >
            <Search className="w-3.5 h-3.5 stroke-[2]" />
          </button>

          {/* 1B. Desktop / Tablet: Search Bar */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setSearchOpen(true);
            }}
            aria-label="Global Project Search"
            className="hidden sm:flex items-center justify-between h-[34px] px-3 w-44 md:w-52 lg:w-60 bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#2e2e2e] hover:border-slate-300 dark:hover:border-[#383838] rounded-[6px] text-xs text-slate-500 dark:text-[#a1a1a1] hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer group shadow-2xs select-none"
            title="Search expenses, staff, receipts & cash..."
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#707070] group-hover:text-slate-700 dark:group-hover:text-zinc-200 transition-colors shrink-0 stroke-[1.8]" />
              <span className="truncate text-xs font-sans">Search expenses, staff...</span>
            </div>
            <Kbd className="hidden lg:inline-flex">Ctrl K</Kbd>
          </button>

          {/* 2A & 2B. Cash Box & Bank UPI Balance Pills (Restricted to Authorized Roles) */}
          {can('can_inject_float') && (
            <>
              {/* 2A. Cash Box Balance Pill */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setActivePage('treasury');
                }}
                aria-label={`Cash Box Balance: ₹${cashBalance.toLocaleString('en-IN')}`}
                className={cn(
                  'hidden md:flex items-center gap-1.5 h-[34px] px-2.5 rounded-[6px] border text-xs font-mono transition-colors shadow-2xs cursor-pointer select-none',
                  isSafeDropAlert
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
                    : 'border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] text-slate-800 dark:text-[#ededed] hover:border-slate-300 dark:hover:border-[#383838] hover:bg-slate-100 dark:hover:bg-[#202020]'
                )}
                title="Cash currently in shop cash box (Click to manage)"
              >
                <Wallet className="w-3.5 h-3.5 text-slate-400 dark:text-[#707070] shrink-0 stroke-[1.8]" />
                <span className="text-[11px] text-slate-400 dark:text-[#707070] font-sans">Cash:</span>
                <strong className="font-medium tabular-nums text-xs text-emerald-600 dark:text-[#3ecf8e]">
                  <AnimatedCounter value={cashBalance} isCurrency />
                </strong>
              </button>

              {/* 2B. Bank UPI Balance Pill */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setActivePage('treasury');
                }}
                aria-label={`UPI Balance: ₹${upiBalance.toLocaleString('en-IN')}`}
                className="hidden md:flex items-center gap-1.5 h-[34px] px-2.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] text-slate-800 dark:text-[#ededed] hover:border-slate-300 dark:hover:border-[#383838] hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-mono transition-colors shadow-2xs cursor-pointer select-none"
                title="Bank UPI account balance (Click to manage)"
              >
                <span className="text-[11px] text-slate-400 dark:text-[#707070] font-sans">UPI:</span>
                <strong className="font-medium tabular-nums text-xs text-sky-500 dark:text-sky-400">
                  <AnimatedCounter value={upiBalance} isCurrency />
                </strong>
              </button>
            </>
          )}

          {/* 3. POS Quick Calculator Trigger */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setCalculatorOpen(true);
            }}
            aria-label="POS Quick Calculator"
            className="hidden sm:flex items-center justify-center w-[34px] h-[34px] rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] hover:border-slate-300 dark:hover:border-[#383838] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#202020] text-slate-600 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-2xs"
            title="POS Math, GST & Change Return Calculator"
          >
            <Calculator className="w-4 h-4 stroke-[1.8]" />
          </button>

          {/* 4. Cloud Sync Offline / Pending Indicator (Only displayed when offline, syncing, or pending mutations) */}
          {(!isOnline || isSyncing || mutations.length > 0) && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (mutations.length > 0 || !isOnline) {
                  processSyncQueue();
                }
              }}
              disabled={isSyncing}
              aria-label={`Cloud Sync: ${!isOnline ? 'Offline' : isSyncing ? 'Syncing...' : mutations.length > 0 ? `${mutations.length} Pending` : 'Synced'}`}
              className={cn(
                'flex items-center justify-center w-[34px] h-[34px] rounded-[6px] border transition-colors cursor-pointer',
                !isOnline
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : isSyncing
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e]'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}
              title={
                !isOnline
                  ? `Offline: ${mutations.length} transactions queued locally.`
                  : isSyncing
                  ? 'Syncing offline mutations to cloud...'
                  : `${mutations.length} transactions queued. Click to sync now.`
              }
            >
              {!isOnline ? (
                <CloudOff className="w-4 h-4 text-rose-500 stroke-[1.8] animate-pulse" />
              ) : isSyncing ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 dark:text-[#3ecf8e] stroke-[1.8]" />
              ) : (
                <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                  {mutations.length}
                </span>
              )}
            </button>
          )}

          {/* 5. User Profile Avatar & Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setIsUserMenuOpen((prev) => !prev);
              }}
              aria-label={`User Menu: ${userFullName}`}
              aria-expanded={isUserMenuOpen}
              className={cn(
                'flex items-center gap-2 h-8 rounded-full transition-all cursor-pointer select-none',
                'p-0.5 sm:pl-1 sm:pr-2.5 sm:border',
                isUserMenuOpen
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] ring-2 ring-[#3ecf8e]/20'
                  : 'border-transparent sm:border-slate-200 sm:dark:border-[#282828] sm:bg-slate-50/80 sm:dark:bg-[#181818] hover:border-slate-300 dark:hover:border-[#383838] hover:bg-slate-100 dark:hover:bg-[#222222]'
              )}
              title={`${userFullName} (${user?.role_code || 'Super Admin'}) - Profile & Settings`}
            >
              {/* Avatar Photo / Initials with optional unread indicator */}
              <div className="relative shrink-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={userFullName}
                    className="w-7 h-7 sm:w-6 sm:h-6 rounded-full object-cover border border-emerald-500/30 shrink-0 shadow-2xs"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-emerald-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                    {userInitials}
                  </div>
                )}
                {unreadNotifs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#141414]" />
                )}
              </div>

              <span className="hidden sm:inline-block text-xs font-medium text-slate-800 dark:text-zinc-200 max-w-[100px] truncate font-sans">
                {user?.first_name || 'Admin'}
              </span>

              <ChevronDown
                className={cn(
                  'hidden sm:inline-block w-3 h-3 text-slate-400 dark:text-[#707070] transition-transform duration-150',
                  isUserMenuOpen && 'rotate-180 text-emerald-600 dark:text-[#3ecf8e]'
                )}
              />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl z-50 overflow-hidden font-sans animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header User Card */}
                <div className="p-3 bg-slate-50 dark:bg-[#1e1e1e] border-b border-slate-200/80 dark:border-[#282828]">
                  <div className="flex items-center gap-2.5">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={userFullName}
                        className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500/50 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-mono font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                        {userInitials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                        {userFullName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-[#888888] truncate">
                        @{user?.username || 'admin'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] border border-emerald-500/20">
                          {user?.role_code || 'Super Admin'}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                          {activeBranch?.branch_code || 'ASI'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="p-1.5 space-y-0.5 text-xs">
                  {/* My Profile */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setIsUserMenuOpen(false);
                      setActivePage('profile');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                      activePage === 'profile'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <User className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e] shrink-0 stroke-[1.8]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">My Profile & Avatar</div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Change photo, PIN, password</div>
                    </div>
                  </button>

                  {/* System Notifications Center */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setIsUserMenuOpen(false);
                      setActivePage('notifications');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                      activePage === 'notifications'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Bell className="w-4 h-4 text-slate-500 dark:text-[#a1a1a1] stroke-[1.8]" />
                      {unreadNotifs > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate flex items-center justify-between">
                        <span>Notifications</span>
                        {unreadNotifs > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                            {unreadNotifs > 9 ? '9+' : unreadNotifs} new
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Alerts, audit & system warnings</div>
                    </div>
                  </button>

                  {/* Shop Settings (Restricted to Authorized Admins) */}
                  {can('can_manage_periods') && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setIsUserMenuOpen(false);
                        setActivePage('settings');
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                        activePage === 'settings'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                          : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] hover:text-slate-900 dark:hover:text-white'
                      )}
                    >
                      <Settings className="w-4 h-4 text-slate-500 dark:text-[#a1a1a1] shrink-0 stroke-[1.8]" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate">Shop Settings & Rules</div>
                        <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">F11 Settings & F12 Overrides</div>
                      </div>
                    </button>
                  )}

                  {/* Theme Switcher */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      toggleTheme();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {theme === 'light' ? (
                      <Sun className="w-4 h-4 text-amber-500 shrink-0 stroke-[1.8]" />
                    ) : theme === 'soft-dark' ? (
                      <Moon className="w-4 h-4 text-indigo-400 shrink-0 stroke-[1.8]" />
                    ) : (
                      <Moon className="w-4 h-4 text-zinc-400 shrink-0 stroke-[1.8]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate flex items-center justify-between">
                        <span>Theme Mode</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-zinc-300 capitalize font-medium">
                          {theme === 'soft-dark' ? 'Soft Dark' : theme === 'dark' ? 'Studio Dark' : 'Light'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Click to cycle Light / Dark</div>
                    </div>
                  </button>

                  <div className="border-t border-slate-200 dark:border-[#282828] my-1" />

                  {/* Lock Screen */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('warning');
                      setIsUserMenuOpen(false);
                      lockScreen();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-amber-500 shrink-0 stroke-[1.8]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">Lock Screen</div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Quick lock counter terminal</div>
                    </div>
                    <Kbd>Alt+L</Kbd>
                  </button>

                  {/* Sign Out */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('warning');
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500 shrink-0 stroke-[1.8]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">Sign Out</div>
                      <div className="text-[10px] text-rose-400/80 truncate">End active session</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
