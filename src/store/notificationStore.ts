import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ERPNotification } from '@/types/database';
import { supabase } from '@/lib/supabase';

export interface BroadcastMessage {
  id: string;
  badge?: string;
  message: string;
  link?: string;
  created_at: string;
}

interface NotificationState {
  notifications: ERPNotification[];
  broadcast: BroadcastMessage | null;
  fetchCloudNotifications: () => Promise<void>;
  addNotification: (notification: Omit<ERPNotification, 'id' | 'created_at' | 'read_by'>) => void;
  markAsRead: (id: string, username: string) => void;
  markAllAsRead: (username: string) => void;
  clearAll: () => void;
  getNotificationsForUser: (userRole?: string, branchId?: string) => ERPNotification[];
  getUnreadCount: (username?: string, userRole?: string, branchId?: string) => number;
  setBroadcast: (msg: BroadcastMessage | null) => void;
}

const INITIAL_NOTIFICATIONS: ERPNotification[] = [];

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: INITIAL_NOTIFICATIONS,
      broadcast: null,

      setBroadcast: (msg) => set({ broadcast: msg }),

      fetchCloudNotifications: async () => {
        try {
          const { data, error } = await supabase
            .from('app_notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

          if (!error && data && data.length > 0) {
            const mapped: ERPNotification[] = data.map((d: any) => ({
              id: d.id,
              title: d.title,
              message: d.message,
              type: d.type || 'info',
              target_roles: d.target_roles || ['Super_Admin', 'Store_Manager', 'Cashier', 'Auditor'],
              branch_id: d.branch_id,
              reference_id: d.reference_id,
              amount: d.amount,
              read_by: Array.isArray(d.read_by) ? d.read_by : [],
              created_at: d.created_at,
            }));
            set({ notifications: mapped });
          }
        } catch (e) {
          console.warn('Cloud notification fetch fallback:', e);
        }
      },

      addNotification: async (data) => {
        const tempId = `NOTIF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        const newNotif: ERPNotification = {
          id: tempId,
          ...data,
          created_at: new Date().toISOString(),
          read_by: [],
        };
        set((state) => ({
          notifications: [newNotif, ...state.notifications].slice(0, 50),
        }));

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('asopalav:notification-received', { detail: newNotif })
          );
        }

        // Persist to Supabase app_notifications
        try {
          await supabase.from('app_notifications').insert([
            {
              title: data.title,
              message: data.message,
              type: data.type || 'info',
              target_roles: data.target_roles || ['Super_Admin', 'Store_Manager', 'Cashier', 'Auditor'],
              branch_id: data.branch_id || null,
              reference_id: data.reference_id || null,
              amount: data.amount || null,
              read_by: [],
              created_at: newNotif.created_at,
            },
          ]);
        } catch (e) {
          console.warn('Notification cloud insert fallback:', e);
        }
      },

      markAsRead: async (id: string, username: string) => {
        if (!username) return;
        const current = get().notifications.find((n) => n.id === id);
        const updatedReadBy = current && !current.read_by.includes(username)
          ? [...current.read_by, username]
          : current?.read_by || [username];

        set((state) => ({
          notifications: state.notifications.map((n) => {
            if (n.id === id && !n.read_by.includes(username)) {
              return { ...n, read_by: [...n.read_by, username] };
            }
            return n;
          }),
        }));

        try {
          await supabase
            .from('app_notifications')
            .update({ read_by: updatedReadBy })
            .eq('id', id);
        } catch (e) {
          console.warn('Notification mark read fallback:', e);
        }
      },

      markAllAsRead: async (username: string) => {
        if (!username) return;
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            read_by: n.read_by.includes(username) ? n.read_by : [...n.read_by, username],
          })),
        }));

        try {
          const unreadIds = get().notifications
            .filter((n) => !n.read_by.includes(username))
            .map((n) => n.id);
          if (unreadIds.length > 0) {
            // Background update
            for (const n of get().notifications) {
              if (!n.read_by.includes(username)) {
                await supabase
                  .from('app_notifications')
                  .update({ read_by: [...n.read_by, username] })
                  .eq('id', n.id);
              }
            }
          }
        } catch (e) {
          console.warn('Notification mark all read fallback:', e);
        }
      },

      clearAll: () => {
        set({ notifications: [] });
      },

      getNotificationsForUser: (userRole = 'Super_Admin', branchId) => {
        const { notifications } = get();
        return notifications.filter((n) => {
          const roleMatches =
            userRole === 'Super_Admin' ||
            n.target_roles.includes(userRole) ||
            n.target_roles.includes('*');
          const branchMatches = !branchId || !n.branch_id || n.branch_id === branchId || n.branch_id === '*';
          return roleMatches && branchMatches;
        });
      },

      getUnreadCount: (username = '', userRole = 'Super_Admin', branchId) => {
        const notifs = get().getNotificationsForUser(userRole, branchId);
        if (!username) return notifs.length;
        return notifs.filter((n) => !n.read_by.includes(username)).length;
      },
    }),
    {
      name: 'asopalav-erp-notifications-storage',
    }
  )
);
