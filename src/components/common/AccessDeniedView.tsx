import React from 'react';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { triggerHaptic } from '@/lib/utils';

interface AccessDeniedViewProps {
  title?: string;
  message?: string;
  pageName?: string;
  onGoBack?: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  title = 'Access Restricted',
  message,
  pageName,
  onGoBack,
}) => {
  const { setActivePage } = useUIStore();

  const handleReturn = () => {
    triggerHaptic('selection');
    if (onGoBack) {
      onGoBack();
    } else {
      setActivePage('dashboard');
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 select-none font-sans">
      <div className="max-w-md w-full rounded-[14px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] shadow-2xl p-6 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Lock / Security Icon Badge */}
        <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto shadow-xs">
          <ShieldAlert className="w-7 h-7 stroke-[2]" />
        </div>

        {/* Text Details */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[11px] font-mono font-medium">
            <Lock className="w-3 h-3" />
            <span>403 Unauthorized Access</span>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 dark:text-white font-sans tracking-tight pt-1">
            {title}
          </h2>

          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed font-sans max-w-sm mx-auto">
            {message ||
              `Your current account role does not have permission to view ${
                pageName ? `the ${pageName} console` : 'this page'
              }. No unauthorized data has been loaded.`}
          </p>
        </div>

        {/* Security Notice */}
        <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] text-[11px] text-slate-500 dark:text-zinc-500 font-mono text-left">
          <p className="font-semibold text-slate-700 dark:text-zinc-400">🛡️ Terminal Security Safeguard:</p>
          <p className="mt-0.5">
            If you need access to this page or showroom data, please request permission from your Store Manager or Super Admin.
          </p>
        </div>

        {/* Return to Dashboard CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleReturn}
            className="w-full min-h-[40px] px-4 py-2 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium font-sans text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-xs"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDeniedView;
