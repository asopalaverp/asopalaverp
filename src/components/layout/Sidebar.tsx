import React, { useState, useRef, useEffect } from 'react';
import { useUIStore, PageId } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useScrollLock } from '@/hooks/useScrollLock';
import {
  LayoutGrid,
  Receipt,
  Wallet,
  HandCoins,
  Coins,
  Users,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  ChevronsUpDown,
  Check,
  Lock,
  Search,
  Plus,
  X,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  Keyboard,
  Clock,
  Calculator,
  Store,
} from 'lucide-react';
import {
  AppTableIcon,
  AppSidebarCollapseIcon,
  AppSidebarExpandIcon,
} from '@/components/icons/AppIcons';
import { BrandLogo } from '@/components/icons/BrandLogo';
import { useBrandStore } from '@/store/brandStore';
import { cn, triggerHaptic } from '@/lib/utils';
import { RolePermissions } from '@/types/database';

interface NavItem {
  id: PageId;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  permission?: keyof RolePermissions;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { brandName } = useBrandStore();
  const {
    activePage,
    setActivePage,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    isSidebarCollapsed,
    toggleSidebarCollapse,
    theme,
    toggleTheme,
    setShortcutsModalOpen,
    setCalculatorOpen,
  } = useUIStore();
  const { user, can, getAllowedBranches, lockScreen, logout, getSessionTimeRemainingFormatted } = useAuthStore();
  const { branches, selectedBranchId, setSelectedBranchId, getActiveBranch } = useBranchStore();

  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement | null>(null);

  // Lock background window scrolling when mobile drawer is open
  useScrollLock(isMobileSidebarOpen);

  const allowedBranches = getAllowedBranches(branches);
  const activeBranch = getActiveBranch();
  const canViewAll = user?.role_code === 'Super_Admin' || user?.role_code === 'Developer' || can('can_view_all_branches');
  const isBranchSwitcherEnabled = canViewAll || allowedBranches.length > 1;

