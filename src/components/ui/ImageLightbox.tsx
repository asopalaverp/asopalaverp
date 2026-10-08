import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import { useScrollLock } from '@/hooks/useScrollLock';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

export const ImageLightbox: React.FC = () => {
  const { activeLightboxUrl, closeLightbox } = useUIStore();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useScrollLock(Boolean(activeLightboxUrl));

  useEffect(() => {
    if (activeLightboxUrl) {
      setScale(1);
      setRotation(0);
    }
  }, [activeLightboxUrl]);

  useEffect(() => {
    if (!activeLightboxUrl) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxUrl, closeLightbox]);

  if (!activeLightboxUrl || !mounted) return null;

  return createPortal(
    <div
      onClick={closeLightbox}
      className="fixed inset-0 z-[999999] bg-black flex flex-col items-center justify-between p-4 select-none animate-in fade-in duration-200"
    >
      {/* Top Controls Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl flex items-center justify-between p-2 rounded-[6px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl"
      >
        <span className="text-xs font-mono font-medium text-slate-900 dark:text-white px-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#3ecf8e]" />
          <span>Image Document Lightbox</span>
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="p-1.5 rounded-[6px] text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="p-1.5 rounded-[6px] text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-[6px] text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <a
            href={activeLightboxUrl}
            download="asopalav-proof-document.png"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-[6px] text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#242424] transition-colors cursor-pointer"
            title="Download Document"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={closeLightbox}
            className="p-1.5 rounded-[6px] text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-1 cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Stage - Clicking outside the image closes the lightbox */}
      <div
        onClick={closeLightbox}
        className="flex-1 w-full flex items-center justify-center p-4 overflow-hidden cursor-zoom-out"
      >
        <img
          src={activeLightboxUrl}
          alt="Document Lightbox Preview"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease-out',
          }}
          className="max-w-full max-h-[78vh] object-contain rounded-[6px] border border-slate-200 dark:border-[#282828] shadow-2xl bg-white dark:bg-[#141414] cursor-default"
        />
      </div>

      {/* Bottom Hint */}
      <div className="text-[11px] font-mono text-zinc-300 dark:text-zinc-400 px-3 py-1 rounded-full bg-[#181818] border border-[#282828] shadow-lg">
        Tap anywhere outside or press ESC to close
      </div>
    </div>,
    document.body
  );
};
