import React, { useRef, useEffect } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useUIStore, PageId } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { animateModalOpen, animateModalClose } from '@/lib/animations';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/Kbd';
import {
  Keyboard,
  X,
  Compass,
  FileText,
  Sliders,
} from 'lucide-react';
import { AsopalavLogo } from '@/components/icons/AsopalavLogo';

export const KeyboardShortcutsModal: React.FC = () => {
  const {
    isShortcutsModalOpen,
    setShortcutsModalOpen,
    setActivePage,
    setSearchOpen,
    toggleSidebarCollapse,
  } = useUIStore();
  const { lockScreen } = useAuthStore();

  useScrollLock(isShortcutsModalOpen);

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isShortcutsModalOpen) {
      animateModalOpen(modalRef.current, backdropRef.current);
    }
  }, [isShortcutsModalOpen]);

  const handleClose = () => {
    animateModalClose(modalRef.current, backdropRef.current, () => {
      setShortcutsModalOpen(false);
    });
  };

  if (!isShortcutsModalOpen) return null;

  const handleAction = (type: 'page' | 'action', val: string) => {
    handleClose();
    if (type === 'page') {
      setActivePage(val as PageId);
    } else if (val === 'search') {
      setSearchOpen(true);
    } else if (val === 'lock') {
      lockScreen();
    } else if (val === 'sidebar') {
      toggleSidebarCollapse();
    }
  };

  const SHORTCUT_GROUPS = [
    {
      title: 'PRIMARY POS FUNCTION KEYS (F1 - F12)',
      items: [
        { label: 'F1 • Showroom Dashboard', keys: ['F1'], action: () => handleAction('page', 'dashboard') },
        { label: 'F2 • Add Expense / Create Voucher', keys: ['F2'], action: () => handleAction('page', 'new-voucher') },
        { label: 'F3 • All Expenses & Ledger', keys: ['F3'], action: () => handleAction('page', 'expenses') },
        { label: 'F4 • Cash Box & Bank (Treasury)', keys: ['F4'], action: () => handleAction('page', 'treasury') },
        { label: 'F5 • POS Math Calculator', keys: ['F5'], action: () => { handleClose(); useUIStore.getState().setCalculatorOpen(true); } },
        { label: 'F6 • Staff Directory & Roster', keys: ['F6'], action: () => handleAction('page', 'staff') },
        { label: 'F7 • Staff Advances & Disbursals', keys: ['F7'], action: () => handleAction('page', 'advances') },
        { label: 'F8 • Activity History & Audit', keys: ['F8'], action: () => handleAction('page', 'audit') },
        { label: 'F9 • Daily Cash Closing & Tally', keys: ['F9'], action: () => handleAction('page', 'closing') },
        { label: 'F10 • Alerts & Broadcast Messages', keys: ['F10'], action: () => handleAction('page', 'notifications') },
        { label: 'F11 • Shop Settings & Catalogues', keys: ['F11'], action: () => handleAction('page', 'settings') },
        { label: 'F12 • My Profile & PIN Security', keys: ['F12'], action: () => handleAction('page', 'profile') },
      ],
    },
    {
      title: 'EXPENSE ENTRY MODES & QUICK ACTIONS',
      items: [
        { label: 'Standard Vendor Bill Mode', keys: ['Alt', '1'], action: () => handleAction('page', 'new-voucher') },
        { label: 'Staff Meal Split Mode', keys: ['Alt', '2'], action: () => handleAction('page', 'new-voucher') },
        { label: 'Courier Parcel Delivery Mode', keys: ['Alt', '3'], action: () => handleAction('page', 'new-voucher') },
        { label: 'Jump to Staff Directory', keys: ['Alt', 'S'], action: () => handleAction('page', 'staff') },
        { label: 'Jump to Shop Settings', keys: ['Alt', 'M'], action: () => handleAction('page', 'settings') },
      ],
    },
    {
      title: 'SYSTEM & TERMINAL TOOLS',
      items: [
        { label: 'Instant Terminal Screen Lock', keys: ['Alt', 'L'], action: () => handleAction('action', 'lock') },
        { label: 'Global Command Palette Search', keys: ['Ctrl', 'K'], action: () => handleAction('action', 'search') },
        { label: 'Toggle Sidebar Collapse', keys: ['Ctrl', 'B'], action: () => handleAction('action', 'sidebar') },
        { label: 'Open Shortcuts Cheatsheet', keys: ['?'], action: () => {} },
        { label: 'Close Active Popup / Window', keys: ['Esc'], action: handleClose },
      ],
    },
  ];

  return (
    <div
      ref={backdropRef}
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#2e2e2e] rounded-[12px] shadow-2xl overflow-hidden text-slate-900 dark:text-[#EDEDED] font-sans transition-all"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2e2e2e] flex items-center justify-between bg-slate-50/50 dark:bg-[#141414]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 text-[#3ecf8e] flex items-center justify-center">
              <Keyboard className="w-4 h-4 stroke-[2]" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white font-sans">
              Keyboard Shortcuts &amp; Hotkeys
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#242424] hover:bg-slate-200 dark:hover:bg-[#2c2c2c] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Shortcuts Content */}
        <div className="p-4 max-h-[65vh] overflow-y-auto space-y-4 text-xs font-sans">
          {SHORTCUT_GROUPS.map((group, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="px-2 text-[10px] font-mono font-semibold tracking-wider text-slate-400 dark:text-[#8e8e93] uppercase">
                {group.title}
              </div>

              <div className="rounded-[12px] border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] divide-y divide-black/[0.04] dark:divide-white/[0.05] overflow-hidden">
                {group.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    onClick={() => item.action()}
                    className="flex items-center justify-between px-3.5 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer text-xs ios-press"
                  >
                    <span className="text-slate-700 dark:text-zinc-200 font-medium font-sans">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, kIdx) => (
                        <Kbd key={kIdx} size="xs" className="rounded-[5px]">
                          {k}
                        </Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex items-center justify-between font-sans text-[11px] text-slate-500 dark:text-zinc-400">
          <span>Press ESC anytime to close</span>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 dark:text-zinc-500">
            <AsopalavLogo size={12} className="shrink-0" />
            <span>Asopalav Enterprise POS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
