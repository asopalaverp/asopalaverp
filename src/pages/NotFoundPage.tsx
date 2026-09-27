import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { FileQuestion, Plus, Search, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { setActivePage, setSearchOpen } = useUIStore();
  const searchParams = new URLSearchParams(window.location.search);
  const requestedPage = searchParams.get('page') || 'Unknown route';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0d0e] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16 select-none flex flex-col">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-md w-full p-8 rounded-[18px] ios-card space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-mono font-semibold">
            <span>HTTP 404</span>
            <span>•</span>
            <span>Page Not Found</span>
          </div>

          {/* Icon & Heading */}
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-[14px] bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-zinc-400 mx-auto shadow-xs">
              <FileQuestion className="w-7 h-7 stroke-[1.5]" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              Page Not Found
            </h1>
            <p className="text-xs text-slate-500 dark:text-[#8E8E93] leading-relaxed font-sans">
              The page <code className="px-1.5 py-0.5 rounded-[6px] bg-slate-100 dark:bg-white/10 font-mono text-slate-800 dark:text-zinc-200 text-[11px] font-semibold border border-slate-200/80 dark:border-white/10">?page={requestedPage}</code> does not exist or has moved.
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setActivePage('dashboard')}
              className="flex-1 h-9.5 px-4 rounded-[10px] bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-[#171717] font-semibold text-xs ios-press transition-colors inline-flex items-center justify-center gap-2 shadow-xs select-none cursor-pointer"
            >
              <Home className="w-4 h-4 stroke-[2.5]" />
              <span>Go to Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('new-voucher')}
              className="flex-1 h-9.5 px-4 rounded-[10px] bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white font-semibold text-xs ios-press transition-colors inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
              <span>Add Expense</span>
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="text-xs text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Everything (⌘K)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

