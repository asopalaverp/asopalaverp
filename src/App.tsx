import React, { useEffect, useRef, useLayoutEffect, Suspense, lazy } from 'react';
import { useAuthStore, isPrivilegedAdminRole } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useUIStore, PageId } from '@/store/uiStore';
import { useBrandStore } from '@/store/brandStore';
import { useNotificationStore } from '@/store/notificationStore';
import { RolePermissions } from '@/types/database';
import { useHotkeys } from '@/hooks/useHotkeys';

// Layout Components (Synchronous for instantaneous shell rendering)
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PageTransition } from '@/components/layout/PageTransition';
import { PinLockOverlay } from '@/components/layout/PinLockOverlay';
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner';
import { ToastContainer, showToast } from '@/components/ui/ToastContainer';
import { PageLoadingSkeleton } from '@/components/ui/PageLoadingSkeleton';
import { cn } from '@/lib/utils';

// Route-Based Dynamic Imports (React.lazy)
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const NewVoucherPage = lazy(() => import('@/pages/NewVoucherPage').then((m) => ({ default: m.NewVoucherPage })));
const AllExpensesPage = lazy(() => import('@/pages/AllExpensesPage').then((m) => ({ default: m.AllExpensesPage })));
const CashDrawerTreasuryPage = lazy(() =>
  import('@/pages/CashDrawerTreasuryPage').then((m) => ({ default: m.CashDrawerTreasuryPage }))
);
const DailyCashClosingPage = lazy(() =>
  import('@/pages/DailyCashClosingPage').then((m) => ({ default: m.DailyCashClosingPage }))
);
const StaffAdvancesPage = lazy(() =>
  import('@/pages/StaffAdvancesPage').then((m) => ({ default: m.StaffAdvancesPage }))
);
const SecurityAuditPage = lazy(() =>
  import('@/pages/SecurityAuditPage').then((m) => ({ default: m.SecurityAuditPage }))
);
const StaffDirectoryPage = lazy(() =>
  import('@/pages/StaffDirectoryPage').then((m) => ({ default: m.StaffDirectoryPage }))
);
const ShowroomSettingsPage = lazy(() =>
  import('@/pages/ShowroomSettingsPage').then((m) => ({ default: m.ShowroomSettingsPage }))
);
const ProfileSecurityPage = lazy(() =>
  import('@/pages/ProfileSecurityPage').then((m) => ({ default: m.ProfileSecurityPage }))
);
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
import { AppErrorBoundary } from '@/components/common/AppErrorBoundary';

// Global Drawers & Modals (Lazy Loaded on demand)
const GlobalSearchModal = lazy(() =>
  import('@/components/common/GlobalSearchModal').then((m) => ({ default: m.GlobalSearchModal }))
);
const KeyboardShortcutsModal = lazy(() =>
  import('@/components/common/KeyboardShortcutsModal').then((m) => ({ default: m.KeyboardShortcutsModal }))
);
const VoucherDetailDrawer = lazy(() =>
  import('@/components/vouchers/VoucherDetailDrawer').then((m) => ({ default: m.VoucherDetailDrawer }))
);
const NewAdvanceDrawer = lazy(() =>
  import('@/components/advances/NewAdvanceDrawer').then((m) => ({ default: m.NewAdvanceDrawer }))
);
const SettleAdvanceDrawer = lazy(() =>
  import('@/components/advances/SettleAdvanceDrawer').then((m) => ({ default: m.SettleAdvanceDrawer }))
);
const BulkMasterDataImportModal = lazy(() =>
  import('@/components/common/BulkMasterDataImportModal').then((m) => ({ default: m.BulkMasterDataImportModal }))
);
const ImageLightbox = lazy(() =>
  import('@/components/ui/ImageLightbox').then((m) => ({ default: m.ImageLightbox }))
);
const PosQuickCalculator = lazy(() =>
  import('@/components/common/PosQuickCalculator').then((m) => ({ default: m.PosQuickCalculator }))
);

const AccessDeniedView = lazy(() =>
  import('@/components/common/AccessDeniedView').then((m) => ({ default: m.AccessDeniedView }))
);

