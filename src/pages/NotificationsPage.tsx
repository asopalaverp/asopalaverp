import React, { useState, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useNotificationStore } from '@/store/notificationStore';
import { ERPNotification } from '@/types/database';
import { IOSSegmentedControl } from '@/components/ui/ios';
import { formatINR, formatDate, cn, triggerHaptic } from '@/lib/utils';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  Coins,
  HandCoins,
  Receipt,
  RotateCcw,
  Trash2,
  Check,
  ArrowRight,
  Sparkles,
  Filter,
  Eye,
  EyeOff,
  CloudSync,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { showToast } from '@/components/ui/ToastContainer';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

type NotificationCategoryFilter =
  | 'all'
  | 'unread'
  | 'critical'
  | 'treasury'
  | 'advances'
  | 'vouchers'
  | 'system';

export const NotificationsPage: React.FC = () => {
  const { setActivePage, openDrawer } = useUIStore();
  const { user } = useAuthStore();
  const { branches, selectedBranchId, setSelectedBranchId, getActiveBranch } = useBranchStore();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    getNotificationsForUser,
  } = useNotificationStore();

  const [activeTab, setActiveTab] = useState<NotificationCategoryFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');

  const username = user?.username || 'user';
  const userRole = user?.role_code || 'Super_Admin';

  // Filter notifications based on permissions and branch
  const userNotifications = useMemo(() => {
    return getNotificationsForUser(userRole, branchFilter === 'ALL' ? undefined : branchFilter);
  }, [notifications, userRole, branchFilter, getNotificationsForUser]);

  // Tab filtered notifications
  const filteredNotifications = useMemo(() => {
    return userNotifications.filter((n) => {
      const isUnread = !n.read_by.includes(username);

      if (activeTab === 'unread') return isUnread;
      if (activeTab === 'critical') {
        return (
          n.type === 'safe_drop' ||
          n.type === 'closing_variance' ||
          n.type === 'sec40a3_warning' ||
          n.type === 'approval_request'
        );
      }
      if (activeTab === 'treasury') {
        return n.type === 'safe_drop' || n.type === 'closing_variance';
      }
      if (activeTab === 'vouchers') {
        return n.type === 'high_value_voucher' || n.type === 'sec40a3_warning';
      }
      if (activeTab === 'system') {
        return n.type === 'system' || n.type === 'offline_sync' || n.type === 'period_lock';
      }
      return true;
    });
  }, [userNotifications, activeTab, username]);

  const unreadCount = useMemo(() => {
    return userNotifications.filter((n) => !n.read_by.includes(username)).length;
  }, [userNotifications, username]);

  const handleMarkAllRead = () => {
    triggerHaptic('success');
    markAllAsRead(username);
    showToast({
      type: 'success',
      title: 'All Caught Up',
      message: 'All notifications marked as read.',
    });
  };

  const handleClearAll = () => {
    triggerHaptic('selection');
    clearAll();
    showToast({
      type: 'info',
      title: 'Notifications Cleared',
      message: 'All notification history cleared.',
    });
  };

  const handleToggleRead = (id: string, isRead: boolean) => {
    triggerHaptic('selection');
    if (!isRead) {
      markAsRead(id, username);
    }
  };

  const handleNotificationAction = (n: ERPNotification) => {
    triggerHaptic('selection');
    markAsRead(n.id, username);

    if (n.type === 'safe_drop') {
      setActivePage('treasury');
      showToast({ type: 'info', title: 'Navigating to Cash Drawer', message: 'Manage cash till and safe deposit.' });
    } else if (n.type === 'closing_variance') {
      setActivePage('closing');
      showToast({ type: 'info', title: 'Navigating to Daily Closing', message: 'Review denomination variance.' });
    } else if (n.type === 'high_value_voucher') {
      setActivePage('expenses');
      showToast({ type: 'info', title: 'Navigating to Expense Ledger', message: 'Review voucher details.' });
    } else if (n.type === 'offline_sync') {
      showToast({ type: 'success', title: 'Cloud Sync Active', message: 'Offline mutations synchronized.' });
    } else {
      setActivePage('dashboard');
    }
  };

  const getNotifIcon = (type: ERPNotification['type']) => {
    switch (type) {
      case 'safe_drop':
        return <Wallet className="w-4 h-4 text-amber-500" />;
      case 'closing_variance':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'high_value_voucher':
        return <Receipt className="w-4 h-4 text-emerald-500" />;
      case 'sec40a3_warning':
        return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case 'offline_sync':
        return <CheckCircle2 className="w-4 h-4 text-sky-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const getNotifBadge = (type: ERPNotification['type']) => {
    switch (type) {
      case 'safe_drop':
        return <span className="badge-status-amber text-[10px] font-mono px-2 py-0.5 rounded-[4px]">SAFE DROP</span>;
      case 'closing_variance':
        return <span className="badge-status-rose text-[10px] font-mono px-2 py-0.5 rounded-[4px]">VARIANCE</span>;
      case 'high_value_voucher':
        return <span className="badge-status-emerald text-[10px] font-mono px-2 py-0.5 rounded-[4px]">HIGH VALUE</span>;
      case 'sec40a3_warning':
        return <span className="badge-status-rose text-[10px] font-mono px-2 py-0.5 rounded-[4px]">SEC 40A(3)</span>;
      case 'offline_sync':
        return <span className="badge-status-blue text-[10px] font-mono px-2 py-0.5 rounded-[4px]">SYNC</span>;
      default:
        return <span className="badge-status-neutral text-[10px] font-mono px-2 py-0.5 rounded-[4px]">SYSTEM</span>;
    }
  };

  const TABS: { id: NotificationCategoryFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All Alerts', count: userNotifications.length },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'critical', label: 'Urgent / Important' },
    { id: 'treasury', label: 'Cash Box & Safe' },
    { id: 'vouchers', label: 'Expense Bills' },
    { id: 'system', label: 'System & Shop' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#141414] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-20 select-none flex flex-col">
      {/* 1. Notifications Header (iOS 16 Frosted Glass) */}
      <div className="sticky top-0 z-30 px-4 lg:px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 backdrop-blur-2xl bg-white/80 dark:bg-[#121214]/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 max-w-5xl mx-auto w-full">
          {/* Left Layer: Title, Status Badges & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900 dark:text-[#EDEDED] font-sans flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#3ecf8e]" />
                <span>Alerts & Messages</span>
              </h1>
              {unreadCount > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap inline-flex items-center font-medium">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-mono bg-emerald-500/10 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 whitespace-nowrap inline-flex items-center font-medium">
                  All caught up
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
              Important alerts, cash box warnings, closing differences, and shop updates.
            </p>
          </div>

          {/* Right Layer: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="h-8.5 px-3.5 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs select-none ios-press"
              >
                <Check className="w-3.5 h-3.5 text-[#171717] stroke-[2.5]" />
                <span>Mark All as Read ({unreadCount})</span>
              </button>
            )}

            {userNotifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="h-8.5 px-3 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 text-slate-700 dark:text-[#A1A1A1] hover:text-slate-900 dark:hover:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ios-press"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Studio Content Area */}
      <main className="px-4 lg:px-6 py-6 space-y-5 max-w-5xl mx-auto w-full flex-1">
        {/* TOP SUMMARY BAR */}
        <div className="relative z-30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-[12px] bg-slate-50/80 dark:bg-[#18181a] border border-slate-200/80 dark:border-[#242424] shadow-xs">
          {/* Category Tabs */}
          <IOSSegmentedControl
            options={TABS.map((t) => ({
              id: t.id,
              label: t.count !== undefined ? `${t.label} (${t.count})` : t.label,
            }))}
            value={activeTab}
            onChange={(val) => setActiveTab(val as NotificationCategoryFilter)}
            size="sm"
          />

          {/* Showroom Branch Filter */}
          <div className="flex items-center gap-1.5 text-xs min-w-[200px]">
            <span className="text-slate-500 dark:text-zinc-400 font-sans shrink-0">Showroom:</span>
            <div className="flex-1 min-w-[160px]">
              <SearchableSelect
                size="sm"
                options={[
                  { value: 'ALL', label: 'All Branches' },
                  ...branches.map((b) => ({
                    value: b.branch_id,
                    label: b.branch_code,
                    sublabel: b.branch_name.replace(/^Asopalav\s*-\s*/i, ''),
                  })),
                ]}
                value={branchFilter}
                onChange={setBranchFilter}
                placeholder="All Branches"
                searchPlaceholder="Search showroom..."
                allowCustom={false}
              />
            </div>
          </div>
        </div>

        {/* NOTIFICATIONS LIST */}
        <div className="space-y-3">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notif) => {
              const isRead = notif.read_by.includes(username);

              return (
                <div
                  key={notif.id}
                  className={cn(
                    'p-4 rounded-[12px] border transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-xs',
                    isRead
                      ? 'bg-white dark:bg-[#18181a] border-slate-200/80 dark:border-[#242424] opacity-85'
                      : 'bg-white dark:bg-[#1a1a1c] border-emerald-500/40 dark:border-[#3ecf8e]/30 shadow-md ring-1 ring-[#3ecf8e]/10'
                  )}
                >
                  {/* Left: Icon & Content */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-[6px] bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      {getNotifIcon(notif.type)}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getNotifBadge(notif.type)}

                        {!isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#3ecf8e] animate-pulse" />
                        )}

                        <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                          {formatDate(notif.created_at)}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans tracking-tight">
                        {notif.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-zinc-300 font-sans leading-relaxed">
                        {notif.message}
                      </p>

                      {notif.amount !== undefined && notif.amount > 0 && (
                        <div className="pt-1">
                          <span className="text-xs font-mono font-medium text-emerald-600 dark:text-[#3ecf8e] tabular-nums">
                            Amount: {formatINR(notif.amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Direct Action Button & Read Toggle */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => handleToggleRead(notif.id, isRead)}
                      className="w-8 h-8 rounded-[6px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-all cursor-pointer ios-press"
                      title={isRead ? 'Marked as read' : 'Mark as read'}
                    >
                      {isRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-[#3ecf8e]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNotificationAction(notif)}
                      className="px-3.5 py-1.5 rounded-[6px] border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-medium font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ios-press"
                    >
                      <span>Take Action</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center rounded-[12px] bg-white dark:bg-[#18181a] border border-slate-200/80 dark:border-[#242424] space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto stroke-[1.5]" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                  No notifications in this category
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-sans max-w-md mx-auto">
                  All system operations, cash float limits, and staff advance settlements are currently verified and up to date.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default NotificationsPage;