  const filteredBranches = allowedBranches.filter(
    (b) =>
      !branchSearch ||
      b.branch_name.toLowerCase().includes(branchSearch.toLowerCase()) ||
      b.branch_code.toLowerCase().includes(branchSearch.toLowerCase())
  );

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setIsProfilePopoverOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsBranchDropdownOpen(false);
        setIsProfilePopoverOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Keyboard shortcut: ESC to close mobile drawer
  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileSidebarOpen, setMobileSidebarOpen]);

  // Master Navigation Architecture
  const navSections: NavSection[] = [
    {
      title: 'Shop Work',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          description: 'Today’s money & shop summary',
          icon: LayoutGrid,
          badge: 'F1',
        },
        {
          id: 'new-voucher',
          label: 'Add Expense',
          description: 'Enter new bill or payment',
          icon: Receipt,
          badge: 'F2',
          permission: 'can_create_voucher',
        },
        {
          id: 'expenses',
          label: 'All Expenses',
          description: 'View & search all expense bills',
          icon: AppTableIcon,
          badge: 'F3',
        },
        {
          id: 'treasury',
          label: 'Cash Box & Bank',
          description: 'Count cash notes & add money',
          icon: Wallet,
          badge: 'F4',
          permission: 'can_inject_float',
        },
        {
          id: 'advances',
          label: 'Staff Advances',
          description: 'Staff money given & returned',
          icon: HandCoins,
          badge: 'F7',
          permission: 'can_disburse_advance',
        },
        {
          id: 'closing',
          label: 'Daily Cash Closing',
          description: 'Count night cash & print slip',
          icon: Coins,
          badge: 'F9',
          permission: 'can_verify_f9_closing',
        },
      ],
    },
    {
      title: 'Settings & Team',
      items: [
        {
          id: 'staff',
          label: 'Staff Directory',
          description: 'Staff accounts, PINs & permissions',
          icon: Users,
          badge: 'F10',
          permission: 'can_manage_users_roles',
        },
        {
          id: 'settings',
          label: 'Shop Settings',
          description: 'Categories, shops & cash notes',
          icon: SlidersHorizontal,
          badge: 'F11',
          permission: 'can_manage_periods',
        },
        {
          id: 'profile',
          label: 'My Profile & Security',
          description: 'Profile photo, PIN, and password',
          icon: ShieldCheck,
          badge: 'F12',
        },
        {
          id: 'audit',
          label: 'Activity History',
          description: 'Who did what and when',
          icon: ShieldAlert,
          badge: 'F8',
          permission: 'can_view_audit_logs',
        },
      ],
    },
  ];

  const isAllShowrooms = selectedBranchId === 'ALL';
  const currentBadgeCode = isAllShowrooms ? 'ALL' : activeBranch?.branch_code || 'ASI';
  const currentTitle = isAllShowrooms
    ? 'All Showrooms'
    : activeBranch?.branch_name || 'Asopalav - Satellite';
  const currentSubtitle = isAllShowrooms ? 'All Branches Combined' : 'Active Showroom';

  const userInitials =
    user?.avatar_initials ||
    (user?.first_name
      ? `${user.first_name[0]}${user.last_name ? user.last_name[0] : ''}`.toUpperCase()
      : 'AD');

  const sessionRemainingText = getSessionTimeRemainingFormatted();

  const CASHIER_ALLOWED_PAGES = new Set<PageId>(['dashboard', 'new-voucher', 'expenses', 'advances', 'closing', 'profile']);

  /* ========================================================================= */
  /* DESKTOP SIDEBAR CONTENT (lg: screens and above)                           */
  /* ========================================================================= */
  const desktopSidebarContent = (
    <div
      className={cn(
        'flex flex-col h-full select-none bg-white dark:bg-[#141414] border-r border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-[#EDEDED] font-sans transition-[width] duration-200 ease-out',
        isSidebarCollapsed ? 'w-16' : 'w-[240px]'
      )}
    >
      {/* 1. TOP HEADER: ACTIVE SHOWROOM SELECTOR */}
      <div className="h-12 px-2.5 flex items-center border-b border-slate-200 dark:border-[#1f1f1f] shrink-0 bg-white dark:bg-[#141414]">
        {!isSidebarCollapsed ? (
          <div className="relative w-full" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (isBranchSwitcherEnabled) {
                  setIsBranchDropdownOpen(!isBranchDropdownOpen);
                }
              }}
              disabled={!isBranchSwitcherEnabled}
              aria-label={`Current active showroom: ${currentTitle}`}
              className={cn(
                "w-full flex items-center justify-between p-1.5 rounded-[6px] border border-transparent transition-all text-left group",
                isBranchSwitcherEnabled ? "hover:bg-[#f4f4f5] dark:hover:bg-[#1f1f1f] cursor-pointer" : "cursor-default opacity-95"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-[6px] bg-emerald-500/10 dark:bg-[#3ecf8e]/10 border border-emerald-500/20 dark:border-[#3ecf8e]/20 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0 shadow-xs">
                  <Store className="w-3.5 h-3.5" />
                </div>
                <div className="truncate min-w-0">
                  <p className="text-xs font-medium text-[#171717] dark:text-[#ededed] tracking-[-0.2px] truncate leading-tight font-sans">
                    {currentTitle}
                  </p>
                  <p className="text-[10px] text-[#707070] dark:text-[#a1a1a1] font-sans truncate leading-tight mt-0.5">
                    {currentSubtitle}
                  </p>
                </div>
              </div>
              {isBranchSwitcherEnabled && (
                <ChevronsUpDown
                  className={cn(
                    'w-3.5 h-3.5 text-[#707070] group-hover:text-[#171717] dark:group-hover:text-white transition-transform duration-200 shrink-0 ml-1',
                    isBranchDropdownOpen && 'rotate-180 text-[#171717] dark:text-white'
                  )}
                />
              )}
            </button>

            {/* Branch Switcher Popup */}
            {isBranchDropdownOpen && isBranchSwitcherEnabled && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-[10px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl overflow-hidden py-1 text-xs font-sans animate-in fade-in zoom-in-95 duration-100 min-w-[220px]">
                <div className="px-2.5 py-1.5 border-b border-slate-200 dark:border-[#282828]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Find showroom outlet..."
                      value={branchSearch}
                      onChange={(e) => setBranchSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none w-full font-sans"
                    />
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
                  {canViewAll && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBranchId('ALL');
                          setIsBranchDropdownOpen(false);
                          setBranchSearch('');
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-[6px] text-left transition-colors font-sans cursor-pointer',
                          selectedBranchId === 'ALL'
                            ? 'bg-slate-100 dark:bg-[#242424] text-slate-900 dark:text-white font-medium'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#202020]'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0">
                            <Store className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="font-medium text-[#171717] dark:text-[#ededed] tracking-[-0.2px] truncate leading-tight">
                              All Showrooms
                            </div>
                            <div className="text-[10px] text-[#707070] dark:text-[#a1a1a1] leading-tight">
                              Combined View
                            </div>
                          </div>
                        </div>
                        {selectedBranchId === 'ALL' && (
                          <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                      <div className="border-t border-slate-100 dark:border-[#282828] my-1" />
                    </>
                  )}

                  {filteredBranches.map((b) => {
                    const isSelected = b.branch_id === selectedBranchId;
                    return (
                      <button
                        key={b.branch_id}
                        type="button"
                        onClick={() => {
                          setSelectedBranchId(b.branch_id);
                          setIsBranchDropdownOpen(false);
                          setBranchSearch('');
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-[6px] text-left transition-colors font-sans cursor-pointer',
                          isSelected
                            ? 'bg-[#f4f4f5] dark:bg-[#242424] text-[#171717] dark:text-white font-medium'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-[#f4f4f5] dark:hover:bg-[#202020]'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0">
                            <Store className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="font-medium text-[#171717] dark:text-[#ededed] tracking-[-0.2px] truncate leading-tight">
                              {b.branch_name}
                            </div>
                            <div className="text-[10px] text-[#707070] dark:text-[#a1a1a1] leading-tight">
                              Active Showroom
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {can('can_manage_periods') && (
                  <>
                    <div className="border-t border-slate-100 dark:border-[#282828] my-0.5" />
                    <div className="p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('settings');
                          setIsBranchDropdownOpen(false);
                          setBranchSearch('');
                        }}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-[4px] text-slate-700 dark:text-zinc-300 hover:text-[#171717] dark:hover:text-white bg-[#f4f4f5] dark:bg-[#202020] hover:bg-slate-200 dark:hover:bg-[#282828] transition-colors cursor-pointer font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Manage Showrooms</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
            className="w-8 h-8 rounded-[6px] bg-[#007a4d] text-white flex items-center justify-center font-medium text-xs font-mono tracking-tight mx-auto cursor-pointer shadow-xs hover:opacity-90 transition-opacity"
            title={`Active Showroom: ${currentTitle} (${currentBadgeCode})`}
          >
            {currentBadgeCode}
          </div>
        )}
      </div>

      {/* 2. NAVIGATION SECTIONS & ITEMS */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3">
        {navSections.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => {
            if (user?.role_code === 'Cashier') {
              return CASHIER_ALLOWED_PAGES.has(item.id);
            }
            if (!item.permission) return true;
            return can(item.permission);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className={cn('space-y-0.5', sIdx > 0 && 'pt-2.5 mt-1 border-t border-slate-100 dark:border-[#1e1e1e]')}>
              {!isSidebarCollapsed && (
                <div className="px-2 pb-1 text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 dark:text-[#707070]">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item, iIdx) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;

                  return (
                    <button
                      key={`${sIdx}-${iIdx}-${item.label}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setActivePage(item.id);
                        setMobileSidebarOpen(false);
                      }}
                      title={
                        isSidebarCollapsed
                          ? `${item.label} (${item.badge})`
                          : `${item.label} (${item.badge})`
                      }
                      aria-label={item.label}
                      className={cn(
                        'w-full flex items-center justify-between rounded-[6px] text-xs transition-all font-sans cursor-pointer group select-none',
                        isSidebarCollapsed ? 'justify-center p-2 h-9' : 'px-2 py-1.5 h-8.5',
                        isActive
                          ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white font-medium border border-slate-200 dark:border-[#2e2e2e] shadow-xs'
                          : 'text-slate-600 dark:text-[#a1a1a1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1a1a1a] border border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0 transition-colors stroke-[1.8]',
                            isActive
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-400 dark:text-[#707070] group-hover:text-slate-900 dark:group-hover:text-white'
                          )}
                        />
                        {!isSidebarCollapsed && (
                          <span className="truncate text-xs font-medium font-sans">
                            {item.label}
                          </span>
                        )}
                      </div>
                      {!isSidebarCollapsed && item.badge && (
                        <kbd
                          className={cn(
                            'text-[10px] font-mono px-1.5 py-0.2 rounded-[4px] transition-colors border',
                            isActive
                              ? 'bg-black/5 dark:bg-white/10 text-slate-800 dark:text-zinc-200 font-medium border-black/10 dark:border-white/10'
                              : 'text-slate-400 dark:text-[#606060] group-hover:text-slate-600 dark:group-hover:text-[#a1a1a1] border-transparent'
                          )}
                        >
                          {item.badge}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. BOTTOM UTILITIES & USER PROFILE */}
      <div className="p-2 border-t border-slate-200 dark:border-[#242424] shrink-0 space-y-1.5 bg-white dark:bg-[#171717] relative">
        {/* COLLAPSED MODE: Avatar with rich floating Popover */}
        {isSidebarCollapsed ? (
          <div className="relative flex justify-center" ref={profilePopoverRef}>
            <button
              type="button"
              onClick={() => setIsProfilePopoverOpen(!isProfilePopoverOpen)}
              title={`${user?.first_name || 'Admin'} ${user?.last_name || ''} - Account & Security (4h Session: ${sessionRemainingText})`}
              aria-label="User Account Menu"
              className={cn(
                'w-9 h-9 rounded-full relative flex items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-emerald-500/50',
                isProfilePopoverOpen && 'ring-2 ring-emerald-500'
              )}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.first_name || 'User'}
                  className="w-8 h-8 rounded-full object-cover border border-emerald-500/40 shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-mono font-medium text-xs flex items-center justify-center shadow-xs">
                  {userInitials}
                </div>
              )}
              {/* Online status indicator dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#3ecf8e] border-2 border-white dark:border-[#141414] rounded-full" />
            </button>

            {/* Collapsed Profile Flyout Popover */}
            {isProfilePopoverOpen && (
              <div className="absolute left-[calc(100%+8px)] bottom-0 z-50 w-64 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] rounded-[12px] shadow-2xl p-3 space-y-3 font-sans animate-in fade-in zoom-in-95 duration-150">
                {/* User Info Header */}
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-[#262626]">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.first_name || 'User'}
                      className="w-10 h-10 rounded-full object-cover border-2 border-[#3ecf8e] shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#3ecf8e] text-[#171717] font-mono font-medium text-sm flex items-center justify-center shadow-xs shrink-0">
                      {userInitials}
                    </div>
                  )}
                  <div className="truncate min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                      {user?.first_name
                        ? `${user.first_name} ${user.last_name || ''}`.trim()
                        : user?.username || 'Admin'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-[#8e8e8e] font-mono truncate mt-0.5">
                      {user?.role_code ? user.role_code.replace('_', ' ') : 'Super Admin'} · @{user?.username || 'admin'}
                    </p>
                  </div>
                </div>

                {/* 4-Hour Session Security Pill */}
                <div className="px-2.5 py-1.5 rounded-[6px] bg-slate-50 dark:bg-[#202020] border border-slate-200/80 dark:border-[#2e2e2e] flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-[#a1a1a1]">
                    <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>4h Session Active</span>
                  </div>
                  <span className="text-emerald-700 dark:text-[#3ecf8e] font-medium">{sessionRemainingText}</span>
                </div>

                {/* Popover Actions List */}
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setActivePage('profile');
                      setIsProfilePopoverOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>My Profile & Security</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('warning');
                      setIsProfilePopoverOpen(false);
                      lockScreen();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Lock Screen</span>
                    </div>
                    <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-500">
                      F12
                    </kbd>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setIsProfilePopoverOpen(false);
                      setShortcutsModalOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Keyboard className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Shortcuts</span>
                    </div>
                    <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-500">
                      ?
                    </kbd>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfilePopoverOpen(false);
                      toggleSidebarCollapse();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <AppSidebarExpandIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Expand Sidebar</span>
                    </div>
                    <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-500">
                      Ctrl+B
                    </kbd>
                  </button>
                </div>

                <div className="border-t border-slate-100 dark:border-[#262626] pt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('warning');
                      setIsProfilePopoverOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* EXPANDED MODE: User Profile Card & Action Row */
          <div className="space-y-1.5">
            <button
              onClick={() => {
                triggerHaptic('selection');
                setActivePage('profile');
              }}
              title={`${user?.first_name || 'Admin'} ${user?.last_name || ''} - My Profile & Security`}
              aria-label="My Profile & Security"
              className={cn(
                'w-full flex items-center p-2 rounded-[8px] text-xs transition-all font-sans cursor-pointer group select-none border text-left',
                activePage === 'profile'
                  ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-[#3ecf8e]'
                  : 'bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#202020] border-slate-200/80 dark:border-[#2a2a2a] text-slate-800 dark:text-zinc-200'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 w-full">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.first_name || 'User'}
                    className="w-7 h-7 rounded-full object-cover border border-emerald-500/40 shrink-0 shadow-2xs"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-medium text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {userInitials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-xs text-slate-900 dark:text-white truncate leading-tight group-hover:text-emerald-600 dark:group-hover:text-[#3ecf8e] transition-colors">
                    {user?.first_name
                      ? `${user.first_name} ${user.last_name || ''}`.trim()
                      : user?.username || 'Admin'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-[#8e8e8e] font-mono truncate leading-tight mt-0.5 flex items-center justify-between">
                    <span>{user?.role_code ? user.role_code.replace('_', ' ') : 'Super Admin'}</span>
                    <span className="text-emerald-600 dark:text-[#3ecf8e] font-medium" title="4h Session Lifespan">
                      {sessionRemainingText}
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {/* Quick Action Toolbar */}
            <div className="grid grid-cols-4 gap-1 pt-0.5">
              {/* Keyboard Shortcuts Trigger */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setShortcutsModalOpen(true);
                }}
                title="Keyboard Shortcuts (?)"
                aria-label="Keyboard Shortcuts"
                className="h-7 rounded-[5px] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] border border-slate-200/80 dark:border-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>

              {/* Instant Lock Screen */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('warning');
                  lockScreen();
                }}
                title="Lock Terminal Screen (F12 / Alt+L)"
                aria-label="Lock Screen"
                className="h-7 rounded-[5px] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-950/20 border border-slate-200/80 dark:border-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>

              {/* Collapse Sidebar */}
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                title="Collapse Sidebar (Ctrl+B)"
                aria-label="Collapse Sidebar"
                className="h-7 rounded-[5px] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] border border-slate-200/80 dark:border-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <AppSidebarCollapseIcon className="w-3.5 h-3.5" />
              </button>

              {/* Sign Out */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('warning');
                  logout();
                }}
                title="Sign Out"
                aria-label="Sign Out"
                className="h-7 rounded-[5px] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-slate-200/80 dark:border-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ========================================================================= */
  /* NATIVE SLIDE-OVER MOBILE DRAWER (< lg)                                    */
  /* ========================================================================= */
  const mobileSlideOverDrawer = (
    <div className="lg:hidden fixed inset-0 z-50 flex select-none">
      {/* 1. Backdrop Overlay */}
      <div
        onClick={() => {
          triggerHaptic('light');
          setMobileSidebarOpen(false);
        }}
        className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-md transition-opacity duration-200 animate-in fade-in"
      />

      {/* 2. Slide-In Sheet Container (Full Screen on Mobile) */}
      <div className="relative w-full max-w-full h-full bg-white dark:bg-[#141414] shadow-2xl flex flex-col overflow-hidden z-10 animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-[#242424] bg-white dark:bg-[#171717] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-slate-100 dark:bg-[#202020] border border-slate-200 dark:border-[#2e2e2e] flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
              <BrandLogo size={20} className="w-5 h-5 object-contain" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white font-sans truncate">
                {brandName} ERP
              </span>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setMobileSidebarOpen(false);
            }}
            aria-label="Close navigation menu"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#222222] hover:bg-slate-200 dark:hover:bg-[#2c2c2c] text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border border-slate-200/80 dark:border-[#2e2e2e]"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Unified Fluid Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 space-y-4 pb-12 bg-slate-50/50 dark:bg-[#121212]">
          {/* SECTION A: ACTIVE SHOWROOM OUTLET SWITCHER */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 dark:text-zinc-500 px-1">
              Active Showroom
            </div>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (isBranchSwitcherEnabled) {
                    triggerHaptic('selection');
                    setIsBranchDropdownOpen(!isBranchDropdownOpen);
                  }
                }}
                disabled={!isBranchSwitcherEnabled}
                className={cn(
                  "w-full flex items-center justify-between p-2.5 rounded-[10px] bg-white dark:bg-[#1a1a1a] border border-slate-200/90 dark:border-[#282828] text-left transition-colors shadow-xs",
                  isBranchSwitcherEnabled ? "cursor-pointer active:scale-[0.99]" : "cursor-default opacity-95"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-[6px] bg-emerald-500/10 dark:bg-[#3ecf8e]/10 border border-emerald-500/20 dark:border-[#3ecf8e]/20 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0 shadow-2xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white block leading-tight font-sans truncate">
                      {currentTitle}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans block mt-0.5">
                      {isBranchSwitcherEnabled ? 'Tap to switch branch' : 'Assigned Showroom'}
                    </span>
                  </div>
                </div>
                {isBranchSwitcherEnabled && (
                  <ChevronsUpDown
                    className={cn(
                      'w-4 h-4 text-slate-400 dark:text-zinc-400 shrink-0 transition-transform duration-200',
                      isBranchDropdownOpen && 'rotate-180 text-slate-900 dark:text-white'
                    )}
                  />
                )}
              </button>

              {/* Showroom List Dropdown */}
              {isBranchDropdownOpen && isBranchSwitcherEnabled && (
                <div className="mt-1.5 rounded-[10px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] shadow-xl overflow-hidden py-1 text-xs font-sans animate-in fade-in duration-100">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-[#282828]">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Find showroom branch..."
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none w-full"
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
                    {canViewAll && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection');
                            setSelectedBranchId('ALL');
                            setIsBranchDropdownOpen(false);
                            setBranchSearch('');
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-[6px] text-left transition-colors font-sans cursor-pointer',
                            selectedBranchId === 'ALL'
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-[#3ecf8e] font-medium'
                              : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#202020]'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0">
                              <Store className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white leading-tight">
                                All Showrooms
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                                Combined View
                              </div>
                            </div>
                          </div>
                          {selectedBranchId === 'ALL' && (
                            <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                        <div className="border-t border-slate-100 dark:border-[#282828] my-0.5" />
                      </>
                    )}

                    {filteredBranches.map((b) => {
                      const isSelected = b.branch_id === selectedBranchId;
                      return (
                        <button
                          key={b.branch_id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection');
                            setSelectedBranchId(b.branch_id);
                            setIsBranchDropdownOpen(false);
                            setBranchSearch('');
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-[6px] text-left transition-colors font-sans cursor-pointer',
                            isSelected
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-[#3ecf8e] font-medium'
                              : 'text-slate-700 dark:text-zinc-300 hover:bg-[#f4f4f5] dark:hover:bg-[#202020]'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center shrink-0">
                              <Store className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate">
                              <div className="font-medium text-slate-900 dark:text-white leading-tight truncate">
                                {b.branch_name}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                                Active Showroom
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION B: APP NAVIGATION SECTIONS */}
          {navSections.map((section, sIdx) => {
            const visibleItems = section.items.filter((item) => {
              if (user?.role_code === 'Cashier') {
                return CASHIER_ALLOWED_PAGES.has(item.id);
              }
              if (!item.permission) return true;
              return can(item.permission);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1">
                <div className="px-1 text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  {section.title}
                </div>
                <div className="space-y-1">
                  {visibleItems.map((item, iIdx) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;

                    return (
                      <button
                        key={`mob-${sIdx}-${iIdx}-${item.label}`}
                        onClick={() => {
                          triggerHaptic('selection');
                          setActivePage(item.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-all font-sans cursor-pointer group select-none min-h-[44px] active:scale-[0.98]',
                          isActive
                            ? 'bg-emerald-500/12 dark:bg-[#3ecf8e]/15 border border-emerald-500/30 dark:border-[#3ecf8e]/30 text-emerald-900 dark:text-[#3ecf8e] shadow-xs font-semibold'
                            : 'bg-white dark:bg-[#1a1a1a] border border-slate-200/80 dark:border-[#262626] text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-[#222222]'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0 transition-colors',
                              isActive
                                ? 'bg-emerald-500/20 dark:bg-[#3ecf8e]/20 text-emerald-700 dark:text-[#3ecf8e]'
                                : 'bg-slate-100 dark:bg-[#222222] text-slate-600 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-white'
                            )}
                          >
                            <Icon className="w-4 h-4 stroke-[2]" />
                          </div>
                          <span className="text-xs font-medium block leading-tight font-sans truncate">
                            {item.label}
                          </span>
                        </div>

                        <ChevronRight
                          className={cn(
                            'w-3.5 h-3.5 opacity-50 shrink-0 transition-transform',
                            isActive ? 'text-emerald-700 dark:text-[#3ecf8e] translate-x-0.5 opacity-90' : 'text-slate-400'
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* SECTION C: USER PROFILE & SESSION CONTROLS */}
          <div className="space-y-1.5 pt-1">
            <div className="px-1 text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Account & Security
            </div>
            <div className="p-3 rounded-[12px] bg-white dark:bg-[#1a1a1a] border border-slate-200/80 dark:border-[#262626] space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.first_name || 'User'}
                      className="w-9 h-9 rounded-full object-cover border-2 border-[#3ecf8e] shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#3ecf8e] text-[#171717] font-medium text-xs flex items-center justify-center font-mono shadow-xs shrink-0">
                      {userInitials}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight font-sans truncate">
                      {user?.first_name
                        ? `${user.first_name} ${user.last_name || ''}`.trim()
                        : user?.username || 'Admin'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono truncate mt-0.5">
                      {user?.role_code ? user.role_code.replace('_', ' ') : 'Super Admin'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setActivePage('profile');
                    setMobileSidebarOpen(false);
                  }}
                  className="px-2.5 py-1 text-xs font-sans font-medium rounded-[6px] bg-slate-100 dark:bg-[#242424] border border-slate-200 dark:border-[#333] text-slate-800 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                >
                  Profile
                </button>
              </div>

              {/* 4h Session info row */}
              <div className="px-2 py-1 rounded-[6px] bg-slate-50 dark:bg-[#202020] border border-slate-100 dark:border-[#282828] flex items-center justify-between text-[10px] font-mono text-slate-600 dark:text-[#a1a1a1]">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  <span>4h Session:</span>
                </div>
                <span className="text-emerald-700 dark:text-[#3ecf8e] font-medium">{sessionRemainingText}</span>
              </div>

              {/* System Actions Grid */}
              <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-slate-100 dark:border-[#242424]">
                {/* Theme Switcher */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    toggleTheme();
                  }}
                  className="p-1.5 rounded-[6px] bg-slate-50 dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] border border-slate-200/80 dark:border-[#2e2e2e] text-slate-700 dark:text-zinc-300 flex flex-col items-center justify-center gap-1 text-[10px] font-sans cursor-pointer transition-colors active:scale-95 min-h-[44px]"
                  title={`Theme: ${theme}`}
                >
                  {theme === 'light' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span className="capitalize text-[9px]">
                    {theme === 'soft-dark' ? 'Soft' : theme}
                  </span>
                </button>

                {/* Keyboard Shortcuts */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setMobileSidebarOpen(false);
                    setShortcutsModalOpen(true);
                  }}
                  className="p-1.5 rounded-[6px] bg-slate-50 dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] border border-slate-200/80 dark:border-[#2e2e2e] text-slate-700 dark:text-zinc-300 flex flex-col items-center justify-center gap-1 text-[10px] font-sans cursor-pointer transition-colors active:scale-95 min-h-[44px]"
                  title="Keyboard Shortcuts"
                >
                  <Keyboard className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                  <span className="text-[9px]">Shortcuts</span>
                </button>

                {/* Screen Lock */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setMobileSidebarOpen(false);
                    lockScreen();
                  }}
                  className="p-1.5 rounded-[6px] bg-slate-50 dark:bg-[#202020] hover:bg-slate-100 dark:hover:bg-[#282828] border border-slate-200/80 dark:border-[#2e2e2e] text-slate-700 dark:text-zinc-300 flex flex-col items-center justify-center gap-1 text-[10px] font-sans cursor-pointer transition-colors active:scale-95 min-h-[44px]"
                  title="Lock Screen"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                  <span className="text-[9px]">Lock</span>
                </button>

                {/* Sign Out */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('warning');
                    setMobileSidebarOpen(false);
                    logout();
                  }}
                  className="p-1.5 rounded-[6px] bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 border border-rose-200/80 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 flex flex-col items-center justify-center gap-1 text-[10px] font-sans cursor-pointer transition-colors active:scale-95 min-h-[44px]"
                  title="Sign out of account"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span className="text-[9px]">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar (lg: screens and above) */}
      <aside
        className={cn(
          'hidden lg:block shrink-0 sticky top-0 h-screen z-30 transition-[width] duration-200 ease-out',
          isSidebarCollapsed ? 'w-16' : 'w-[240px]'
        )}
      >
        {desktopSidebarContent}
      </aside>

      {/* Slide-Over Mobile Drawer */}
      {isMobileSidebarOpen && mobileSlideOverDrawer}
    </>
  );
};

export default Sidebar;