import { VALID_PAGES } from '@/store/uiStore';
import { initRealtimeSync, teardownRealtimeSync } from '@/lib/realtimeSync';

// Prefetch high-frequency operational routes during browser idle time
const prefetchCoreRoutes = () => {
  if (typeof window !== 'undefined') {
    const prefetch = () => {
      import('@/pages/DashboardPage');
      import('@/pages/NewVoucherPage');
      import('@/pages/AllExpensesPage');
      import('@/pages/StaffAdvancesPage');
      import('@/pages/DailyCashClosingPage');
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(prefetch, { timeout: 2000 });
    } else {
      setTimeout(prefetch, 1000);
    }
  }
};

const CASHIER_ALLOWED_PAGES: PageId[] = [
  'dashboard',
  'new-voucher',
  'expenses',
  'advances',
  'closing',
  'profile',
  'notifications',
];

const PAGE_PERMISSIONS: Partial<Record<PageId, keyof RolePermissions>> = {
  'treasury': 'can_inject_float',
  'staff': 'can_manage_users_roles',
  'settings': 'can_manage_periods',
  'audit': 'can_view_audit_logs',
};

// Pages accessible to all authenticated users
const PUBLIC_PAGES: PageId[] = [
  'dashboard', 'new-voucher', 'expenses', 'advances',
  'closing', 'profile', 'notifications',
];

