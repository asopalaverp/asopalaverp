import React, { useState, useEffect } from 'react';
import { Target, AlertTriangle, Edit3, Check } from 'lucide-react';
import { formatINR, cn, triggerHaptic } from '@/lib/utils';

interface DepartmentSpendItem {
  name: string;
  count: number;
  amount: number;
  percentage: number;
  color?: string;
}

interface DepartmentBudgetCapsWidgetProps {
  departmentStats: DepartmentSpendItem[];
}

const DEFAULT_CAPS: Record<string, number> = {
  'Sales': 60000,
  'Admin': 35000,
  'Logistics': 45000,
  'Staff Welfare': 50000,
  'Housekeeping': 25000,
  'Tailoring & Alterations': 35000,
  'Accounts': 20000,
  'General Operations': 40000,
  'Security': 25000,
  'IT & Maintenance': 30000,
};

export const DepartmentBudgetCapsWidget: React.FC<DepartmentBudgetCapsWidgetProps> = ({
  departmentStats,
}) => {
  const [caps, setCaps] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('asopalav_dept_caps');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_CAPS;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [tempCaps, setTempCaps] = useState<Record<string, number>>({});

  useEffect(() => {
    setTempCaps(caps);
  }, [caps]);

  const handleSaveCaps = () => {
    triggerHaptic('success');
    setCaps(tempCaps);
    localStorage.setItem('asopalav_dept_caps', JSON.stringify(tempCaps));
    setIsEditing(false);
  };

  const currentDay = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthProgressPct = Math.round((currentDay / daysInMonth) * 100);

  // Take top 6 departments to track
  const trackedDepts = departmentStats.slice(0, 6);

  return (
    <div className="p-4 sm:p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#242424] rounded-[12px] space-y-4 shadow-sm h-full flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#242424]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[6px] bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] text-slate-600 dark:text-[#A1A1A1] flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div>
            <h3 className="text-sm font-medium tracking-tight text-slate-900 dark:text-white font-sans flex items-center gap-2">
              <span>Department Budget Caps &amp; Pace Radar</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e]">
                Day {currentDay} of {daysInMonth} ({monthProgressPct}% Elapsed)
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-[#A1A1A1]">
              Compares month-to-date departmental spending against showroom allocation thresholds.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setIsEditing(!isEditing);
          }}
          className="px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] text-xs font-sans text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5 text-[#3ecf8e]" />
          <span>{isEditing ? 'Cancel' : 'Set Caps'}</span>
        </button>
      </div>

      {/* Editing Drawer Form */}
      {isEditing && (
        <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#191919] border border-slate-200 dark:border-[#282828] space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-900 dark:text-white">Configure Monthly Allocation Caps (₹)</span>
            <button
              type="button"
              onClick={handleSaveCaps}
              className="px-3 py-1 rounded-[6px] bg-[#3ecf8e] text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Save Caps</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {trackedDepts.map((dept) => (
              <div key={dept.name} className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400 truncate">
                  {dept.name}
                </label>
                <div className="flex items-center rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] px-2 h-8">
                  <span className="text-slate-400 text-xs mr-1 font-mono">₹</span>
                  <input
                    type="number"
                    value={tempCaps[dept.name] ?? 40000}
                    onChange={(e) =>
                      setTempCaps((prev) => ({
                        ...prev,
                        [dept.name]: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full bg-transparent text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {trackedDepts.length === 0 ? (
          <div className="col-span-2 py-6 text-center text-xs text-slate-400">
            No departmental expenditures recorded in this period.
          </div>
        ) : (
          trackedDepts.map((dept) => {
            const cap = caps[dept.name] || 40000;
            const burnPct = cap > 0 ? Math.round((dept.amount / cap) * 100) : 0;
            const isOverBurn = burnPct > monthProgressPct + 15; // Burning faster than days elapsed
            const isCritical = burnPct >= 90;

            return (
              <div
                key={dept.name}
                className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#242424] space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {dept.name}
                    </span>
                    {isCritical && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9.5px] font-mono font-bold">
                        &gt;90% Cap
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatINR(dept.amount)}
                    </span>
                    <span className="text-slate-400 dark:text-zinc-500 text-[11px]">
                      / {formatINR(cap)}
                    </span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold',
                        burnPct >= 100
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          : burnPct >= 80
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e]'
                      )}
                    >
                      {burnPct}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-slate-200 dark:bg-[#282828] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      burnPct >= 95
                        ? 'bg-rose-500'
                        : burnPct >= 80
                        ? 'bg-amber-500'
                        : 'bg-[#3ecf8e]'
                    )}
                    style={{ width: `${Math.min(burnPct, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-zinc-400 font-sans">
                  <span>
                    Remaining Float: <strong className="font-mono text-slate-700 dark:text-zinc-300">{formatINR(Math.max(0, cap - dept.amount))}</strong>
                  </span>
                  <span>
                    {isOverBurn ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Pacing fast</span>
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-[#3ecf8e] font-medium">On pace</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
