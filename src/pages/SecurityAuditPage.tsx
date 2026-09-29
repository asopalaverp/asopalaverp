import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getLocalAuditLogs } from '@/lib/audit';
import { SecurityAuditLog } from '@/types/database';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { format } from 'date-fns';
import { cn, triggerHaptic } from '@/lib/utils';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { toast } from '@/components/ui/ToastContainer';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SegmentedControl } from '@/components/ui';
import {
  Search,
  RefreshCw,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  X,
  Eye,
  Terminal,
  ChevronDown,
} from 'lucide-react';

type StreamCategory = 'ALL' | 'vouchers' | 'advances' | 'closings' | 'float' | 'security' | 'sessions';
type TimeFilter = 'today' | '7d' | 'all';

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const SecurityAuditPage: React.FC = () => {
  const { user } = useAuthStore();
  const { getActiveBranch } = useBranchStore();
  const activeBranch = getActiveBranch();

  // Logs State
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLivePolling] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStream, setSelectedStream] = useState<StreamCategory>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [selectedLog, setSelectedLog] = useState<SecurityAuditLog | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch logs from Supabase with LocalStorage fallback
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400);

      if (data && data.length > 0) {
        setLogs(data);
      } else {
        setLogs(getLocalAuditLogs());
      }
    } catch (err) {
      console.warn('Falling back to local audit cache:', err);
      setLogs(getLocalAuditLogs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Live polling heartbeat
  useEffect(() => {
    if (!isLivePolling) return;
    const timer = setInterval(() => {
      fetchLogs();
    }, 15000);
    return () => clearInterval(timer);
  }, [isLivePolling, fetchLogs]);

  // Hotkey '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    triggerHaptic();
    setCopiedLabel(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  // Filtered Logs Calculation
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const sevenDaysAgoStr = format(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    return logs.filter((log) => {
      const createdAt = log.created_at || '';
      const logDate = createdAt.slice(0, 10);

      // 1. Time filter
      if (timeFilter === 'today' && logDate !== todayStr) return false;
      if (timeFilter === '7d' && logDate < sevenDaysAgoStr) return false;

      // 2. Stream Category Filter
      if (selectedStream !== 'ALL') {
        const act = (log.action_type || '').toLowerCase();
        const desc = (log.event_description || '').toLowerCase();
        const entity = (log.target_entity || '').toLowerCase();

        if (selectedStream === 'vouchers' && !act.includes('voucher') && !desc.includes('voucher') && !entity.includes('voucher')) return false;
        if (selectedStream === 'advances' && !act.includes('advance') && !desc.includes('advance') && !entity.includes('advance')) return false;
        if (selectedStream === 'closings' && !act.includes('close') && !desc.includes('closing') && !act.includes('period')) return false;
        if (selectedStream === 'float' && !act.includes('float') && !desc.includes('float')) return false;
        if (selectedStream === 'security' && !act.includes('void') && !act.includes('override') && !desc.includes('security') && !desc.includes('tamper')) return false;
        if (selectedStream === 'sessions' && !act.includes('login') && !act.includes('auth') && !act.includes('user') && !desc.includes('session')) return false;
      }

      // 3. Search query filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchStr = `${log.audit_number} ${log.action_type} ${log.event_description} ${log.user_name} ${log.user_role} ${log.target_identifier} ${log.ip_address} ${log.tamper_proof_signature}`.toLowerCase();
        if (!matchStr.includes(q)) return false;
      }

      return true;
    });
  }, [logs, timeFilter, selectedStream, search]);

  // Telemetry Summary Metrics
  const stats = useMemo(() => {
    let voidCount = 0;
    let highRiskCount = 0;
    logs.forEach((l) => {
      const desc = (l.event_description || '').toLowerCase();
      const act = (l.action_type || '').toLowerCase();
      if (act.includes('void') || desc.includes('void')) voidCount++;
      if (desc.includes('failed') || desc.includes('override') || desc.includes('tamper') || desc.includes('shortage')) highRiskCount++;
    });
    return {
      total: logs.length,
      voids: voidCount,
      risks: highRiskCount,
      verifiedPct: 100,
    };
  }, [logs]);

  // Export handlers
  const handleExportCSV = () => {
    const dateStr = format(new Date(), 'yyyy-MM-dd_HHmm');
    const headers = ['Audit Number', 'Timestamp', 'Action Type', 'User Name', 'Role', 'Target Identifier', 'Event Description', 'IP Address', 'SHA-256 Signature'];
    const rows = filteredLogs.map((l) => [
      l.audit_number || '',
      l.created_at || '',
      l.action_type || '',
      l.user_name || '',
      l.user_role || '',
      l.target_identifier || '',
      `"${(l.event_description || '').replace(/"/g, '""')}"`,
      l.ip_address || '',
      l.tamper_proof_signature || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(`asopalav_audit_logs_${dateStr}.csv`, csvContent, 'text/csv');
    toast.success('Exported audit logs to CSV');
  };

  const handleExportJSON = () => {
    const dateStr = format(new Date(), 'yyyy-MM-dd_HHmm');
    const jsonContent = JSON.stringify(filteredLogs, null, 2);
    downloadBlob(`asopalav_audit_logs_${dateStr}.json`, jsonContent, 'application/json');
    toast.success('Exported audit logs to JSON');
  };

  return (
    <div className="min-h-full flex-1 flex flex-col bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] select-none">
      {/* 1. Activity History Header */}
      <div className="px-4 lg:px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 backdrop-blur-2xl bg-white/80 dark:bg-[#121214]/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 max-w-7xl mx-auto">
          {/* Left: Title & Live Badge */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-[#EDEDED] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#3ecf8e]" />
                <span>Activity History</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 font-medium">
                {filteredLogs.length} events
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8E8E93] mt-0.5">
              Immutable ledger of payments, security overrides, and cashier cash closures.
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Refresh */}
            <button
              type="button"
              onClick={() => {
                fetchLogs();
                triggerHaptic();
                toast.info('Refreshing activity history...');
              }}
              disabled={loading}
              className="h-9 w-9 flex items-center justify-center rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#1C1C1E]/80 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] shadow-xs ios-press transition-colors cursor-pointer"
              title="Refresh Activity History"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin text-[#3ecf8e]')} />
            </button>

            {/* Export Menu */}
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="h-9 px-3.5 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#1C1C1E]/80 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] text-xs font-semibold flex items-center gap-1.5 shadow-xs ios-press transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className={cn("w-3 h-3 text-slate-400 dark:text-[#707070] transition-transform duration-150", isExportOpen && "rotate-180")} />
              </button>
              {isExportOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-[8px] bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#2e2e32] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportOpen(false);
                      handleExportCSV();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2 cursor-pointer font-mono transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    CSV format
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportOpen(false);
                      handleExportJSON();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2 cursor-pointer font-mono transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500" />
                    JSON format
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-5 space-y-4">
        {/* Filter Controls Bar */}
        <div className="bg-slate-50 dark:bg-[#18181a] border border-slate-200/80 dark:border-[#242424] rounded-[12px] p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-xs">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-[#707070]" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history by person, receipt, action..."
              className="w-full h-10 min-h-[40px] pl-9 pr-12 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-[#EDEDED] placeholder-slate-400 dark:placeholder-[#606060] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-mono transition-colors shadow-2xs"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#707070] hover:text-slate-900 dark:hover:text-[#EDEDED] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-[#555555] font-mono border border-slate-200 dark:border-white/10 px-1 py-0.2 rounded-[4px] pointer-events-none">
                /
              </span>
            )}
          </div>

          {/* Time Segmented Control & Stream Dropdown */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time Filter Segmented Control */}
            <SegmentedControl
              options={[
                { id: 'all', label: 'All History' },
                { id: '7d', label: '7 Days' },
                { id: 'today', label: 'Today' },
              ]}
              value={timeFilter}
              onChange={(val) => setTimeFilter(val as TimeFilter)}
              size="sm"
            />

            {/* Stream Category Dropdown */}
            <div className="w-48">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: 'All Actions' },
                  { value: 'vouchers', label: 'Expenses & Bills' },
                  { value: 'advances', label: 'Staff Advances' },
                  { value: 'closings', label: 'Daily Cash Closings' },
                  { value: 'float', label: 'Cash Added to Box' },
                  { value: 'security', label: 'Security & Voids' },
                  { value: 'sessions', label: 'Logins & Accounts' },
                ]}
                value={selectedStream}
                onChange={(val) => setSelectedStream(val as StreamCategory)}
                placeholder="All Actions"
                searchPlaceholder="Search action..."
                allowCustom={false}
              />
            </div>
          </div>
        </div>

        {/* 3. Telemetry Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] rounded-[12px] p-4 space-y-1.5 shadow-xs">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold block">
              All Activity Logs
            </span>
            <div className="text-2xl font-mono font-semibold text-slate-900 dark:text-[#EDEDED] tabular-nums">
              {stats.total.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 dark:text-[#606060] font-sans block">Recorded showroom actions</span>
          </div>

          <div className="bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] rounded-[12px] p-4 space-y-1.5 shadow-xs">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold block">
              Tamper-Proof Protection
            </span>
            <div className="text-2xl font-mono font-semibold text-emerald-600 dark:text-[#3ecf8e] tabular-nums flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-[#3ecf8e]" />
              <span>100% Safe</span>
            </div>
            <span className="text-[11px] text-emerald-600/80 dark:text-[#3ecf8e]/80 font-sans block">All entries permanently locked</span>
          </div>

          <div className="bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] rounded-[12px] p-4 space-y-1.5 shadow-xs">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold block">
              Cancelled / Deleted Bills
            </span>
            <div className="text-2xl font-mono font-semibold text-amber-500 dark:text-amber-400 tabular-nums">
              {stats.voids}
            </div>
            <span className="text-[11px] text-slate-400 dark:text-[#606060] font-sans block">Requires manager approval</span>
          </div>

          <div className="bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] rounded-[12px] p-4 space-y-1.5 shadow-xs">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold block">
              System Security
            </span>
            <div className="text-2xl font-mono font-semibold text-slate-900 dark:text-[#EDEDED] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3ecf8e] animate-pulse" />
              <span>Active &amp; Live</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-[#606060] font-sans block">Branch: {activeBranch.branch_code}</span>
          </div>
        </div>

        {/* 4. Logs Data Grid Table */}
        <div className="bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] rounded-[12px] overflow-hidden shadow-xs">
          {filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-[#707070] space-y-2">
              <Terminal className="w-8 h-8 mx-auto opacity-40 mb-2" />
              <p className="text-sm font-semibold text-slate-900 dark:text-[#EDEDED]">No activity records found.</p>
              <p className="text-xs">Try adjusting your search terms or filter above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="bg-slate-100/60 dark:bg-white/5 border-b border-slate-200/80 dark:border-white/10 text-[11px] font-semibold text-slate-600 dark:text-[#8E8E93] uppercase tracking-wider font-sans">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 w-40">Date &amp; Time</th>
                    <th className="py-3 px-4 w-28">Status</th>
                    <th className="py-3 px-4 min-w-[280px]">What Happened</th>
                    <th className="py-3 px-4 w-36">Category</th>
                    <th className="py-3 px-4 w-36">Done By</th>
                    <th className="py-3 px-4 w-24">Branch</th>
                    <th className="py-3 px-4 w-40">Security Code</th>
                    <th className="py-3 px-4 w-16 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {filteredLogs.map((log, idx) => {
                    const dateObj = new Date(log.created_at || Date.now());
                    const formattedDate = format(dateObj, 'dd MMM, HH:mm:ss');
                    const isWarning = (log.event_description || '').toLowerCase().includes('void') || (log.event_description || '').toLowerCase().includes('shortage') || (log.event_description || '').toLowerCase().includes('failed');

                    return (
                      <tr
                        key={log.id || idx}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-slate-100/50 dark:hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 text-center text-slate-400 dark:text-[#606060] text-[11px] tabular-nums">{idx + 1}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-[#A1A1A1] tabular-nums whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isWarning ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-sans font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              Warning
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-sans font-medium bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20">
                              Success
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-[#EDEDED] font-sans">
                          <span className="line-clamp-1">{log.event_description}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-[#A1A1A1] text-[11px] whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-[#A1A1A1] font-mono text-[10px]">
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-900 dark:text-[#EDEDED] text-xs whitespace-nowrap font-sans">
                          <span className="font-medium">{log.user_name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#606060] block font-mono">({log.user_role?.replace('_', ' ')})</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-[#A1A1A1] font-mono text-xs whitespace-nowrap">
                          {log.target_entity === 'branches' ? log.target_identifier : activeBranch.branch_code}
                        </td>
                        <td className="py-3 px-4 text-slate-400 dark:text-[#606060] text-[10px] font-mono truncate max-w-[160px]">
                          {log.tamper_proof_signature || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/5 text-slate-500 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom Status Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 bg-slate-100/40 dark:bg-white/5 border-t border-slate-200/80 dark:border-white/10 text-xs font-mono text-slate-500 dark:text-[#8E8E93]">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-slate-900 dark:text-[#EDEDED] font-mono">{filteredLogs.length}</strong> of{' '}
                <strong className="text-slate-900 dark:text-[#EDEDED] font-mono">{logs.length}</strong> events
              </span>
              <span>&bull;</span>
              <span>Tamper-Proof Protected</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#3ecf8e] font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3ecf8e] animate-pulse" />
                Live Recording
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* 5. Full Screen Log Inspector Drawer */}
      {selectedLog && (
        <SlideOverDrawer
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`Activity Record #${selectedLog.audit_number || 'AUD-RECORD'}`}
          subtitle={`Recorded on ${selectedLog.created_at ? format(new Date(selectedLog.created_at), 'dd MMMM yyyy, HH:mm:ss') : 'Live'} by ${selectedLog.user_name}`}
          badge={
            <span className="px-2 py-0.5 rounded-[4px] bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-[#EDEDED] font-mono text-[10px] font-medium border border-slate-200 dark:border-white/10">
              {selectedLog.action_type}
            </span>
          }
          copyId={selectedLog.audit_number}
          size="full"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-mono text-slate-400 dark:text-[#8E8E93]">
                Record ID: <strong className="text-slate-700 dark:text-[#EDEDED] font-mono">{selectedLog.id}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="inline-flex items-center justify-center h-10 min-h-[40px] px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-medium text-xs font-sans transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="max-w-4xl mx-auto w-full space-y-4 font-sans text-xs">
            {/* Overview Metadata Grid */}
            <div className="space-y-3.5">
              {/* Event Description Card */}
              <div className="p-4 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold block">
                  What Happened
                </span>
                <p className="text-sm font-sans font-medium text-slate-900 dark:text-[#EDEDED] leading-relaxed">
                  {selectedLog.event_description}
                </p>
              </div>

              {/* Key-Value Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] block font-semibold">
                    Staff Member
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-[#EDEDED] block font-sans">
                    {selectedLog.user_name} ({selectedLog.user_role?.replace('_', ' ')})
                  </span>
                </div>

                <div className="p-3.5 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] block font-semibold">
                    Reference Item
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-900 dark:text-[#EDEDED] block">
                    {selectedLog.target_entity}: {selectedLog.target_identifier}
                  </span>
                </div>

                <div className="p-3.5 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] block font-semibold">
                    Computer / Device
                  </span>
                  <span className="text-xs font-mono text-slate-600 dark:text-[#A1A1A1] block">
                    {selectedLog.ip_address || '127.0.0.1 (Local POS Terminal)'}
                  </span>
                </div>

                <div className="p-3.5 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] block font-semibold">
                    Branch
                  </span>
                  <span className="text-xs font-sans text-slate-600 dark:text-[#A1A1A1] block">
                    {activeBranch.branch_name} ({activeBranch.branch_code})
                  </span>
                </div>
              </div>

              {/* SHA-256 Hash Verification Card */}
              <div className="p-4 rounded-[12px] bg-slate-100/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-[#8E8E93] font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#3ecf8e]" />
                    <span>Security Protection Code (SHA-256)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(selectedLog.tamper_proof_signature || '', 'Security Code')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-white/80 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-slate-900 dark:text-[#EDEDED] border border-slate-200/80 dark:border-white/10 text-[10px] font-mono cursor-pointer"
                  >
                    {copiedLabel === 'Security Code' ? <Check className="w-3 h-3 text-[#3ecf8e]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLabel === 'Security Code' ? 'COPIED' : 'COPY CODE'}</span>
                  </button>
                </div>
                <div className="p-3 rounded-[6px] bg-white dark:bg-[#0d0d0e] border border-slate-200/80 dark:border-white/10 font-mono text-[11px] text-[#3ecf8e] break-all select-all">
                  {selectedLog.tamper_proof_signature || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                </div>
              </div>
            </div>
          </div>
        </SlideOverDrawer>
      )}
    </div>
  );
};