export const App: React.FC = () => {
  const { isAuthenticated, user, getAllowedBranches, can, isLocked } = useAuthStore();
  const {
    activePage,
    theme,
  } = useUIStore();
  const { fetchBranchesAndWallets, branches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const mainRef = useRef<HTMLElement | null>(null);

  useHotkeys();

  // Branch boundary guard: Ensure single-branch users never see unauthorized branch data
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const isSuper = isPrivilegedAdminRole(user.role_code);
    if (!isSuper && branches.length > 0) {
      const allowed = getAllowedBranches(branches);
      const isCurrentAllowed = allowed.some(
        (b) => b.branch_id === selectedBranchId || b.branch_code === selectedBranchId
      );
      if (!isCurrentAllowed && allowed.length > 0 && selectedBranchId !== allowed[0].branch_id) {
        showToast({
          type: 'warning',
          title: 'Branch Access Restricted',
          message: `You are authorized for ${allowed[0].branch_name}.`,
        });
        setSelectedBranchId(allowed[0].branch_id);
      }
    }
  }, [isAuthenticated, user, selectedBranchId, branches]);

  // C-3 Security: On startup, re-validate the session role/status against Supabase DB.
  // This catches localStorage role tampering within ~1 second of app load.
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      useAuthStore.getState().verifySessionIntegrity();
    }
  }, [isAuthenticated, user?.id]);

  // Route security guard: Redirect cashiers away from restricted pages
  useEffect(() => {
    if (!user) return;
    const requiredPerm = PAGE_PERMISSIONS[activePage];
    if (requiredPerm && !can(requiredPerm)) {
      showToast({
        type: 'error',
        title: 'Access Restricted',
        message: `You don't have permission to access this page.`,
      });
      useUIStore.getState().setActivePage('dashboard');
    }
  }, [activePage, user?.role_code]);

  // Always reset scroll to top whenever the active page changes
  useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activePage]);

  // Load branches, wallet state, realtime channel, and idle-prefetch routes
  useEffect(() => {
    // Purge any stale mock cache keys from browser localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('asopalav_pos_drafts_v1');
      } catch {}
      const FRESH_SLATE_KEY = 'asopalav_fresh_slate_v6';
      if (!localStorage.getItem(FRESH_SLATE_KEY)) {
        const keysToPurge: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (
            k &&
            (k.startsWith('asopalav_vouchers') ||
              k.startsWith('asopalav_advances') ||
              k.startsWith('asopalav_wallet') ||
              k.startsWith('asopalav_ledger') ||
              k.startsWith('asopalav_audit') ||
              k.startsWith('asopalav-notifications') ||
              k.startsWith('asopalav_pos_drafts') ||
              k.startsWith('asopalav_bulk_draft'))
          ) {
            keysToPurge.push(k);
          }
        }
        keysToPurge.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(FRESH_SLATE_KEY, 'true');
      }
    }

    useBrandStore.getState().applyBrandToDocument();
    useBrandStore.getState().fetchBrandSettings();
    useNotificationStore.getState().fetchCloudNotifications();
    fetchBranchesAndWallets(true);

    // H-6: Pass user's allowed branches so financial Realtime events are branch-scoped.
    // Super_Admin / Developer get all branches ('*'). Cashiers only see their assigned branches.
    const currentUser = useAuthStore.getState().user;
    const allowedBranches = currentUser?.assigned_branches ?? [];
    const cleanupRealtime = initRealtimeSync(allowedBranches);

    prefetchCoreRoutes();
    return () => {
      cleanupRealtime?.();
    };
  }, [fetchBranchesAndWallets]);

  // Tear down realtime channel immediately on logout so cross-branch leakage stops
  useEffect(() => {
    if (!isAuthenticated) {
      teardownRealtimeSync();
    }
  }, [isAuthenticated]);

  // 4-Hour Security Session Expiration Heartbeat
  useEffect(() => {
    if (!isAuthenticated) return;

    // Run check immediately on mount
    useAuthStore.getState().checkSessionExpiry();

    const interval = setInterval(() => {
      useAuthStore.getState().checkSessionExpiry();
    }, 30000); // Check every 30 seconds

    const handleFocus = () => {
      useAuthStore.getState().checkSessionExpiry();
      fetchBranchesAndWallets(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        useAuthStore.getState().checkSessionExpiry();
        fetchBranchesAndWallets(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, fetchBranchesAndWallets]);

  // Global Uncaught Error & Unhandled Rejection Listeners for Animated Toasts
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('Unhandled app runtime error:', event.error);
      showToast({
        type: 'error',
        title: 'Unexpected Error',
        message: event.message || 'An unexpected error occurred.',
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      const msg =
        event.reason?.message ||
        (typeof event.reason === 'string' ? event.reason : 'Request failed. Please check your internet connection.');
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: msg,
      });
    };

    const handleActivity = (e: any) => {
      if (e.detail) {
        showToast({
          type: e.detail.type || 'activity',
          title: e.detail.title || 'Activity',
          message: e.detail.message || '',
        });
      }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('asopalav:activity', handleActivity);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('asopalav:activity', handleActivity);
    };
  }, []);

  // Synchronize browser history Back/Forward button clicks with active page and branch
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const pageParam = params.get('page');
      if (!pageParam) {
        useUIStore.getState().setActivePage('dashboard', false);
      } else if (VALID_PAGES.includes(pageParam as PageId)) {
        useUIStore.getState().setActivePage(pageParam as PageId, false);
      } else {
        useUIStore.getState().setActivePage('404', false);
      }

      const branchParam = params.get('branch');
      if (branchParam) {
        const branches = useBranchStore.getState().branches;
        const matching = branches.find(
          (b) => b.branch_code.toLowerCase() === branchParam.toLowerCase() || b.branch_id === branchParam
        );
        if (matching) {
          const authState = useAuthStore.getState();
          const allowed = authState.getAllowedBranches(branches);
          const isAllowed = allowed.some((ab) => ab.branch_id === matching.branch_id || ab.branch_code === matching.branch_code);
          if (isAllowed) {
            useBranchStore.getState().setSelectedBranchId(matching.branch_id);
          } else {
            showToast({
              type: 'error',
              title: 'Branch Access Denied',
              message: `You are not authorized to view records for ${matching.branch_name}.`,
            });
            if (allowed.length > 0) {
              useBranchStore.getState().setSelectedBranchId(allowed[0].branch_id);
            }
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Synchronize theme classes with html and body elements
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('dark', 'soft-dark', 'light');
    if (body) body.classList.remove('dark', 'soft-dark', 'light');

    if (theme === 'dark') {
      root.classList.add('dark');
      if (body) body.classList.add('dark');
    } else if (theme === 'soft-dark') {
      root.classList.add('dark', 'soft-dark');
      if (body) body.classList.add('dark', 'soft-dark');
    } else {
      root.classList.add('light');
      if (body) body.classList.add('light');
    }
    root.setAttribute('data-theme', theme);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      if (theme === 'light') {
        metaThemeColor.setAttribute('content', '#ffffff');
      } else if (theme === 'soft-dark') {
        metaThemeColor.setAttribute('content', '#181a20');
      } else {
        metaThemeColor.setAttribute('content', '#141414');
      }
    }
  }, [theme]);

  // If user is unauthenticated, render lazy Login portal
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div className="h-screen w-screen bg-[#141414] flex items-center justify-center" />}>
        <LoginPage />
      </Suspense>
    );
  }

  // Active page renderer mapping
  const renderActivePage = () => {
    const requiredPerm = PAGE_PERMISSIONS[activePage];
    if (requiredPerm && !can(requiredPerm)) {
      return (
        <AccessDeniedView
          pageName={activePage}
          message={`Your role does not have permission to access this page.`}
          onGoBack={() => useUIStore.getState().setActivePage('dashboard')}
        />
      );
    }

    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'new-voucher':
        return <NewVoucherPage />;
      case 'expenses':
        return <AllExpensesPage />;
      case 'treasury':
        return <CashDrawerTreasuryPage />;
      case 'closing':
        return <DailyCashClosingPage />;
      case 'advances':
        return <StaffAdvancesPage />;
      case 'audit':
        return <SecurityAuditPage />;
      case 'staff':
        return <StaffDirectoryPage />;
      case 'settings':
        return <ShowroomSettingsPage />;
      case 'profile':
        return <ProfileSecurityPage />;
      case 'notifications':
        return <NotificationsPage />;
      case '404':
        return <NotFoundPage />;
      default:
        return <NotFoundPage />;
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] flex flex-col overflow-hidden text-sm font-sans antialiased selection:bg-primary/20 selection:text-slate-900 dark:selection:text-white">
      {/* Full-Width Top Announcement / Offline Banner */}
      <AnnouncementBanner />

      {/* Main Workspace Layout (Sidebar + Canvas) */}
      <div className="flex-1 flex overflow-hidden min-w-0 min-h-0 bg-white dark:bg-[#141414]">
        {/* 1. Enterprise Navigation Sidebar */}
        <Sidebar />

        {/* 2. Workspace Column */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-white dark:bg-[#141414]">
          {/* Top Command Navigation Header */}
          <header className="shrink-0 z-50 relative select-none bg-white dark:bg-[#141414]">
            <Topbar />
          </header>

          {/* Workspace Canvas Area with Suspense Fallback */}
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto bg-white dark:bg-[#141414] focus:outline-none transition-all duration-200 ease-out flex flex-col p-0 pb-20 lg:pb-0"
          >
            {!isLocked && (
              <PageTransition pageKey={activePage}>
                <AppErrorBoundary key={activePage}>
                  <Suspense key={activePage} fallback={<PageLoadingSkeleton />}>
                    {renderActivePage()}
                  </Suspense>
                </AppErrorBoundary>
              </PageTransition>
            )}
            {isLocked && (
              <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#3ecf8e]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  </div>
                  <p className="text-sm text-[#878787]">Terminal Locked</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 3. Native Mobile Bottom Tab Navigation */}
      <MobileBottomNav />

      {/* 4. Global Overlay Components & Drawers (Lazy Loaded) */}
      <Suspense fallback={null}>
        <GlobalSearchModal />
        <KeyboardShortcutsModal />
        <PosQuickCalculator />
        <PinLockOverlay />
        <VoucherDetailDrawer />
        <NewAdvanceDrawer onSuccess={() => window.dispatchEvent(new CustomEvent('asopalav:wallet-updated'))} />
        <SettleAdvanceDrawer onSuccess={() => window.dispatchEvent(new CustomEvent('asopalav:wallet-updated'))} />
        <BulkMasterDataImportModal />
        <ImageLightbox />
        <ToastContainer />
      </Suspense>
    </div>
  );
};

export default App;
