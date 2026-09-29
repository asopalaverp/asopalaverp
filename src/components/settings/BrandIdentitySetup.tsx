import React, { useState, useEffect, useRef } from 'react';
import { useBrandStore, BrandSettings, DEFAULT_BRAND_SETTINGS } from '@/store/brandStore';
import { BrandLogo } from '@/components/icons/BrandLogo';
import { AsopalavLogo } from '@/components/icons/AsopalavLogo';
import { showToast } from '@/components/ui/ToastContainer';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Code,
  Tag,
  Palette,
  Building2,
  FileText,
  Check,
  RotateCcw,
  Download,
  Eye,
  Globe,
  Receipt,
  Smartphone,
  Laptop,
  CheckCircle2,
  Sliders,
  ExternalLink,
  X,
  AlertCircle,
} from 'lucide-react';
import { Kbd } from '@/components/ui/Kbd';

const COLOR_PRESETS = [
  { name: 'Emerald (Supabase DS)', hex: '#3ecf8e' },
  { name: 'Jade Green', hex: '#10b981' },
  { name: 'Sapphire Blue', hex: '#3b82f6' },
  { name: 'Royal Indigo', hex: '#6366f1' },
  { name: 'Amber Gold', hex: '#f59e0b' },
  { name: 'Rose Red', hex: '#f43f5e' },
  { name: 'Slate Night', hex: '#71717a' },
];

