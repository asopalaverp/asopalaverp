import React, { useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useBranchStore } from '@/store/branchStore';
import { erpService } from '@/lib/erpService';
import { uploadAvatarToSupabase } from '@/lib/supabase';
import { uploadToR2 } from '@/lib/r2';
import bcrypt from 'bcryptjs';
import { showToast } from '@/components/ui/ToastContainer';
import { triggerHaptic, cn } from '@/lib/utils';
import { logSecurityEvent } from '@/lib/audit';
import {
  Lock,
  Check,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  User,
  Shield,
  Camera,
  Upload,
  Trash2,
  Sparkles,
  Menu,
  X,
  ChevronRight,
  ShieldAlert,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { SuperAdminOverridesCard } from '@/components/settings/SuperAdminOverridesCard';

type ProfileTabId = 'account' | 'security' | 'theme' | 'overrides';

interface ProfileTabItem {
  id: ProfileTabId;
  name: string;
  group: 'PERSONAL SETTINGS' | 'ADMIN CONTROLS';
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const ProfileSecurityPage: React.FC = () => {
  const { user, login, updateUserPin } = useAuthStore();
  const { theme, setTheme, setActivePage } = useUIStore();
  const { getActiveBranch } = useBranchStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-[#878787]">Session expired. Please log in again.</p>
      </div>
    );
  }

  const activeBranch = getActiveBranch();

  // Tab State
  const [activeTabId, setActiveTabId] = useState<ProfileTabId>('account');
  const [isMobileSubMenuOpen, setIsMobileSubMenuOpen] = useState(false);

  const isSuperAdminOrDev = user?.role_code === 'Super_Admin' || user?.role_code === 'Developer';

  // Profile Information State
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Handle local file upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'Image Too Large',
        message: 'Please choose an avatar image under 5MB.',
      });
      return;
    }

    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showToast({ type: 'error', title: 'Invalid File Type', message: 'Only JPEG, PNG, and WebP images are allowed. SVG and other formats are not permitted.' });
      return;
    }

    const toastId = 'avatar-upload-toast';
    setIsUploadingPhoto(true);
    triggerHaptic('light');
    showToast({
      id: toastId,
      type: 'loading',
      title: 'Processing Photo',
      message: 'Optimizing and uploading profile photo...',
      durationMs: 6000,
    });

    try {
      let uploadedUrl = await uploadAvatarToSupabase(file, user?.username || user?.id || 'admin');

      if (!uploadedUrl) {
        uploadedUrl = await uploadToR2(file, 'avatars', file.name);
      }

      if (uploadedUrl) {
        setAvatarUrl(uploadedUrl);
        triggerHaptic('success');
        showToast({
          id: toastId,
          type: 'success',
          title: 'Photo Uploaded to Cloud',
          message: 'Saved to Supabase storage. Click "Save Profile" to apply to your account.',
        });
      } else {
        showToast({
          id: toastId,
          type: 'error',
          title: 'Upload Failed',
          message: 'Could not upload avatar. Please try again.',
        });
      }
    } catch (err: any) {
      console.warn('Avatar upload fallback:', err);
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // Security & Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState(false);
  const [securityError, setSecurityError] = useState('');

  // Save Profile (Name, Email, Username, Avatar)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setProfileError('');
    setIsSavingProfile(true);
    triggerHaptic('selection');

    try {
      const profileUpdates = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        avatar_url: avatarUrl || null,
      };

      await erpService.saveAppUser(
        { id: user.id, username: user.username, role_code: user.role_code, ...profileUpdates },
        true,
        `${user.first_name} ${user.last_name}`,
        user.role_code
      );

      // Update local auth state without resetting session:
      const updatedUser = { ...user, ...profileUpdates };
      useAuthStore.setState({ user: updatedUser });

      await logSecurityEvent({
        userName: `${user.first_name} ${user.last_name}`,
        userRole: user.role_code,
        actionType: 'Update_Profile',
        targetEntity: 'app_users',
        targetIdentifier: user.id,
        eventDescription: `Profile updated: name, email, or avatar changed`,
        justification: 'Self-service profile update',
      });

      setProfileSuccess(true);
      showToast({
        type: 'success',
        title: 'Profile Saved',
        message: 'Your personal showroom profile has been updated.',
      });

      setTimeout(() => setProfileSuccess(false), 4000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setProfileError(err.message || 'Failed to save profile changes.');
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not update profile in database.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Update Security Credentials (Password & Quick-Switch PIN)
  const handleUpdateSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError('');

    if (!newPassword && !pin) {
      setSecurityError('Please enter a new password or a new 4-digit PIN to update.');
      return;
    }

    if (newPassword) {
      if (!currentPassword) {
        setSecurityError('Please enter your current password to change it.');
        return;
      }
      if (!(user as any).password_hash || !bcrypt.compareSync(currentPassword, (user as any).password_hash)) {
        setSecurityError('Current password is incorrect.');
        return;
      }

      if (newPassword.length < 8) {
        setSecurityError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[A-Z]/.test(newPassword)) {
        setSecurityError('Password must contain at least one uppercase letter.');
        return;
      }
      if (!/[0-9]/.test(newPassword)) {
        setSecurityError('Password must contain at least one number.');
        return;
      }
      if (!/[^A-Za-z0-9]/.test(newPassword)) {
        setSecurityError('Password must contain at least one special character.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setSecurityError('New password and confirmation do not match.');
        return;
      }
    }

    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        setSecurityError('Lock PIN must be exactly 4 numeric digits.');
        return;
      }
    }

    setIsUpdatingSecurity(true);
    triggerHaptic('selection');

    try {
      if (pin && user) {
        const hashedPin = bcrypt.hashSync(pin, 10);
        updateUserPin(user.id, pin);
        // Also persist to database
        await erpService.saveAppUser(
          { id: user.id, username: user.username, role_code: user.role_code, lock_pin_hash: hashedPin },
          true,
          `${user.first_name} ${user.last_name}`,
          user.role_code
        );
      }

      if (newPassword && user) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await erpService.saveAppUser(
          { ...user, password_hash: hashedPassword },
          true,
          `${user.first_name} ${user.last_name}`,
          user.role_code
        );
      }

      await logSecurityEvent({
        userName: `${user?.first_name || 'User'} ${user?.last_name || ''}`.trim(),
        userRole: user?.role_code || 'Cashier',
        actionType: 'Update_User',
        targetEntity: 'app_users',
        targetIdentifier: user?.username || 'user',
        eventDescription: 'Updated account credentials / security lock PIN.',
        justification: 'User initiated security credential update',
      });

      setSecuritySuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPin('');
      showToast({
        type: 'success',
        title: 'Credentials Updated',
        message: newPassword && pin
          ? 'Password and 4-digit PIN updated successfully.'
          : newPassword
          ? 'Login password updated successfully.'
          : '4-digit PIN updated successfully.',
      });
      setTimeout(() => setSecuritySuccess(false), 4000);
    } catch (err: any) {
      console.error('Failed to update credentials:', err);
      setSecurityError(err.message || 'Failed to update credentials in database.');
    } finally {
      setIsUpdatingSecurity(false);
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'soft-dark') => {
    setTheme(newTheme);
    if (user) {
      const themePref: 'Light' | 'Dark' = newTheme === 'light' ? 'Light' : 'Dark';
      try {
        await erpService.saveAppUser(
          { ...user, theme_preference: themePref },
          true,
          `${user.first_name} ${user.last_name}`,
          user.role_code
        );
      } catch (err) {
        console.warn('Failed to sync theme preference to DB:', err);
      }
    }
  };

  // Profile Navigation Tabs Definitions
  const PROFILE_TABS: ProfileTabItem[] = [
    {
      id: 'account',
      name: 'Account & Avatar',
      group: 'PERSONAL SETTINGS',
      icon: User,
      description: 'Display name, username, email address, and profile photo',
    },
    {
      id: 'security',
      name: 'Password & PIN',
      group: 'PERSONAL SETTINGS',
      icon: KeyRound,
      description: 'Login password and terminal quick-switch 4-digit lock PIN',
    },
    {
      id: 'theme',
      name: 'Appearance & Theme',
      group: 'PERSONAL SETTINGS',
      icon: Sparkles,
      description: 'Showroom display mode, dark night theme, and studio canvas density',
    },
    ...(isSuperAdminOrDev
      ? ([
          {
            id: 'overrides',
            name: 'Emergency Overrides',
            group: 'ADMIN CONTROLS',
            icon: ShieldAlert,
            description: 'Master rule bypasses, Section 40A(3) override, and till overdraft switches',
          },
        ] as ProfileTabItem[])
      : []),
  ];

  const currentTab = PROFILE_TABS.find((t) => t.id === activeTabId) || PROFILE_TABS[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#121214] text-slate-900 dark:text-[#EDEDED] font-sans antialiased selection:bg-[#3ecf8e]/20 selection:text-[#3ecf8e] pb-16">
      {/* 1. iOS 18 Apple ID Profile Hero Bar */}
      <div className="sticky top-0 z-30 px-4 lg:px-6 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] backdrop-blur-2xl bg-white/85 dark:bg-[#141416]/85">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-5xl mx-auto">
          {/* User Identity Pill */}
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user?.first_name}
                  className="w-11 h-11 rounded-full object-cover border border-black/[0.08] dark:border-white/15 shadow-xs"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-[#3ecf8e] text-[#171717] flex items-center justify-center font-bold text-sm tracking-wider shadow-xs">
                  {user?.avatar_initials || user?.first_name?.slice(0, 2).toUpperCase() || 'AS'}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#3ecf8e] ring-2 ring-white dark:ring-[#141416]" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate font-sans">
                  {user?.first_name} {user?.last_name || ''}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-[#3ecf8e] border border-emerald-500/20 text-[10px] font-mono font-medium">
                  {user?.role_code ? user.role_code.replace(/_/g, ' ') : 'Cashier'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8e8e93] font-sans truncate">
                @{user?.username} · {activeBranch.branch_name} ({activeBranch.branch_code})
              </p>
            </div>
          </div>

          {/* Right: Quick Link to Showroom Master Settings (Admin only) */}
          {isSuperAdminOrDev && (
            <button
              type="button"
              onClick={() => setActivePage('settings')}
              className="px-3 py-1.5 rounded-[6px] border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 cursor-pointer transition-all shrink-0 ios18-press shadow-2xs self-start sm:self-auto"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Shop Settings</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Segmented Navigation Tabs */}
      <div className="px-4 lg:px-6 pt-4 max-w-5xl mx-auto w-full">
        <div className="overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-white/10 p-1 rounded-[12px] border border-black/[0.04] dark:border-white/10 backdrop-blur-xl max-w-full">
            {PROFILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setActiveTabId(tab.id);
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-[6px] text-xs font-medium font-sans whitespace-nowrap transition-all duration-150 cursor-pointer ios18-press shrink-0',
                    isActive
                      ? 'bg-white dark:bg-[#3a3a3c] text-slate-900 dark:text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-[#a1a1a6] hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-[#3ecf8e]' : 'text-slate-400 dark:text-[#888]')} />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Main Full-Width Content Area */}
      <main className="max-w-5xl mx-auto px-4 lg:px-6 py-5 w-full flex-1">
        {/* Master Tab Content Area */}
        <div className="space-y-6">
            {/* TAB 1: ACCOUNT & AVATAR PROFILE */}
            {activeTabId === 'account' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Photo & Identity Hero Card */}
                  <div className="p-5 rounded-[12px] bg-white/80 dark:bg-[#1a1a1c]/80 border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-xs space-y-5">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white font-sans flex items-center gap-2">
                        <User className="w-4 h-4 text-[#3ecf8e]" />
                        <span>Profile Picture &amp; Identity</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
                        Your avatar is displayed on thermal expense receipt vouchers and system audit logs.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pt-1">
                      <div className="relative group">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile Avatar"
                            className="w-24 h-24 rounded-full object-cover border-2 border-slate-200 dark:border-[#333333] shadow-sm group-hover:opacity-90 transition-opacity"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-full bg-[#007a4d] text-white flex items-center justify-center font-bold text-2xl font-sans shadow-inner">
                            {user?.avatar_initials || user?.first_name?.slice(0, 2).toUpperCase() || 'AS'}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingPhoto}
                          className="absolute bottom-0 right-0 p-2 rounded-full bg-[#3ecf8e] text-[#171717] hover:bg-[#24b47e] shadow-md transition-all cursor-pointer active:scale-95"
                          title="Change Profile Photo"
                        >
                          <Camera className="w-4 h-4 text-[#171717]" />
                        </button>
                      </div>

                      <div className="space-y-2 flex-1 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/jpg"
                            className="hidden"
                            onChange={handleImageFileChange}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingPhoto}
                            className="px-3.5 py-1.5 rounded-[6px] bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-xs font-semibold text-slate-800 dark:text-zinc-200 border border-slate-200/80 dark:border-white/10 flex items-center gap-1.5 cursor-pointer transition-all ios-press"
                          >
                            {isUploadingPhoto ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3ecf8e]" />
                            ) : (
                              <Upload className="w-3.5 h-3.5 text-[#3ecf8e]" />
                            )}
                            <span>{isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                          </button>

                          {avatarUrl && (
                            <button
                              type="button"
                              onClick={() => setAvatarUrl('')}
                              className="px-3 py-1.5 rounded-[6px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ios-press"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-[#777777] font-sans">
                          Supported formats: JPG, PNG, WEBP. Maximum file size 5MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Form Details Card */}
                  <div className="p-5 rounded-[12px] bg-white/80 dark:bg-[#1a1a1c]/80 border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-xs space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#777777] font-mono">
                      Personal Details
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                          First Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="e.g. Rekha"
                          className="w-full px-3.5 py-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] transition-colors shadow-2xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="e.g. Patel"
                          className="w-full px-3.5 py-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] transition-colors shadow-2xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                          Username *
                        </label>
                        <input
                          type="text"
                          required
                          value={username}
                          readOnly
                          placeholder="e.g. rekha.patel"
                          className="w-full px-3 py-2 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] transition-colors cursor-not-allowed opacity-70"
                        />
                        <p className="text-[10px] text-slate-500">Contact administrator to change username</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="user@asopalav.com"
                          className="w-full px-3 py-2 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e] transition-colors"
                        />
                      </div>
                    </div>

                    {/* Role & Assigned Branch Read-only Badges */}
                    <div className="pt-3 border-t border-slate-100 dark:border-[#242424] grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-[#666]">System Role Authority</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-[6px] bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#2e2e2e] text-xs font-mono font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-[#3ecf8e]" />
                            <span>{user?.role_code ? user.role_code.replace(/_/g, ' ') : 'Cashier'}</span>
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-[#666]">Assigned Showroom</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-[6px] bg-slate-100 dark:bg-[#222222] border border-slate-200 dark:border-[#2e2e2e] text-xs font-mono font-semibold text-slate-900 dark:text-white">
                            {activeBranch.branch_name} ({activeBranch.branch_code})
                          </span>
                        </div>
                      </div>
                    </div>

                    {profileError && (
                      <div className="p-3 rounded-[6px] bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-sans flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{profileError}</span>
                      </div>
                    )}

                    {profileSuccess && (
                      <div className="p-3 rounded-[6px] bg-emerald-500/10 border border-[#3ecf8e]/30 text-emerald-700 dark:text-[#3ecf8e] text-xs font-sans flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Profile details saved successfully.</span>
                      </div>
                    )}

                    <div className="pt-3 flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="px-5 py-2.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold font-sans flex items-center gap-2 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                      >
                        {isSavingProfile ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#171717]" />
                        ) : (
                          <Save className="w-4 h-4 text-[#171717]" />
                        )}
                        <span>{isSavingProfile ? 'Saving Changes...' : 'Save Profile Details'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: PASSWORD & 4-DIGIT PIN */}
            {activeTabId === 'security' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <form onSubmit={handleUpdateSecurity} className="border border-slate-200 dark:border-[#242424] rounded-[12px] bg-white dark:bg-[#181818] p-5 shadow-xs space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white font-sans flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#3ecf8e]" />
                      <span>Login Password &amp; Lock PIN</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
                      Update your account login password and the 4-digit numeric PIN used for quick POS lock screen unlock.
                    </p>
                  </div>

                  {/* Current Password Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password to verify identity..."
                        className="w-full px-3 py-2 pr-10 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                      >
                        {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password & Confirmation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                        New Login Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 6 characters..."
                          className="w-full px-3 py-2 pr-10 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat new password..."
                          className="w-full px-3 py-2 pr-10 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4-Digit Quick PIN */}
                  <div className="border-t border-slate-200 dark:border-[#242424] pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#3ecf8e]" />
                        <span>Quick-Switch 4-Digit Lock PIN</span>
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">Used for Screen Lock PIN</span>
                    </div>
                    <input
                      type="password"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 4829"
                      className="w-48 px-3 py-2 rounded-[6px] bg-slate-50 dark:bg-[#141414] border border-slate-300 dark:border-[#2e2e2e] text-sm font-mono text-center tracking-widest text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#3ecf8e]"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-[#777] font-sans">
                      Leave blank to keep your existing PIN. PINs are securely hashed using bcrypt.
                    </p>
                  </div>

                  {securityError && (
                    <div className="p-3 rounded-[6px] bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-sans flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{securityError}</span>
                    </div>
                  )}

                  {securitySuccess && (
                    <div className="p-3 rounded-[6px] bg-emerald-500/10 border border-[#3ecf8e]/30 text-emerald-700 dark:text-[#3ecf8e] text-xs font-sans flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Security credentials and hashed PIN updated successfully.</span>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingSecurity}
                      className="px-5 py-2.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold font-sans flex items-center gap-2 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isUpdatingSecurity ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#171717]" />
                      ) : (
                        <KeyRound className="w-4 h-4 text-[#171717]" />
                      )}
                      <span>{isUpdatingSecurity ? 'Updating Credentials...' : 'Update Security Credentials'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: APPEARANCE & THEMES */}
            {activeTabId === 'theme' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border border-slate-200 dark:border-[#242424] rounded-[12px] bg-white dark:bg-[#181818] p-5 shadow-xs space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white font-sans flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#3ecf8e]" />
                      <span>Showroom Display Theme</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-[#888888] font-sans mt-0.5">
                      Choose your preferred canvas theme. Optimized for all-day cash counter cashier comfort.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Dark Night */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      className={cn(
                        'p-4 rounded-[6px] border text-left space-y-3 transition-all cursor-pointer select-none',
                        theme === 'dark'
                          ? 'border-[#3ecf8e] bg-[#141414] ring-2 ring-[#3ecf8e]/20 shadow-md'
                          : 'border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#151515] opacity-80 hover:opacity-100'
                      )}
                    >
                      <div className="w-full h-16 rounded-[6px] bg-[#141414] border border-[#262626] p-2 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#3ecf8e]" />
                          <span className="w-8 h-1 rounded bg-[#2a2a2a]" />
                        </div>
                        <span className="w-12 h-1 rounded bg-[#2a2a2a]" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                            Dark (Studio Night)
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#777]">
                            #141414 Studio Canvas
                          </div>
                        </div>
                        {theme === 'dark' && <Check className="w-4 h-4 text-[#3ecf8e]" />}
                      </div>
                    </button>

                    {/* Soft Dark Slate */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('soft-dark')}
                      className={cn(
                        'p-4 rounded-[6px] border text-left space-y-3 transition-all cursor-pointer select-none',
                        theme === 'soft-dark'
                          ? 'border-[#3ecf8e] bg-[#181a20] ring-2 ring-[#3ecf8e]/20 shadow-md'
                          : 'border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#151515] opacity-80 hover:opacity-100'
                      )}
                    >
                      <div className="w-full h-16 rounded-[6px] bg-[#181a20] border border-[#2b303c] p-2 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-400" />
                          <span className="w-8 h-1 rounded bg-[#2b303c]" />
                        </div>
                        <span className="w-12 h-1 rounded bg-[#2b303c]" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                            Soft Dark (Charcoal)
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#777]">
                            Gentle contrast slate
                          </div>
                        </div>
                        {theme === 'soft-dark' && <Check className="w-4 h-4 text-[#3ecf8e]" />}
                      </div>
                    </button>

                    {/* Clean Light */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      className={cn(
                        'p-4 rounded-[6px] border text-left space-y-3 transition-all cursor-pointer select-none',
                        theme === 'light'
                          ? 'border-[#3ecf8e] bg-white ring-2 ring-[#3ecf8e]/20 shadow-md'
                          : 'border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#151515] opacity-80 hover:opacity-100'
                      )}
                    >
                      <div className="w-full h-16 rounded-[6px] bg-white border border-slate-200 p-2 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="w-8 h-1 rounded bg-slate-200" />
                        </div>
                        <span className="w-12 h-1 rounded bg-slate-200" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                            Light (Showroom Day)
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#777]">
                            High ambient light
                          </div>
                        </div>
                        {theme === 'light' && <Check className="w-4 h-4 text-[#3ecf8e]" />}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: EMERGENCY SYSTEM OVERRIDES (Super Admin Only) */}
            {activeTabId === 'overrides' && isSuperAdminOrDev && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <SuperAdminOverridesCard />
              </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default ProfileSecurityPage;
