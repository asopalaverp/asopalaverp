import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { FileQuestion, Plus, Search, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { setActivePage, setSearchOpen } = useUIStore();
  const searchParams = new URLSearchParams(window.location.search);
  const requestedPage = searchParams.get('page') || 'Unknown route';

  return (
    <div className="min-h-full flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* Centered Content Card */}
      <div className="max-w-md w-full p-8 rounded-[12px] bg-white dark:bg-[#1c1c1c] border border-slate-200/80 dark:border-[#2e2e2e] space-y-6 shadow-xl text-center my-auto">
        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-mono font-semibold">
          <span>404</span>
          <span>•</span>
          <span>Page Not Found</span>
        </div>

        {/* Icon & Heading */}
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-[8px] bg-slate-100 dark:bg-[#252525] border border-slate-200 dark:border-[#2e2e2e] flex items-center justify-center text-slate-600 dark:text-zinc-400 mx-auto shadow-xs">
            <FileQuestion className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#8E8E93] leading-relaxed font-sans">
            The page <code className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-[#252525] font-mono text-slate-800 dark:text-zinc-200 text-[11px] font-semibold border border-slate-200 dark:border-[#2e2e2e]">?page={requestedPage}</code> does not exist or has moved.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setActivePage('dashboard')}
            className="flex-1 h-9 px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-[#171717] font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 shadow-xs select-none cursor-pointer"
          >
            <Home className="w-4 h-4 stroke-[2]" />
            <span>Go to Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('new-voucher')}
            className="flex-1 h-9 px-4 rounded-[6px] bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#2e2e2e] hover:bg-slate-50 dark:hover:bg-[#252525] text-slate-800 dark:text-white font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
            <span>Add Expense</span>
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="text-xs text-slate-500 dark:text-[#8E8E93] hover:text-[#3ecf8e] transition-colors inline-flex items-center gap-1.5 cursor-pointer font-sans"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Everything (Ctrl+K)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
