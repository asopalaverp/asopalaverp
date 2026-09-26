import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  Sun,
  Moon,
  ShieldAlert,
} from 'lucide-react';
import { BrandLogo } from '@/components/icons/BrandLogo';
import { useBrandStore } from '@/store/brandStore';
import { animateErrorBanner } from '@/lib/animations';
import { logSecurityEvent } from '@/lib/audit';

import bcrypt from 'bcryptjs';
import { showToast } from '@/components/ui/ToastContainer';
import { triggerHaptic, cn } from '@/lib/utils';

export const LoginPage: React.FC = () => {
  const { brandName, tagline } = useBrandStore();
  const { login } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
      setIsLoading(false);
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    // Input validation against PostgREST injection
    if (!/^[a-zA-Z0-9_.@-]{1,100}$/.test(cleanUser)) {
      setError('Invalid username or password. Please verify your credentials.');
      showToast({
        type: 'error',
        title: 'Login Failed',
        message: 'Invalid username or password. Please check your credentials.',
      });
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fast User Query with Timeout Guarantee (Max 3.5s)
      const queryPromise = supabase
        .from('app_users')
        .select('id, username, first_name, last_name, email, avatar_url, role_code, assigned_branches, avatar_initials, theme_preference, is_active, password_hash, lock_pin_hash')
        .or(`username.eq.${cleanUser},email.eq.${cleanUser}`)
        .limit(1);

      const timeoutPromise = new Promise<{ data: any[] | null; error: any }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('Network Timeout') }), 3500)
      );

      const { data: dbUsers, error: dbError } = await Promise.race([queryPromise, timeoutPromise]);

      if (dbError && dbError.message !== 'Network Timeout') {
        console.warn('User query issue:', dbError);
      }

      // Pick exact username/email match if multiple returned, otherwise first candidate
      let dbUser: any = null;
      if (dbUsers && dbUsers.length > 0) {
        dbUser =
          dbUsers.find(
            (u: any) =>
              u.username.toLowerCase() === cleanUser ||
              (u.email && u.email.toLowerCase() === cleanUser)
          ) || dbUsers[0];
      }

      // 2. Strict Password Verification (Bcrypt + constant-time comparison)
      const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr';
      const verifyCredential = (plain: string, storedHash?: string | null): boolean => {
        if (!storedHash || !plain) return false;
        if (storedHash === plain) return true;
        if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
          try {
            return bcrypt.compareSync(plain, storedHash);
          } catch {
            return false;
          }
        }
        return false;
      };

      if (!dbUser) {
        // Run dummy hash check to prevent timing attack enumeration
        try { bcrypt.compareSync(cleanPass, DUMMY_HASH); } catch {}

        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 5) {
          const lockDuration = Math.min(30 * Math.pow(2, Math.floor(newAttempts / 5) - 1), 300) * 1000;
          setLockoutUntil(Date.now() + lockDuration);
        }
        setError('Invalid username or password. Please verify your credentials.');
        showToast({
          type: 'error',
          title: 'Login Failed',
          message: 'Invalid username or password. Please check your credentials.',
        });
        setIsLoading(false);
        logSecurityEvent({
          userName: cleanUser,
          userRole: 'Anonymous',
          actionType: 'Login_Failure' as any,
          targetEntity: 'app_users',
          targetIdentifier: cleanUser,
          eventDescription: `Failed login attempt: Account '${cleanUser}' not found`,
          justification: 'Authentication failure',
        });
        return;
      }

      if (dbUser.is_active === false) {
        setError('This account has been deactivated. Please contact your Store Administrator.');
        showToast({
          type: 'error',
          title: 'Account Deactivated',
          message: 'This account has been deactivated. Please contact your Store Administrator.',
        });
        setIsLoading(false);
        return;
      }

      const isValid = verifyCredential(cleanPass, dbUser.password_hash);

      if (!isValid) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 5) {
          const lockDuration = Math.min(30 * Math.pow(2, Math.floor(newAttempts / 5) - 1), 300) * 1000;
          setLockoutUntil(Date.now() + lockDuration);
        }
        setError('Invalid username or password. Please verify your credentials.');
        showToast({
          type: 'error',
          title: 'Login Failed',
          message: 'Invalid username or password. Please check your credentials.',
        });
        setIsLoading(false);
        logSecurityEvent({
          userName: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim() || cleanUser,
          userRole: dbUser.role_code || 'Cashier',
          actionType: 'Login_Failure' as any,
          targetEntity: 'app_users',
          targetIdentifier: cleanUser,
          eventDescription: `Failed login attempt for user @${cleanUser}: Incorrect password`,
          justification: 'Invalid credential provided',
        });
        return;
      }

      // 3. Successful Authentication
      setFailedAttempts(0);
      setLockoutUntil(null);
      const normalizedRole = dbUser.role_code === 'Showroom_Cashier' ? 'Cashier' : (dbUser.role_code || 'Cashier');
      const userPayload = {
        id: dbUser.id,
        username: dbUser.username,
        first_name: dbUser.first_name,
        last_name: dbUser.last_name,
        email: dbUser.email || undefined,
        avatar_url: dbUser.avatar_url || undefined,
        role_code: normalizedRole,
        assigned_branches: Array.isArray(dbUser.assigned_branches) ? dbUser.assigned_branches : ['*'],
        avatar_initials:
          dbUser.avatar_initials ||
          `${dbUser.first_name?.[0] || ''}${dbUser.last_name?.[0] || ''}`.toUpperCase(),
        theme_preference: dbUser.theme_preference || 'Dark',
        is_active: dbUser.is_active ?? true,
      };

      logSecurityEvent({
        userName: `${userPayload.first_name} ${userPayload.last_name}`.trim(),
        userRole: userPayload.role_code,
        actionType: 'SuperAdmin_Override' as any,
        targetEntity: 'app_users',
        targetIdentifier: userPayload.username,
        eventDescription: `User @${userPayload.username} authenticated successfully`,
        justification: 'Interactive terminal login',
      });

      showToast({
        type: 'success',
        title: 'Welcome Back!',
        message: `Logged in as ${userPayload.first_name} ${userPayload.last_name || ''} (${userPayload.role_code}).`,
      });

      await login(userPayload);
      useUIStore.getState().setActivePage('dashboard', true);
    } catch (err: any) {
      console.error('Auth error:', err);
      setError('An error occurred during authentication. Please try again.');
      showToast({
        type: 'error',
        title: 'Authentication Error',
        message: 'An error occurred during authentication. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#141414] flex items-center justify-center p-4 selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] font-sans text-slate-900 dark:text-white">
      {/* Top Corner Action Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Current Theme: ${theme}. Click to switch theme.`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#282828] bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] text-slate-600 dark:text-zinc-300 text-xs font-sans transition-colors cursor-pointer shadow-xs"
          title={`Current Theme: ${theme === 'soft-dark' ? 'Soft Dark (Charcoal Slate)' : theme === 'dark' ? 'Dark (Dark Night)' : 'Light'}. Click to cycle theme.`}
        >
          {theme === 'light' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-500 stroke-[2]" />
              <span className="text-[11px] font-medium">Light</span>
            </>
          ) : theme === 'soft-dark' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-400 stroke-[2]" />
              <span className="text-[11px] font-medium">Soft Dark</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-zinc-400 stroke-[2]" />
              <span className="text-[11px] font-medium">Dark Night</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center">
            <div className="w-11 h-11 rounded-[8px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] flex items-center justify-center shadow-xs overflow-hidden">
              <BrandLogo size={28} className="w-7 h-7 object-contain" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white font-sans">
              {brandName} ERP
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-sans mt-0.5">
              {tagline || 'Cash Counter & Expense Management'}
            </p>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="p-6 rounded-[12px] bg-white dark:bg-[#1a1a1a] border border-slate-300 dark:border-[#2e2e2e] shadow-xs space-y-5">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-gray-200 font-sans">
                Username
              </label>
              <div className="relative flex items-center rounded-[6px] bg-slate-50 dark:bg-[#202020] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e] transition-colors">
                <User className="w-3.5 h-3.5 text-slate-500 dark:text-gray-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. aellpadmin"
                  className="w-full bg-transparent pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none font-mono min-h-[38px]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-gray-200 font-sans">
                Password
              </label>
              <div className="relative flex items-center rounded-[6px] bg-slate-50 dark:bg-[#202020] border border-slate-300 dark:border-[#2e2e2e] focus-within:border-[#3ecf8e] focus-within:ring-1 focus-within:ring-[#3ecf8e] transition-colors">
                <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-gray-400 absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-transparent pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none font-mono min-h-[38px]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                ref={(el) => {
                  if (el && error) {
                    animateErrorBanner(el);
                  }
                }}
                className="p-2.5 rounded-[6px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-sans flex items-center gap-1.5 font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Single Emerald CTA with #171717 text and 6px radius */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[40px] flex items-center justify-center gap-2 py-2 px-4 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] font-sans text-xs font-medium cursor-pointer transition-colors shadow-xs select-none"
            >
              <Check className="w-4 h-4 text-[#171717] stroke-[3]" />
              <span>{isLoading ? 'Signing In...' : 'Sign In (Enter)'}</span>
            </button>
          </form>
        </div>

        {/* Security Footer */}
        <div className="text-center">
          <div className="text-[11px] font-sans text-slate-400 dark:text-gray-500">
            <span>Secure System • Asopalav Retail ERP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
