import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { PageId } from '@/store/uiStore';
import gsap from 'gsap';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface PageTransitionProps {
  pageKey: PageId;
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Showroom Dashboard',
  'new-voucher': 'Record Expense Voucher',
  expenses: 'Past Bills & Expense History',
  treasury: 'Cash Drawer Treasury',
  advances: 'Staff Advances & Loans',
  closing: 'Daily Cash Closing',
  audit: 'Security Audit Logbook',
  staff: 'Staff Directory',
  settings: 'Master Data & Settings',
  profile: 'Profile & Security',
};

export const PageTransition: React.FC<PageTransitionProps> = ({ pageKey, children }) => {
  const [displayedKey, setDisplayedKey] = useState<PageId>(pageKey);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [, setIsAnimating] = useState(false);
  const [targetTitle, setTargetTitle] = useState<string>(PAGE_TITLES[pageKey] || 'Showroom Dashboard');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const shutterRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const activeTimeline = useRef<gsap.core.Timeline | null>(null);
  const isInitialMount = useRef(true);

  // Initial mount: quick subtle entrance
  useIsomorphicLayoutEffect(() => {
    if (!containerRef.current) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      gsap.set(containerRef.current, { opacity: 1, y: 0 });
      return;
    }

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.22,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      }
    );

    isInitialMount.current = false;
  }, []);

  // On page change: Fullscreen shutter rises bottom-to-top, shows ONLY page name in center, theme-adaptive, opens top
  useIsomorphicLayoutEffect(() => {
    if (isInitialMount.current || pageKey === displayedKey) {
      setDisplayedChildren(children);
      return;
    }

    const nextTitle = PAGE_TITLES[pageKey] || 'Showroom Dashboard';
    setTargetTitle(nextTitle);

    const shutter = shutterRef.current;
    const title = titleRef.current;
    const container = containerRef.current;

    if (!shutter || !title || !container) {
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }

    // Kill any running transition
    if (activeTimeline.current) {
      activeTimeline.current.kill();
    }

    setIsAnimating(true);
    // Lock body and html scroll during full-screen transition so zero scrollbar is visible
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const tl = gsap.timeline({
      onComplete: () => {
        setIsAnimating(false);
        // Unlock scroll after shop open transition completes
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        gsap.set(shutter, { display: 'none', y: '100%' });
        gsap.set(container, { clearProps: 'transform,opacity' });
      },
    });
    activeTimeline.current = tl;

    // Reset initial shutter states
    gsap.set(shutter, { display: 'flex', y: '100%' });
    gsap.set(title, { opacity: 0, y: 30, scale: 0.96 });

    // =========================================================================
    // STEP 1: SHUTTER CLOSES UP FROM BOTTOM TO TOP (Curtain sweeps up)
    // =========================================================================
    tl.to(shutter, {
      y: '0%',
      duration: 0.28,
      ease: 'power4.inOut',
    });

    // STEP 2: ONLY THE PAGE NAME POPS IN WITH BOLD, HIGH-CONTRAST IMPACT
    tl.to(
      title,
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.2,
        ease: 'back.out(1.4)',
      },
      '-=0.08'
    );

    // STEP 3: SILENT PAGE SWAP UNDERNEATH WHILE SHUTTER COVERS SCREEN
    tl.add(() => {
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    });

    // Brief dwell time for user to read the page name cleanly
    tl.to({}, { duration: 0.14 });

    // =========================================================================
    // STEP 4: SHOP OPENS - TITLE FADES & SHUTTER ROLLS / LIFTS TO TOP
    // =========================================================================
    tl.to(
      title,
      {
        opacity: 0,
        y: -24,
        scale: 0.96,
        duration: 0.16,
        ease: 'power2.in',
      },
      '+=0.02'
    );

    tl.to(
      shutter,
      {
        y: '-100%',
        duration: 0.32,
        ease: 'power4.inOut',
      },
      '-=0.08'
    );

    // STEP 5: NEW PAGE CONTENT REVEALS SMOOTHLY
    tl.fromTo(
      container,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.24,
        ease: 'power3.out',
      },
      '-=0.2'
    );

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [pageKey, children, displayedKey]);

  return (
    <div className="relative w-full">
      {/* ========================================================================= */}
      {/* FULL-SCREEN SHOP OPENING SHUTTER (Bottom-to-Top Transition)               */}
      {/* Follows user theme pattern (light / dark) with zero scroll visible         */}
      {/* ========================================================================= */}
      <div
        ref={shutterRef}
        className="fixed inset-0 z-[99999] w-screen h-screen bg-white dark:bg-[#141414] text-slate-900 dark:text-white flex flex-col items-center justify-center pointer-events-auto select-none overflow-hidden hidden m-0 p-0 border-0"
        style={{ willChange: 'transform' }}
      >
        {/* Center: ONLY THE NEXT PAGE NAME */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
          <h1
            ref={titleRef}
            className="text-4xl sm:text-5xl md:text-6xl font-medium font-sans tracking-display-xl text-slate-900 dark:text-white select-none"
          >
            {targetTitle}
          </h1>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ACTIVE PAGE CONTENT CONTAINER                                            */}
      {/* ========================================================================= */}
      <div ref={containerRef} key={displayedKey} className="w-full">
        {displayedChildren}
      </div>
    </div>
  );
};
