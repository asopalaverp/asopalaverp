import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { showToast } from '@/components/ui/ToastContainer';
import { triggerHaptic } from '@/lib/utils';

export function useHotkeys() {
  const {
    setActivePage,
    closeDrawer,
    closeLightbox,
    activeDrawerVoucher,
    activeLightboxUrl,
    isSearchOpen,
    setSearchOpen,
    isAdvanceModalOpen,
    setAdvanceModalOpen,
    isShortcutsModalOpen,
    setShortcutsModalOpen,
    isCalculatorOpen,
    setCalculatorOpen,
    settleTargetAdvance,
    setSettleTargetAdvance,
    toggleSidebarCollapse,
  } = useUIStore();
  const { isLocked, lockScreen, user, can } = useAuthStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // If screen is locked, only allow unlock interactions in PinLockOverlay
      if (isLocked) return;

      const key = e.key;
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag);

      // Escape to close open modals, drawers, or lightbox (Works everywhere)
      if (key === 'Escape') {
        if (activeLightboxUrl) {
          e.preventDefault();
          closeLightbox();
          return;
        }
        if (isCalculatorOpen) {
          e.preventDefault();
          setCalculatorOpen(false);
          return;
        }
        if (isShortcutsModalOpen) {
          e.preventDefault();
          setShortcutsModalOpen(false);
          return;
        }
        if (activeDrawerVoucher) {
          e.preventDefault();
          closeDrawer();
          return;
        }
        if (isSearchOpen) {
          e.preventDefault();
          setSearchOpen(false);
          return;
        }
        if (isAdvanceModalOpen) {
          e.preventDefault();
          setAdvanceModalOpen(false);
          return;
        }
        if (settleTargetAdvance) {
          e.preventDefault();
          setSettleTargetAdvance(null);
          return;
        }
      }

      // Alt + L: Instant Counter Screen Lock (PIN required to unlock)
      if (e.altKey && (key.toLowerCase() === 'l' || key === '12')) {
        e.preventDefault();
        e.stopPropagation();
        lockScreen();
        return;
      }

      // F12: My Profile & Security
      if (key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('profile');
        return;
      }

      // Alt + 1: Standard Expense Bill Mode
      if (e.altKey && key === '1') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('new-voucher');
        window.dispatchEvent(new CustomEvent('asopalav:set-voucher-mode', { detail: { mode: 'Shop_Vendor' } }));
        return;
      }

      // Alt + 2: Staff Food Split Mode
      if (e.altKey && key === '2') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('new-voucher');
        window.dispatchEvent(new CustomEvent('asopalav:set-voucher-mode', { detail: { mode: 'Staff_Split' } }));
        return;
      }

      // Alt + 3: Courier Parcel Delivery Mode
      if (e.altKey && key === '3') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('new-voucher');
        window.dispatchEvent(new CustomEvent('asopalav:set-voucher-mode', { detail: { mode: 'Courier' } }));
        return;
      }

      // Ctrl + B: Toggle Sidebar Collapse (Universal hotkey standard)
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapse();
        return;
      }

      // '?' or 'Ctrl+/' (when not inside input) -> Open Keyboard Shortcuts modal
      if ((key === '?' || ((e.ctrlKey || e.metaKey) && key === '/')) && !isInputFocused) {
        e.preventDefault();
        setShortcutsModalOpen(!isShortcutsModalOpen);
        return;
      }

      // Ctrl + K: Global Command Palette Search
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
        return;
      }

      // '/' when not inside input: Focus Global Search
      if (key === '/' && !isInputFocused) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      const isAnyModalOpen =
        isSearchOpen ||
        isShortcutsModalOpen ||
        isCalculatorOpen ||
        isAdvanceModalOpen ||
        Boolean(settleTargetAdvance) ||
        Boolean(activeLightboxUrl) ||
        Boolean(activeDrawerVoucher);

      // F6: POS Quick Math & Tender Calculator (Global access)
      if (key === 'F6') {
        e.preventDefault();
        e.stopPropagation();
        setCalculatorOpen(!isCalculatorOpen);
        return;
      }

      // If a modal/drawer is open, do not trigger background page switches
      if (isAnyModalOpen) return;

      const isCashier = user?.role_code === 'Cashier';

      // Primary Function Keys for POS Navigation:
      // F1: Dashboard
      if (key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('dashboard');
        return;
      }

      // F2: New Voucher / Add Expense
      if (key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('new-voucher');
        return;
      }

      // F3: All Expenses / Ledger
      if (key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('expenses');
        return;
      }

      // F4: Cash Box & Bank / Treasury Float
      if (key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        if (!can('can_inject_float')) {
          triggerHaptic('error');
          showToast({ type: 'error', title: 'Access Restricted (F4)', message: 'Treasury access requires appropriate permissions.' });
          return;
        }
        setActivePage('treasury');
        return;
      }

      // F7: Staff Advances & Imprest
      if (key === 'F7') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('advances');
        return;
      }

      // F8: Activity & Security History
      if (key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        if (!can('can_view_audit_logs')) {
          triggerHaptic('error');
          showToast({ type: 'error', title: 'Access Restricted (F8)', message: 'Audit log access requires appropriate permissions.' });
          return;
        }
        setActivePage('audit');
        return;
      }

      // F9: Daily Cash Closing & 6-Denomination Reckoner
      if (key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        setActivePage('closing');
        return;
      }

      // F10: Staff Directory & Team Logins
      if (key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
        if (!can('can_manage_users_roles')) {
          triggerHaptic('error');
          showToast({ type: 'error', title: 'Access Restricted (F10)', message: 'Staff management requires appropriate permissions.' });
          return;
        }
        setActivePage('staff');
        return;
      }

      // F11: Showroom & App Settings
      if (key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        if (!can('can_manage_periods')) {
          triggerHaptic('error');
          showToast({ type: 'error', title: 'Access Restricted (F11)', message: 'Settings access requires appropriate permissions.' });
          return;
        }
        setActivePage('settings');
        return;
      }
    }

    // Attach with capture: true to intercept before browser defaults
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [
    isLocked,
    activeDrawerVoucher,
    activeLightboxUrl,
    isSearchOpen,
    isShortcutsModalOpen,
    isCalculatorOpen,
    isAdvanceModalOpen,
    settleTargetAdvance,
    setActivePage,
    closeDrawer,
    closeLightbox,
    setSearchOpen,
    setShortcutsModalOpen,
    setCalculatorOpen,
    setAdvanceModalOpen,
    setSettleTargetAdvance,
    toggleSidebarCollapse,
    lockScreen,
    user,
    can,
  ]);
}
