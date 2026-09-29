import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineQueue } from '@/lib/offlineQueue';
import { erpService } from '@/lib/erpService';
import { cn } from '@/lib/utils';
import {
  Menu,
  Search,
  Moon,
  Sun,
  Wallet,
  CloudOff,
  RefreshCw,
  Bell,
  Calculator,
  User,
  Lock,
  LogOut,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { Kbd } from '@/components/ui/Kbd';
import {
  AppSidebarCollapseIcon,
  AppSidebarExpandIcon,
} from '@/components/icons/AppIcons';
import { useBrandStore } from '@/store/brandStore';
import { useOverrideStore } from '@/store/overrideStore';

interface TopbarProps {
  onOpenKeyboardHelp?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenKeyboardHelp }) => {
  const { brandName } = useBrandStore();
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
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  // Live Wallet Balances
  const refreshWallet = async () => {
    if (!activeBranch?.branch_id) return;
    try {
      const w = await erpService.getBranchWallet(activeBranch.branch_id);
      setCashBalance(w.cash_balance);
      setUpiBalance(w.upi_balance);
    } catch {
      // Handled gracefully
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

  const pageTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    'new-voucher': 'Add Expense',
    expenses: 'All Expenses',
    treasury: 'Cash Box & Bank',
    closing: 'Daily Cash Closing',
    advances: 'Staff Advances',
    staff: 'Staff Directory',
    settings: 'Shop Settings',
    audit: 'Activity History',
    notifications: 'Alerts & Messages',
    profile: 'My Profile',
    search: 'Search Everything',
  };

  const activePageTitle = pageTitles[activePage] || 'Dashboard';

  return (
    <div className="border-b border-slate-200/80 dark:border-[#242424] bg-white dark:bg-[#141414] select-none text-slate-900 dark:text-white font-sans h-14">
      <div className="h-full px-4 sm:px-5 flex items-center justify-between gap-3 sm:gap-4">
        {/* ========================================================================= */}
        {/* SECTION 1 (LEFT): SIDEBAR TOGGLE & SUPABASE STUDIO BREADCRUMB             */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          {/* Desktop Sidebar Toggle */}
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            aria-label={`Toggle Sidebar (${isSidebarCollapsed ? 'Expand' : 'Collapse'})`}
            className="hidden lg:flex items-center justify-center w-9 h-9 rounded-[6px] text-slate-500 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1c1c1c] border border-transparent hover:border-slate-200 dark:hover:border-[#282828] transition-colors cursor-pointer"
            title={`Toggle Sidebar (${isSidebarCollapsed ? 'Expand' : 'Collapse'})`}
          >
            {isSidebarCollapsed ? (
              <AppSidebarExpandIcon className="w-4.5 h-4.5 text-slate-500 dark:text-[#a1a1a1]" />
            ) : (
              <AppSidebarCollapseIcon className="w-4.5 h-4.5 text-slate-500 dark:text-[#a1a1a1]" />
            )}
          </button>

          {/* Mobile Hamburger Drawer Toggle */}
          <button
            type="button"
            onClick={toggleMobileSidebar}
            aria-label="Open navigation sidebar"
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-[6px] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#1c1c1c] border border-transparent hover:border-slate-200 dark:hover:border-[#282828] transition-colors cursor-pointer shrink-0"
            title="Open Navigation"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Supabase Style Studio Breadcrumbs */}
          <div className="flex items-center gap-2 min-w-0 select-none font-sans">
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-[#707070] font-normal truncate">
              {brandName} ERP
            </span>
            <span className="hidden sm:inline text-xs text-slate-300 dark:text-[#404040]">/</span>
            <span className="font-semibold text-sm text-slate-900 dark:text-[#ededed] truncate tracking-tight">
              {activePageTitle}
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2 (RIGHT): SEARCH, LIVE BALANCES & OPERATIONAL CONTROLS           */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* 1A. Mobile & Tablet (< lg): Search Icon Button */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-[6px] border border-slate-200/80 dark:border-[#242424] hover:border-slate-300 dark:hover:border-[#2e2e2e] bg-slate-50/50 dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-[#202020] text-slate-600 dark:text-[#a1a1a1] transition-colors cursor-pointer shadow-2xs shrink-0"
            title="Search"
          >
            <Search className="w-4 h-4 stroke-[1.8]" />
          </button>

          {/* 1B. Desktop Only (lg+): Global Command Search Bar */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Global Search"
            className="hidden lg:flex items-center justify-between h-9 px-3 w-48 xl:w-60 bg-slate-50/50 dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200/80 dark:border-[#242424] hover:border-slate-300 dark:hover:border-[#2e2e2e] rounded-[6px] text-xs text-slate-400 dark:text-[#888888] transition-colors cursor-pointer group shadow-2xs select-none shrink-0"
            title="Search expenses, staff, receipts & cash... (Ctrl+K)"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-4 h-4 text-slate-400 dark:text-[#606060] group-hover:text-slate-700 dark:group-hover:text-zinc-200 transition-colors shrink-0 stroke-[1.8]" />
              <span className="truncate text-xs font-sans">Search...</span>
            </div>
            <Kbd size="xs" className="hidden xl:inline-flex rounded-[4px]">Ctrl K</Kbd>
          </button>

          {/* 2A & 2B. Cash Box & Bank UPI Balance Pills (Restricted to Authorized Roles) */}
          {can('can_inject_float') && (
            <>
              {/* 2A. Cash Box Balance Pill (lg+) */}
              <button
                type="button"
                onClick={() => setActivePage('treasury')}
                aria-label={`Cash Box Balance: ₹${cashBalance.toLocaleString('en-IN')}`}
                className={cn(
                  'hidden lg:flex items-center gap-2 h-9 px-3 rounded-[6px] border text-xs font-mono transition-colors shadow-2xs cursor-pointer select-none shrink-0',
                  isSafeDropAlert
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
                    : 'border-slate-200/80 dark:border-[#242424] bg-slate-50/50 dark:bg-[#181818] text-slate-800 dark:text-[#ededed] hover:border-slate-300 dark:hover:border-[#2e2e2e] hover:bg-slate-100 dark:hover:bg-[#202020]'
                )}
                title="Cash currently in shop cash drawer (Click to manage)"
              >
                <Wallet className="w-4 h-4 text-slate-400 dark:text-[#707070] shrink-0 stroke-[1.8]" />
                <span className="text-[11px] uppercase font-mono tracking-wider text-slate-400 dark:text-[#707070]">Cash:</span>
                <strong className="font-semibold tabular-nums text-xs text-emerald-600 dark:text-[#3ecf8e]">
                  <AnimatedCounter value={cashBalance} isCurrency />
                </strong>
              </button>

              {/* 2B. Bank UPI Balance Pill (xl+) */}
              <button
                type="button"
                onClick={() => setActivePage('treasury')}
                aria-label={`UPI Balance: ₹${upiBalance.toLocaleString('en-IN')}`}
                className="hidden xl:flex items-center gap-2 h-9 px-3 rounded-[6px] border border-slate-200/80 dark:border-[#242424] bg-slate-50/50 dark:bg-[#181818] text-slate-800 dark:text-[#ededed] hover:border-slate-300 dark:hover:border-[#2e2e2e] hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-mono transition-colors shadow-2xs cursor-pointer select-none shrink-0"
                title="Bank UPI account balance (Click to manage)"
              >
                <span className="text-[11px] uppercase font-mono tracking-wider text-slate-400 dark:text-[#707070]">UPI:</span>
                <strong className="font-semibold tabular-nums text-xs text-sky-500 dark:text-sky-400">
                  <AnimatedCounter value={upiBalance} isCurrency />
                </strong>
              </button>
            </>
          )}

          {/* 3. POS Quick Calculator Trigger */}
          <button
            type="button"
            onClick={() => setCalculatorOpen(true)}
            aria-label="POS Quick Calculator"
            className="hidden sm:flex items-center justify-center w-9 h-9 rounded-[6px] border border-slate-200/80 dark:border-[#242424] hover:border-slate-300 dark:hover:border-[#2e2e2e] bg-slate-50/50 dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-[#202020] text-slate-500 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-2xs shrink-0"
            title="POS Math, GST & Change Return Calculator"
          >
            <Calculator className="w-4 h-4 stroke-[1.8]" />
          </button>

          {/* 4. Cloud Sync Status Pill */}
          <button
            type="button"
            onClick={() => {
              if (mutations.length > 0 || !isOnline) {
                processSyncQueue();
              }
            }}
            disabled={isSyncing}
            aria-label={`Cloud Sync: ${!isOnline ? 'Offline' : isSyncing ? 'Syncing...' : mutations.length > 0 ? `${mutations.length} Pending` : 'Cloud Connected'}`}
            className={cn(
              'flex items-center gap-2 h-9 px-3 rounded-[6px] border text-xs font-mono transition-colors shadow-2xs select-none cursor-pointer',
              !isOnline
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15'
                : isSyncing
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e]'
                : mutations.length > 0
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 animate-pulse'
                : 'border-slate-200/80 dark:border-[#242424] bg-slate-50/50 dark:bg-[#181818] text-slate-700 dark:text-[#a1a1a1] hover:border-slate-300 dark:hover:border-[#2e2e2e] hover:bg-slate-100 dark:hover:bg-[#202020]'
            )}
            title={
              !isOnline
                ? `Offline: ${mutations.length} transactions queued locally. Click to retry connection.`
                : isSyncing
                ? 'Syncing offline mutations to cloud...'
                : mutations.length > 0
                ? `${mutations.length} offline transactions pending. Click to sync now.`
                : 'Supabase Cloud Connected — All data in sync'
            }
          >
            {!isOnline ? (
              <>
                <CloudOff className="w-4 h-4 text-rose-500 stroke-[1.8] animate-pulse shrink-0" />
                <span className="hidden sm:inline text-xs font-medium text-rose-600 dark:text-rose-400">Offline</span>
                {mutations.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400">
                    {mutations.length}
                  </span>
                )}
              </>
            ) : isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 dark:text-[#3ecf8e] stroke-[1.8] shrink-0" />
                <span className="hidden sm:inline text-xs font-medium text-emerald-600 dark:text-[#3ecf8e]">Syncing</span>
              </>
            ) : mutations.length > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 text-amber-500 stroke-[1.8] shrink-0" />
                <span className="hidden sm:inline text-xs font-medium text-amber-600 dark:text-amber-400">Sync</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  {mutations.length}
                </span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3ecf8e]"></span>
                </span>
                <span className="hidden xl:inline text-xs font-medium text-slate-700 dark:text-zinc-300 font-sans">
                  Connected
                </span>
              </>
            )}
          </button>

          {/* 5. User Profile Avatar & Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label={`User Menu: ${userFullName}`}
              aria-expanded={isUserMenuOpen}
              className={cn(
                'flex items-center gap-2.5 h-9 rounded-[6px] transition-colors cursor-pointer select-none px-2.5 border shadow-2xs',
                isUserMenuOpen
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e]'
                  : 'border-slate-200/80 dark:border-[#242424] bg-slate-50/50 dark:bg-[#181818] hover:border-slate-300 dark:hover:border-[#2e2e2e] hover:bg-slate-100 dark:hover:bg-[#202020]'
              )}
              title={`${userFullName} (${user?.role_code || 'Super Admin'})`}
            >
              {/* Avatar Photo / Initials */}
              <div className="relative w-6 h-6 shrink-0 flex items-center justify-center">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={userFullName}
                    className="w-6 h-6 rounded-full object-cover border border-emerald-500/30 shrink-0 shadow-2xs"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#3ecf8e] text-[#171717] font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                    {userInitials}
                  </div>
                )}
                {unreadNotifs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#141414]" />
                )}
              </div>

              <span className="hidden sm:inline-block text-xs font-semibold text-slate-800 dark:text-zinc-200 max-w-[95px] truncate font-sans">
                {user?.first_name || 'Admin'}
              </span>

              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-slate-400 dark:text-[#707070] transition-transform duration-150',
                  isUserMenuOpen && 'rotate-180 text-emerald-600 dark:text-[#3ecf8e]'
                )}
              />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl z-[100] overflow-hidden font-sans animate-in fade-in zoom-in-95 duration-100">
                {/* Header User Card */}
                <div className="p-3 bg-slate-50 dark:bg-[#141414] border-b border-slate-200/80 dark:border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={userFullName}
                        className="w-9 h-9 rounded-full object-cover border border-emerald-500/50 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#3ecf8e] text-[#171717] font-mono font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
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
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-[4px] text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] border border-emerald-500/20">
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
                      setIsUserMenuOpen(false);
                      setActivePage('profile');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                      activePage === 'profile'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white'
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
                      setIsUserMenuOpen(false);
                      setActivePage('notifications');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                      activePage === 'notifications'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white'
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
                        setIsUserMenuOpen(false);
                        setActivePage('settings');
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors cursor-pointer',
                        activePage === 'settings'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] font-medium'
                          : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white'
                      )}
                    >
                      <Settings className="w-4 h-4 text-slate-500 dark:text-[#a1a1a1] shrink-0 stroke-[1.8]" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate">Shop Settings & Rules</div>
                        <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Settings & overrides</div>
                      </div>
                    </button>
                  )}

                  {/* Theme Switcher */}
                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {theme === 'light' ? (
                      <Sun className="w-4 h-4 text-amber-500 shrink-0 stroke-[1.8]" />
                    ) : (
                      <Moon className="w-4 h-4 text-zinc-400 shrink-0 stroke-[1.8]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate flex items-center justify-between">
                        <span>Theme Mode</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-[4px] bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-zinc-300 capitalize font-medium">
                          {theme === 'dark' ? 'Studio Dark' : theme === 'soft-dark' ? 'Soft Dark' : 'Light'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Click to cycle Light / Dark</div>
                    </div>
                  </button>

                  <div className="border-t border-slate-100 dark:border-[#262626] my-1" />

                  {/* Lock Screen */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      lockScreen();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-amber-500 shrink-0 stroke-[1.8]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">Lock Screen</div>
                      <div className="text-[10px] text-slate-400 dark:text-[#707070] truncate">Quick lock counter terminal</div>
                    </div>
                  </button>

                  {/* Sign Out */}
                  <button
                    type="button"
                    onClick={() => {
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
    </div>
  );
};

export default Topbar;
