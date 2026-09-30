import { create } from 'zustand';
import { ExpenseVoucher, StaffAdvance } from '@/types/database';
import { showToast } from '@/components/ui/ToastContainer';

export type PageId =
  | 'dashboard'
  | 'new-voucher'
  | 'expenses'
  | 'treasury'
  | 'advances'
  | 'closing'
  | 'audit'
  | 'staff'
  | 'settings'
  | 'profile'
  | 'notifications'
  | '404';

export const VALID_PAGES: PageId[] = [
  'dashboard',
  'new-voucher',
  'expenses',
  'treasury',
  'advances',
  'closing',
  'audit',
  'staff',
  'settings',
  'profile',
  'notifications',
];

export type ThemeMode = 'dark' | 'light' | 'soft-dark';

interface UIState {
  theme: ThemeMode;
  activeDrawerVoucher: ExpenseVoucher | null;
  activeLightboxUrl: string | null;
  isSearchOpen: boolean;
  isMobileSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  activePage: PageId;

  // Modals & Tools
  isAdvanceModalOpen: boolean;
  isShortcutsModalOpen: boolean;
  isCalculatorOpen: boolean;
  settleTargetAdvance: StaffAdvance | null;
  isBulkImportOpen: boolean;
  bulkImportDefaultType: 'categories' | 'departments' | 'couriers' | 'staff' | 'branches';
  // Navigation Visibility (Auto-hide on mobile scroll down, reveal on scroll up)
  isNavVisible: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setNavVisible: (visible: boolean) => void;
  openDrawer: (voucher: ExpenseVoucher) => void;
  closeDrawer: () => void;
  openLightbox: (url: string) => void;
  closeLightbox: () => void;
  setSearchOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapse: () => void;
  setActivePage: (page: PageId, updateHistory?: boolean) => void;

  setAdvanceModalOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  setCalculatorOpen: (open: boolean) => void;
  toggleCalculator: () => void;
  setSettleTargetAdvance: (advance: StaffAdvance | null) => void;
  setBulkImportOpen: (
    open: boolean,
    defaultType?: 'categories' | 'departments' | 'couriers' | 'staff' | 'branches'
  ) => void;
}

const applyThemeToDom = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;
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

  // Update browser theme-color meta tag for native mobile navigation bars
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
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('asopalav-theme') as ThemeMode;
    if (saved === 'dark' || saved === 'light' || saved === 'soft-dark') {
      applyThemeToDom(saved);
      return saved;
    }
  }
  applyThemeToDom('dark');
  return 'dark';
};

const getInitialPage = (): PageId => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('page');
    if (!p) return 'dashboard';
    if (VALID_PAGES.includes(p as PageId)) return p as PageId;
    return '404';
  }
  return 'dashboard';
};

const initialTheme = getInitialTheme();
const initialPage = getInitialPage();

export const useUIStore = create<UIState>((set) => ({
  theme: initialTheme,
  activeDrawerVoucher: null,
  activeLightboxUrl: null,
  isSearchOpen: false,
  isMobileSidebarOpen: false,
  isSidebarCollapsed: false,
  activePage: initialPage,

  isAdvanceModalOpen: false,
  isShortcutsModalOpen: false,
  isCalculatorOpen: false,
  isHotkeyHudVisible: typeof window !== 'undefined' ? localStorage.getItem('asopalav-hotkey-hud') !== 'false' : true,
  settleTargetAdvance: null,
  isBulkImportOpen: false,
  bulkImportDefaultType: 'departments',
  isNavVisible: true,

  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('asopalav-theme', theme);
      applyThemeToDom(theme);
    }
    set({ theme });
    showToast({
      type: 'info',
      title: 'Theme Updated',
      message: `Switched display theme to ${theme.toUpperCase()}.`,
    });
  },
  toggleTheme: () => {
    set((state) => {
      const cycle: ThemeMode[] = ['dark', 'soft-dark', 'light'];
      const nextIdx = (cycle.indexOf(state.theme) + 1) % cycle.length;
      const nextTheme = cycle[nextIdx];
      if (typeof window !== 'undefined') {
        localStorage.setItem('asopalav-theme', nextTheme);
        applyThemeToDom(nextTheme);
      }
      showToast({
        type: 'info',
        title: 'Theme Switched',
        message: `Display mode: ${nextTheme === 'light' ? 'Light' : nextTheme === 'soft-dark' ? 'Soft Charcoal Dark' : 'Night Dark'}.`,
      });
      return { theme: nextTheme };
    });
  },
  setNavVisible: (isNavVisible) => set({ isNavVisible }),
  openDrawer: (voucher) => set({ activeDrawerVoucher: voucher }),
  closeDrawer: () => set({ activeDrawerVoucher: null }),
  openLightbox: (url) => set({ activeLightboxUrl: url }),
  closeLightbox: () => set({ activeLightboxUrl: null }),
  setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  setMobileSidebarOpen: (isMobileSidebarOpen) => set({ isMobileSidebarOpen }),
  toggleMobileSidebar: () => set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  toggleSidebarCollapse: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setActivePage: (activePage, updateHistory = true) => {
    if (typeof window !== 'undefined' && updateHistory) {
      const url = new URL(window.location.href);
      if (activePage === 'dashboard') {
        url.searchParams.delete('page');
      } else {
        url.searchParams.set('page', activePage);
      }
      window.history.pushState({ page: activePage }, '', url.toString());
    }
    set({ activePage, isMobileSidebarOpen: false });
  },

  setAdvanceModalOpen: (isAdvanceModalOpen) => set({ isAdvanceModalOpen }),
  setShortcutsModalOpen: (isShortcutsModalOpen) => set({ isShortcutsModalOpen }),
  setCalculatorOpen: (isCalculatorOpen) => set({ isCalculatorOpen }),
  toggleCalculator: () => set((state) => ({ isCalculatorOpen: !state.isCalculatorOpen })),
  setSettleTargetAdvance: (settleTargetAdvance) => set({ settleTargetAdvance }),
  setBulkImportOpen: (isBulkImportOpen, defaultType) =>
    set({
      isBulkImportOpen,
      ...(defaultType ? { bulkImportDefaultType: defaultType } : {}),
    }),
}));