export const BrandIdentitySetup: React.FC = () => {
  const brandStore = useBrandStore();
  const [formData, setFormData] = useState<BrandSettings>({
    brandName: brandStore.brandName,
    legalEntityName: brandStore.legalEntityName,
    tagline: brandStore.tagline,
    logoUrl: brandStore.logoUrl,
    logoType: brandStore.logoType,
    brandSvgContent: brandStore.brandSvgContent,
    monogramText: brandStore.monogramText,
    faviconUrl: brandStore.faviconUrl,
    brandAccentColor: brandStore.brandAccentColor,
    gstin: brandStore.gstin,
    panNumber: brandStore.panNumber,
    contactPhone: brandStore.contactPhone,
    contactEmail: brandStore.contactEmail,
    address: brandStore.address,
    city: brandStore.city,
    state: brandStore.state,
  });

  const [activePreviewChannel, setActivePreviewChannel] = useState<'topbar' | 'tab' | 'thermal' | 'login'>('topbar');
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state if store updates externally
  useEffect(() => {
    setFormData({
      brandName: brandStore.brandName,
      legalEntityName: brandStore.legalEntityName,
      tagline: brandStore.tagline,
      logoUrl: brandStore.logoUrl,
      logoType: brandStore.logoType,
      brandSvgContent: brandStore.brandSvgContent,
      monogramText: brandStore.monogramText,
      faviconUrl: brandStore.faviconUrl,
      brandAccentColor: brandStore.brandAccentColor,
      gstin: brandStore.gstin,
      panNumber: brandStore.panNumber,
      contactPhone: brandStore.contactPhone,
      contactEmail: brandStore.contactEmail,
      address: brandStore.address,
      city: brandStore.city,
      state: brandStore.state,
    });
  }, [brandStore]);

  const handleChange = (field: keyof BrandSettings, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isFavicon = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'Image File Too Large',
        message: 'Please select an image file under 2MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      if (isFavicon) {
        setFormData((prev) => ({ ...prev, faviconUrl: dataUri }));
        showToast({
          type: 'info',
          title: 'Favicon Loaded',
          message: 'Favicon ready for saving.',
        });
      } else {
        setFormData((prev) => ({ ...prev, logoUrl: dataUri, logoType: 'image' }));
        showToast({
          type: 'info',
          title: 'Brand Logo Loaded',
          message: 'Logo ready for saving.',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.brandName.trim()) {
      showToast({
        type: 'error',
        title: 'Brand Name Required',
        message: 'Please enter a brand display name.',
      });
      return;
    }
    setIsPreviewOpen(true);
  };

  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      await brandStore.updateBrandSettings(formData);
      setIsPreviewOpen(false);
      showToast({
        type: 'success',
        title: 'Brand Identity Saved',
        message: 'Logo, brand name, and favicon updated across entire workspace.',
      });
    } catch (err) {
      console.error('Failed to save brand settings:', err);
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: 'Could not persist brand settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Reset all brand and identity assets to Asopalav default settings?')) {
      await brandStore.resetToDefaults();
      setFormData(DEFAULT_BRAND_SETTINGS);
      showToast({
        type: 'info',
        title: 'Brand Reset',
        message: 'Default Asopalav branding restored.',
      });
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${formData.brandName.toLowerCase().replace(/\s+/g, '_')}_brand_config.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast({
      type: 'success',
      title: 'Config Exported',
      message: 'Downloaded brand identity JSON backup.',
    });
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* 1. Header Banner & Tools */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[12px] bg-slate-50 dark:bg-[#171717] border border-slate-200 dark:border-[#242424]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-[4px] bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/20 text-[10px] font-mono font-medium">
              BRAND IDENTITY STUDIO
            </span>
            <span className="text-xs font-mono text-slate-400 dark:text-zinc-500">Live Showroom Theming</span>
          </div>
          <h2 className="text-base font-medium text-slate-900 dark:text-white tracking-tight font-sans">
            Brand Name, Logo, Favicon & Company Profile
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Configure how your showroom brand appears on Topbar, Sidebars, Thermal Receipts, Favicons, and Invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#2e2e2e] hover:bg-slate-100 dark:hover:bg-[#202020] text-slate-700 dark:text-zinc-300 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Config</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-[6px] border border-transparent hover:bg-slate-100 dark:hover:bg-[#202020] text-slate-500 dark:text-zinc-400 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleOpenPreview} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Settings & Asset Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card A: Brand Identity Basics */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-2xs space-y-4">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#3ecf8e]" />
              <span>Brand Identity Basics</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 font-sans">
                  Brand Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.brandName}
                  onChange={(e) => handleChange('brandName', e.target.value)}
                  placeholder="e.g. Asopalav"
                  required
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-sans shadow-2xs transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 font-sans">
                  Legal Entity / Company Name
                </label>
                <input
                  type="text"
                  value={formData.legalEntityName}
                  onChange={(e) => handleChange('legalEntityName', e.target.value)}
                  placeholder="e.g. Asopalav Endeavours LLP"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-sans shadow-2xs transition-all"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 font-sans">
                  Tagline / System Slogan
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  placeholder="e.g. Showroom Cash Counter & Expense Management"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 font-sans shadow-2xs transition-all"
                />
              </div>
            </div>
          </div>

          {/* Card B: Logo & Visual Asset Studio */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-2xs space-y-4">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#3ecf8e]" />
              <span>Logo & Visual Assets</span>
            </h3>

            {/* Logo Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Active Logo Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'svg' as const, label: 'Official SVG', desc: 'Diamond Leaf' },
                  { id: 'image' as const, label: 'Image URL / Upload', desc: 'PNG / JPG / WebP' },
                  { id: 'monogram' as const, label: 'Monogram Badge', desc: 'ASI Text Pill' },
                  { id: 'svg_raw' as const, label: 'Custom Raw SVG', desc: 'XML Code' },
                ].map((mode) => {
                  const isChecked =
                    mode.id === 'svg_raw'
                      ? formData.logoType === 'svg' && formData.brandSvgContent.length > 0
                      : formData.logoType === mode.id && (mode.id !== 'svg' || !formData.brandSvgContent);

                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        if (mode.id === 'svg_raw') {
                          setFormData((p) => ({ ...p, logoType: 'svg' }));
                        } else if (mode.id === 'svg') {
                          setFormData((p) => ({ ...p, logoType: 'svg', brandSvgContent: '' }));
                        } else {
                          setFormData((p) => ({ ...p, logoType: mode.id as any }));
                        }
                      }}
                      className={cn(
                        'p-2.5 rounded-[8px] border text-left transition-all cursor-pointer space-y-0.5',
                        isChecked
                          ? 'bg-[#3ecf8e]/10 border-[#3ecf8e] text-slate-900 dark:text-white shadow-2xs'
                          : 'bg-slate-50 dark:bg-[#1c1c1c] border-slate-200 dark:border-[#2a2a2a] text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{mode.label}</span>
                        {isChecked && <Check className="w-3 h-3 text-[#3ecf8e]" />}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500">{mode.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Image mode */}
            {formData.logoType === 'image' && (
              <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                    Logo Image URL or Base64
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.logoUrl}
                      onChange={(e) => handleChange('logoUrl', e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, false)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#282828] text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                    </button>
                  </div>
                </div>

                {formData.logoUrl && (
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-[11px] text-slate-400">Current Preview:</span>
                    <div className="w-10 h-10 p-1 rounded-[6px] bg-slate-200 dark:bg-[#141414] border border-slate-300 dark:border-[#282828] flex items-center justify-center">
                      <img src={formData.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* If Monogram mode */}
            {formData.logoType === 'monogram' && (
              <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Monogram Badge Text (2-3 Chars)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    maxLength={4}
                    value={formData.monogramText}
                    onChange={(e) => handleChange('monogramText', e.target.value.toUpperCase())}
                    placeholder="ASI"
                    className="w-28 h-10 min-h-[40px] px-3 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono font-bold text-slate-900 dark:text-white text-center uppercase focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                  />
                  <div
                    style={{ backgroundColor: formData.brandAccentColor || '#3ecf8e' }}
                    className="w-10 h-10 rounded-[6px] text-[#171717] font-mono font-bold text-xs flex items-center justify-center shadow-2xs"
                  >
                    {formData.monogramText || 'ASI'}
                  </div>
                </div>
              </div>
            )}

            {/* If Custom Raw SVG mode */}
            {formData.logoType === 'svg' && (
              <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2e2e2e] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 font-mono">
                    Custom SVG XML Code (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400">Leave blank for default Diamond Leaf</span>
                </div>
                <textarea
                  rows={3}
                  value={formData.brandSvgContent}
                  onChange={(e) => handleChange('brandSvgContent', e.target.value)}
                  placeholder="<svg viewBox='0 0 32 32'>...</svg>"
                  className="w-full p-3 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>
            )}

            {/* Favicon Setup */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#242424] space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Browser Favicon (`.ico` / `.svg` / `.png`)</span>
                </label>
                <span className="text-[10px] text-slate-400">Auto-generates dynamic SVG if empty</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.faviconUrl}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder="Favicon URL or upload custom icon"
                  className="flex-1 h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, true)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  className="h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#282828] text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Favicon</span>
                </button>
              </div>
            </div>

            {/* Brand Accent Color */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#242424] space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Brand Accent Color</span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = formData.brandAccentColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => handleChange('brandAccentColor', preset.hex)}
                      className={cn(
                        'px-2.5 py-1 rounded-[5px] text-[11px] font-sans border transition-all cursor-pointer flex items-center gap-1.5',
                        isSelected
                          ? 'border-slate-800 dark:border-white bg-slate-100 dark:bg-[#242424] font-medium'
                          : 'border-slate-200 dark:border-[#2e2e2e] hover:border-slate-300'
                      )}
                    >
                      <span
                        style={{ backgroundColor: preset.hex }}
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-2xs"
                      />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}

                <input
                  type="color"
                  value={formData.brandAccentColor}
                  onChange={(e) => handleChange('brandAccentColor', e.target.value)}
                  className="w-8 h-7 rounded-[4px] border border-slate-300 dark:border-[#2e2e2e] cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Card C: Legal & Tax Compliance Profile */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-2xs space-y-4">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#3ecf8e]" />
              <span>Tax & Showroom Contact Profile</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                  GSTIN (Goods & Service Tax)
                </label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                  placeholder="24ABVFA8046N1ZQ"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white uppercase focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={formData.panNumber}
                  onChange={(e) => handleChange('panNumber', e.target.value.toUpperCase())}
                  placeholder="ABVFA8046N"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white uppercase focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                  Accounts Support Phone
                </label>
                <input
                  type="text"
                  value={formData.contactPhone}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  placeholder="+91 9925009050"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                  Accounts Email Address
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  placeholder="satellite@asopalav.com"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                  Registered Showroom Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Asopalav House, Satellite Road..."
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Submit Action Bar */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-[6px] bg-[#3ecf8e] text-[#171717] hover:bg-[#34b27b] text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm font-sans"
            >
              <Check className="w-4 h-4 text-[#171717] stroke-[3]" />
              <span>{isSaving ? 'Updating Brand...' : 'Save & Publish Brand Identity'}</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Omni-Channel Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#171717] border border-slate-200 dark:border-[#262626] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#242424] pb-3">
              <span className="text-xs font-medium text-slate-900 dark:text-white flex items-center gap-1.5 font-sans">
                <Eye className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Live Brand Simulator</span>
              </span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'topbar' as const, label: 'Topbar' },
                  { id: 'tab' as const, label: 'Tab' },
                  { id: 'thermal' as const, label: 'Slip' },
                  { id: 'login' as const, label: 'Login' },
                ].map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActivePreviewChannel(ch.id)}
                    className={cn(
                      'px-2 py-0.5 rounded-[4px] text-[10px] font-mono transition-colors cursor-pointer',
                      activePreviewChannel === ch.id
                        ? 'bg-[#3ecf8e] text-[#171717] font-medium'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 1. Topbar Simulation */}
            {activePreviewChannel === 'topbar' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 block">
                  Topbar Header Appearance
                </span>
                <div className="p-3 rounded-[8px] bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#282828] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BrandLogo size={20} />
                    <span className="text-xs font-medium text-slate-900 dark:text-white font-sans">
                      {formData.brandName}
                    </span>
                    <span className="text-slate-300 dark:text-[#333333]">/</span>
                    <span className="px-1.5 py-0.2 rounded-[3px] bg-slate-200 dark:bg-[#202020] text-[10px] font-mono text-[#3ecf8e]">
                      {formData.monogramText || 'ASI'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Till: ₹0.00</span>
                </div>
              </div>
            )}

            {/* 2. Browser Tab & Favicon Simulation */}
            {activePreviewChannel === 'tab' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 block">
                  Browser Tab Title & Favicon
                </span>
                <div className="p-2.5 rounded-[8px] bg-slate-200 dark:bg-[#222222] border border-slate-300 dark:border-[#2e2e2e]">
                  <div className="max-w-[200px] px-3 py-1.5 rounded-t-[6px] bg-white dark:bg-[#141414] border-t border-x border-slate-300 dark:border-[#282828] flex items-center gap-2 shadow-2xs">
                    <div
                      style={{ backgroundColor: formData.brandAccentColor || '#3ecf8e' }}
                      className="w-3 h-3 rounded-[2px] shrink-0"
                    />
                    <span className="text-[11px] font-medium text-slate-900 dark:text-white truncate font-sans">
                      {formData.brandName} ERP • Showroom
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Thermal Receipt Slip Simulation */}
            {activePreviewChannel === 'thermal' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 block">
                  80mm POS Thermal Slip Header
                </span>
                <div className="p-4 rounded-[8px] bg-white dark:bg-white text-black font-mono text-[11px] space-y-1.5 text-center border border-slate-200 shadow-xs">
                  <p className="font-bold text-sm tracking-wider uppercase">{formData.brandName}</p>
                  <p className="text-[9px] uppercase">{formData.legalEntityName}</p>
                  <p className="text-[9px] text-slate-600">{formData.address}</p>
                  <p className="text-[9px]">GSTIN: {formData.gstin}</p>
                  <div className="border-b border-dashed border-black my-1" />
                  <p className="text-left font-bold">EXPENSE VOUCHER #ASI-0001</p>
                  <div className="flex justify-between">
                    <span>Total Paid:</span>
                    <span className="font-bold">₹1,500.00</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Login Portal Card Simulation */}
            {activePreviewChannel === 'login' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 block">
                  Login Screen Identity Banner
                </span>
                <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] text-center space-y-2">
                  <BrandLogo size={32} className="mx-auto" />
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white">{formData.brandName}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">{formData.tagline}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Brand Diagnostic Token Trace */}
            <div className="p-3 rounded-[8px] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] text-[10px] font-mono space-y-1 text-slate-500 dark:text-zinc-400">
              <div className="flex justify-between">
                <span>Active Monogram:</span>
                <span className="text-slate-800 dark:text-zinc-200">{formData.monogramText || 'ASI'}</span>
              </div>
              <div className="flex justify-between">
                <span>Accent Hex:</span>
                <span className="text-[#3ecf8e]">{formData.brandAccentColor}</span>
              </div>
              <div className="flex justify-between">
                <span>Favicon Source:</span>
                <span className="text-slate-800 dark:text-zinc-200">{formData.faviconUrl ? 'Custom' : 'Dynamic SVG'}</span>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ========================================================================= */}
      {/* PRE-COMMIT CONFIRMATION PREVIEW MODAL                                     */}
      {/* ========================================================================= */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[8px] bg-emerald-500/10 border border-[#3ecf8e]/30 flex items-center justify-center text-[#3ecf8e] shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                  Confirm Brand Identity Update
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#888888]">
                  Please verify showroom branding details before publishing system-wide.
                </p>
              </div>
            </div>

            {/* Verification Slip */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] space-y-2.5 font-sans text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Brand Name:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formData.brandName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Legal Entity:</span>
                <span className="text-slate-800 dark:text-zinc-200">{formData.legalEntityName || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Logo Mode:</span>
                <span className="font-mono text-slate-800 dark:text-zinc-200 uppercase">{formData.logoType}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Accent Color:</span>
                <div className="flex items-center gap-2">
                  <span
                    style={{ backgroundColor: formData.brandAccentColor }}
                    className="w-3 h-3 rounded-full inline-block"
                  />
                  <span className="font-mono text-slate-800 dark:text-zinc-200">{formData.brandAccentColor}</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">GSTIN / PAN:</span>
                <span className="font-mono text-slate-800 dark:text-zinc-200">
                  {formData.gstin || '—'} / {formData.panNumber || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Contact Phone:</span>
                <span className="text-slate-800 dark:text-zinc-200">{formData.contactPhone || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 dark:text-[#888888]">Address:</span>
                <span className="text-slate-800 dark:text-zinc-200 max-w-[240px] truncate text-right">
                  {formData.address || '—'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#242424]">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-[6px] border border-slate-300 dark:border-[#333] text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] transition-colors cursor-pointer"
              >
                Back &amp; Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="px-5 py-2 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>{isSaving ? 'Updating...' : 'Confirm & Publish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandIdentitySetup;
