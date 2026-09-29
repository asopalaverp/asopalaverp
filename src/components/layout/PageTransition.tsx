import React, { useEffect, useRef } from 'react';
import { PageId } from '@/store/uiStore';

interface PageTransitionProps {
  pageKey: PageId;
  children: React.ReactNode;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ pageKey, children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Instant smooth scroll reset on page change
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pageKey]);

  return (
    <div ref={containerRef} key={pageKey} className="w-full min-h-full flex-1 flex flex-col animate-in fade-in duration-100">
      {children}
    </div>
  );
};

export default PageTransition;
