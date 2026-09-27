import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import { animateDrawerOpen, animateDrawerClose } from '@/lib/animations';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';

export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

export interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  copyId?: string;
  size?: DrawerSize;
  allowExpand?: boolean;
  contentClassName?: string;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const sizeClasses: Record<DrawerSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl sm:max-w-3xl', // Standard comfortable slide-over drawer
  xl: 'max-w-3xl sm:max-w-4xl',
  '2xl': 'max-w-5xl',
  full: 'w-full max-w-full',
};

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  copyId,
  size = 'lg',
  allowExpand = true,
  contentClassName,
  headerExtra,
  footer,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isSidebarCollapsed } = useUIStore();
  const { isMobile, isTablet } = useDeviceType();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = () => {
    animateDrawerClose(panelRef.current, backdropRef.current, onClose, isMobile);
  };

  useScrollLock(isOpen);

  // Keyboard ergonomics: ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (isOpen) {
      setIsExpanded(false);
      animateDrawerOpen(panelRef.current, backdropRef.current, isMobile);
    }
  }, [isOpen, isMobile]);

  const handleCopyId = () => {
    if (!copyId) return;
    navigator.clipboard.writeText(copyId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen || !mounted) return null;

  // Sidebar width offset on desktop
  const sidebarOffset = isMobile ? 0 : (isSidebarCollapsed ? 64 : 240);

  // Determine current width class: full screen if user toggled expand, otherwise standard drawer size
  const currentSizeClass = isExpanded ? 'w-full max-w-full' : (sizeClasses[size] || sizeClasses.full);

  const drawerContent = (
    <div
      className="fixed inset-y-0 right-0 z-[99999] overflow-hidden select-none font-sans flex justify-end transition-[left] duration-200 ease-out"
      style={{ left: `${sidebarOffset}px` }}
    >
      {/* Backdrop covering main canvas touching sidebar */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/60 dark:bg-black/75 transition-opacity backdrop-blur-md z-0"
        onClick={handleClose}
      />

      {/* Slide-over Panel Container */}
      <div className={cn(
        "absolute inset-0 pointer-events-none z-10 flex",
        isMobile ? "items-end justify-center" : "justify-end"
      )}>
        <div
          ref={panelRef}
          className={cn(
            'pointer-events-auto bg-white dark:bg-[#141414] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100 transition-[width,max-width] duration-200 ease-out',
            isMobile
              ? 'w-full max-h-[92vh] rounded-t-[26px] border-t border-black/[0.08] dark:border-white/[0.12] pb-safe'
              : cn('w-full h-full border-l border-slate-200 dark:border-[#222222]', currentSizeClass)
          )}
        >
          {/* iOS 18 Sheet Grabber Handle */}
          <div className="sm:hidden w-10 h-1.5 rounded-full bg-black/25 dark:bg-white/25 mx-auto mt-2.5 mb-1 shrink-0" />

          {/* 1. iOS 16 Frosted Header */}
          <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-white/90 dark:bg-[#141414]/90 backdrop-blur-xl shrink-0 z-10">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-white tracking-tight font-sans truncate">
                    {title}
                  </h2>

                  {copyId && (
                    <button
                      type="button"
                      onClick={handleCopyId}
                      title="Copy ID to clipboard"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#222222] hover:bg-slate-200 dark:hover:bg-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#2e2e2e] text-[10px] font-mono transition-colors cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600 dark:text-[#3ecf8e] stroke-[2.5]" />
                          <span className="text-emerald-600 dark:text-[#3ecf8e] font-medium font-sans">COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span className="font-sans font-medium">COPY</span>
                        </>
                      )}
                    </button>
                  )}

                  {badge}
                </div>

                {subtitle && (
                  <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 font-sans truncate">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {headerExtra}

              {allowExpand && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  aria-label={isExpanded ? 'Collapse to side drawer' : 'Expand to full screen'}
                  title={isExpanded ? 'Collapse to side drawer' : 'Expand to full screen'}
                  className="p-1.5 rounded-[6px] text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer hidden sm:inline-flex"
                >
                  {isExpanded ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                aria-label="Close drawer"
                title="Close drawer"
                className="p-1.5 rounded-[6px] text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Scrollable Body */}
          <div
            className={cn(
              'flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 pb-8 space-y-5 font-sans text-xs bg-white dark:bg-[#141414]',
              contentClassName
            )}
          >
            {children}
          </div>

          {/* 3. Sticky Enterprise Footer */}
          {footer && (
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-t border-slate-200 dark:border-[#1f1f1f] bg-slate-50/95 dark:bg-[#141414]/95 backdrop-blur-md shrink-0 mt-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 z-10 pb-safe">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
};
