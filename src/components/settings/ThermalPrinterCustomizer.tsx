import React, { useState } from 'react';
import { usePrintConfigStore, PrintConfig, DEFAULT_PRINT_CONFIG } from '@/store/printConfigStore';
import { ThermalReceiptSlip } from '@/components/ui/ThermalReceiptSlip';
import { showToast } from '@/components/ui/ToastContainer';
import { cn } from '@/lib/utils';
import {
  Printer,
  RotateCcw,
  Check,
  Save,
  FileText,
  Sliders,
  Store,
  ShieldCheck,
  Sparkles,
  QrCode,
  Copy,
  X,
} from 'lucide-react';

export const ThermalPrinterCustomizer: React.FC = () => {
  const { config, updateConfig, resetConfig } = usePrintConfigStore();
  const [formData, setFormData] = useState<PrintConfig>({ ...config });
  const [isSaved, setIsSaved] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleChange = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    const updated = { ...formData, [key]: value };
    setFormData(updated);
    setIsSaved(false);
  };

  const handleOpenPreview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsPreviewOpen(true);
  };

  const handleConfirmSave = () => {
    updateConfig(formData);
    setIsPreviewOpen(false);
    setIsSaved(true);
    showToast({
      type: 'success',
      title: 'Print Configuration Saved',
      message: 'Showroom thermal printer layout settings updated.',
    });
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleReset = () => {
    resetConfig();
    setFormData({ ...DEFAULT_PRINT_CONFIG });
    showToast({
      type: 'info',
      title: 'Settings Reset',
      message: 'Restored standard Asopalav 80mm ESC/POS template.',
    });
  };

  const handleTestPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-[12px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#242424]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-emerald-500/10 border border-[#3ecf8e]/30 flex items-center justify-center text-[#3ecf8e]">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white font-sans flex items-center gap-2">
              <span>ESC/POS Thermal Slip Layout Customizer</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] text-[10px] font-mono">
                {formData.paperWidth}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#888888] font-sans">
              Configure receipt paper width, GSTIN, legal entity headers, copy counts, and footers for cash counter printers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#333] text-slate-600 dark:text-[#999] hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-medium font-sans flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            className="px-3 py-1.5 rounded-[6px] border border-slate-300 dark:border-[#333] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-medium font-sans flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Test Print</span>
          </button>

          <button
            type="button"
            onClick={handleOpenPreview}
            className="px-4 py-1.5 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold font-sans flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Dual Column Layout: Left Controls, Right Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls (7 Columns) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Paper Width & Format */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#242424] shadow-xs space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white font-mono flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>1. Paper Width &amp; Copy Format</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 80mm Standard POS */}
              <button
                type="button"
                onClick={() => handleChange('paperWidth', '80mm')}
                className={cn(
                  'p-3.5 rounded-[8px] border text-left transition-all cursor-pointer select-none space-y-1',
                  formData.paperWidth === '80mm'
                    ? 'border-[#3ecf8e] bg-[#3ecf8e]/5 ring-1 ring-[#3ecf8e]'
                    : 'border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#151515] opacity-80 hover:opacity-100'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                    80mm Standard POS
                  </span>
                  {formData.paperWidth === '80mm' && <Check className="w-4 h-4 text-[#3ecf8e]" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#777]">
                  Standard showroom counter thermal receipt printers (EPSON, TVS, Citizen).
                </p>
              </button>

              {/* 58mm Mobile Thermal */}
              <button
                type="button"
                onClick={() => handleChange('paperWidth', '58mm')}
                className={cn(
                  'p-3.5 rounded-[8px] border text-left transition-all cursor-pointer select-none space-y-1',
                  formData.paperWidth === '58mm'
                    ? 'border-[#3ecf8e] bg-[#3ecf8e]/5 ring-1 ring-[#3ecf8e]'
                    : 'border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#151515] opacity-80 hover:opacity-100'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white font-sans">
                    58mm Compact Thermal
                  </span>
                  {formData.paperWidth === '58mm' && <Check className="w-4 h-4 text-[#3ecf8e]" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#777]">
                  Compact wireless Bluetooth POS and mobile receipt slip roll printers.
                </p>
              </button>
            </div>

            {/* Copies Count */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-[#262626]">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                  Print Slip Copies
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#777]">
                  Print 1 slip for records or 2 slips (Cashier copy + Receiver signature copy).
                </p>
              </div>
              <div className="flex items-center gap-1.5 p-1 rounded-[6px] bg-slate-100 dark:bg-[#202020] border border-slate-200 dark:border-[#2e2e2e]">
                <button
                  type="button"
                  onClick={() => handleChange('copiesCount', 1)}
                  className={cn(
                    'px-3 py-1 rounded-[4px] text-xs font-medium font-mono transition-colors cursor-pointer',
                    formData.copiesCount === 1
                      ? 'bg-[#3ecf8e] text-[#171717] font-semibold'
                      : 'text-slate-600 dark:text-[#999]'
                  )}
                >
                  1 Copy
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('copiesCount', 2)}
                  className={cn(
                    'px-3 py-1 rounded-[4px] text-xs font-medium font-mono transition-colors cursor-pointer',
                    formData.copiesCount === 2
                      ? 'bg-[#3ecf8e] text-[#171717] font-semibold'
                      : 'text-slate-600 dark:text-[#999]'
                  )}
                >
                  2 Copies
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Legal Header & Entity */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#242424] shadow-xs space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white font-mono flex items-center gap-2">
              <Store className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>2. Legal Entity &amp; Store Identification</span>
            </h3>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                  Store Title on Slip
                </label>
                <input
                  type="text"
                  value={formData.storeTitle}
                  onChange={(e) => handleChange('storeTitle', e.target.value)}
                  placeholder="e.g. Asopalav Silk & Sarees"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                  Legal LLP Entity Name
                </label>
                <input
                  type="text"
                  value={formData.legalEntityName}
                  onChange={(e) => handleChange('legalEntityName', e.target.value)}
                  placeholder="e.g. Asopalav Endeavours LLP"
                  className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                    GSTIN Number
                  </label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                    placeholder="24ABVFA8046N1ZQ"
                    className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={formData.panNumber}
                    onChange={(e) => handleChange('panNumber', e.target.value.toUpperCase())}
                    placeholder="ABVFA8046N"
                    className="w-full h-10 min-h-[40px] px-3.5 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showGstin}
                    onChange={(e) => handleChange('showGstin', e.target.checked)}
                    className="rounded text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Print GSTIN on slip header</span>
                </label>

                <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showPhone}
                    onChange={(e) => handleChange('showPhone', e.target.checked)}
                    className="rounded text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Print store contact telephone</span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: Audit & Footer Customization */}
          <div className="p-5 rounded-[12px] bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#242424] shadow-xs space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white font-mono flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>3. Verification Stamp &amp; Custom Footer</span>
            </h3>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-[#c2c2c2] font-sans">
                  Custom Receipt Footer Text
                </label>
                <textarea
                  rows={2}
                  value={formData.customFooterNote}
                  onChange={(e) => handleChange('customFooterNote', e.target.value)}
                  placeholder="e.g. Thank You • Computer Generated Cash Voucher"
                  className="w-full p-3 rounded-[6px] bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] text-xs font-sans text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#707070] focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/30 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showStamp}
                    onChange={(e) => handleChange('showStamp', e.target.checked)}
                    className="rounded text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Render PAID / APPROVED Stamp</span>
                </label>

                <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showDoubleEntry}
                    onChange={(e) => handleChange('showDoubleEntry', e.target.checked)}
                    className="rounded text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Print DR/CR Double-Entry lines</span>
                </label>

                <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showQrVerification}
                    onChange={(e) => handleChange('showQrVerification', e.target.checked)}
                    className="rounded text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Print SHA-256 Audit Verification tag</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Thermal Slip Preview (5 Columns) */}
        <div className="lg:col-span-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between px-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Live Thermal Slip Preview</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#222] text-slate-500">
              Interactive
            </span>
          </div>

          <div className="p-6 rounded-[14px] bg-slate-100 dark:bg-[#0e0e0e] border border-slate-200 dark:border-[#262626] w-full flex justify-center shadow-inner">
            <ThermalReceiptSlip
              data={{
                title: 'Showroom Cash Voucher',
                storeName: formData.storeTitle,
                storeCode: 'ASI',
                storeCity: 'Ahmedabad',
                referenceNo: 'ASI-2026-0842',
                cashierName: 'Rahul Joshi',
                walletType: 'Physical_Cash',
                totalAmount: 1850,
                inWords: 'One Thousand Eight Hundred Fifty Rupees Only',
                items: [
                  { label: 'Paid To:', value: 'Rameshwar Courier Services', isBold: true },
                  { label: 'Category:', value: 'Customer Saree Courier' },
                  { label: 'Department:', value: 'Bridal Saree & Lehengas' },
                  { label: 'Courier Memo #:', value: 'RC-992014' },
                ],
                doubleEntry: {
                  dr: 'Customer Courier A/C',
                  cr: 'Cash Drawer Till A/C',
                },
                stampText: 'PAID',
                stampVariant: 'approved',
              }}
              onPrint={handleTestPrint}
            />
          </div>
        </div>
      </div>

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
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-sans">
                  Confirm Thermal Printer Settings
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#888888]">
                  Please verify thermal slip print configuration before saving.
                </p>
              </div>
            </div>

            {/* Verification Slip */}
            <div className="p-4 rounded-[8px] bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] space-y-2.5 font-sans text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Paper Roll Width:</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">{formData.paperWidth}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Copies Printed:</span>
                <span className="font-mono text-slate-800 dark:text-zinc-200">{formData.copiesCount} Copy ({formData.copiesCount === 1 ? 'Office record' : 'Cashier + Receiver copies'})</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Store Header Title:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formData.storeTitle}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">Legal Entity Name:</span>
                <span className="text-slate-800 dark:text-zinc-200">{formData.legalEntityName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-[#202020]">
                <span className="text-slate-500 dark:text-[#888888]">GSTIN / PAN:</span>
                <span className="font-mono text-slate-800 dark:text-zinc-200">
                  {formData.gstin || '—'} / {formData.panNumber || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 dark:text-[#888888]">Slip Features:</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[240px]">
                  {formData.showGstin && <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] text-[10px] font-mono">GST Header</span>}
                  {formData.showStamp && <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] text-[10px] font-mono">PAID Stamp</span>}
                  {formData.showDoubleEntry && <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] text-[10px] font-mono">DR/CR Lines</span>}
                  {formData.showQrVerification && <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] text-[10px] font-mono">QR Audit</span>}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#242424]">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-[6px] border border-slate-300 dark:border-[#333] text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#222] transition-colors cursor-pointer"
              >
                Back &amp; Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2 rounded-[6px] bg-[#3ecf8e] hover:bg-[#24b47e] text-[#171717] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Confirm &amp; Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThermalPrinterCustomizer;
