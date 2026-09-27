import React, { useState, useRef } from 'react';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';
import { useUIStore } from '@/store/uiStore';
import { UploadCloud, X, Loader2, Eye, Camera, Plus, Image as ImageIcon } from 'lucide-react';
import { triggerHaptic, cn } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';

interface BillUploaderProps {
  photoUrls: string[];
  onChange: (urls: string[]) => void;
  maxPhotos?: number;
}

export const BillUploader: React.FC<BillUploaderProps> = ({
  photoUrls = [],
  onChange,
  maxPhotos = 4,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { openLightbox } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = async (filesList: FileList | File[]) => {
    const files = Array.from(filesList);
    if (!files || files.length === 0) return;
    setUploadError(null);

    if (photoUrls.length + files.length > maxPhotos) {
      const msg = `Maximum of ${maxPhotos} photos allowed per voucher.`;
      setUploadError(msg);
      showToast({
        type: 'error',
        title: 'Limit Exceeded',
        message: msg,
      });
      return;
    }

    const ALLOWED_BILL_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    for (const file of files) {
      if (file.type && !ALLOWED_BILL_MIMES.includes(file.type.toLowerCase())) {
        const msg = 'Only JPG, PNG, WebP, or HEIC images are allowed for bill uploads.';
        setUploadError(msg);
        showToast({
          type: 'error',
          title: 'Invalid File Type',
          message: msg,
        });
        return;
      }
    }

    const toastId = `bill-upload-${Date.now()}`;
    setUploading(true);
    triggerHaptic('light');
    showToast({
      id: toastId,
      type: 'loading',
      title: 'Uploading Attachment',
      message: `Uploading ${files.length} receipt photo(s)...`,
      durationMs: 6000,
    });

    try {
      const uploadPromises = files.map(async (file) => {
        try {
          const cloudUrl = await uploadToR2(file, 'receipts', file.name);
          if (cloudUrl && cloudUrl.trim()) return cloudUrl;
        } catch (r2Err) {
          console.warn('R2 direct upload error, generating local preview:', r2Err);
        }
        // Fallback: Read as Data URL to guarantee user sees preview without crash
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      });

      const results = await Promise.all(uploadPromises);
      const validUrls = results.filter((u) => Boolean(u && u.trim()));

      if (validUrls.length > 0) {
        onChange([...photoUrls, ...validUrls]);
        triggerHaptic('success');
        showToast({
          id: toastId,
          type: 'success',
          title: 'Bill Attached',
          message: `Added ${validUrls.length} receipt image(s) to bill.`,
        });
      } else {
        const errMsg = 'Could not read receipt file. Please check file permissions and try again.';
        setUploadError(errMsg);
        triggerHaptic('error');
        showToast({
          id: toastId,
          type: 'error',
          title: 'Upload Failed',
          message: errMsg,
        });
      }
    } catch (err: any) {
      console.error('Upload processing error:', err);
      const errMsg = 'Failed to upload receipt: ' + (err.message || 'Unknown error');
      setUploadError(errMsg);
      triggerHaptic('error');
      showToast({
        id: toastId,
        type: 'error',
        title: 'Upload Failed',
        message: errMsg,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = async (index: number) => {
    triggerHaptic('light');
    const urlToRemove = photoUrls[index];
    onChange(photoUrls.filter((_, idx) => idx !== index));

    showToast({
      type: 'info',
      title: 'Photo Removed',
      message: 'Receipt photo removed from voucher.',
    });

    if (urlToRemove && !urlToRemove.startsWith('data:')) {
      try {
        await deleteFromR2(urlToRemove);
      } catch (e) {
        console.warn('Background R2 delete notice:', e);
      }
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {uploadError && (
        <div className="p-3 rounded-[12px] bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium font-sans flex items-center justify-between">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thumbnails + Inline Add Tile Strip */}
      {photoUrls.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          {photoUrls.map((url, idx) => (
            <div
              key={idx}
              className="relative group rounded-[12px] overflow-hidden bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 w-28 h-24 flex items-center justify-center shadow-xs"
            >
              <img
                src={url}
                alt={`Receipt #${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
                <button
                  type="button"
                  onClick={() => openLightbox(url)}
                  className="p-1.5 rounded-[8px] bg-white/90 dark:bg-white/20 text-slate-900 dark:text-white border border-slate-200/80 dark:border-white/10 hover:border-[#3ecf8e] cursor-pointer shadow-xs ios-press"
                  title="View Full Size"
                >
                  <Eye className="w-3.5 h-3.5 text-[#3ecf8e]" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1.5 rounded-[8px] bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs ios-press"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Inline Add More Button if limit not reached */}
          {photoUrls.length < maxPhotos && (
            <div className="flex items-center gap-2">
              <label className="w-28 h-24 rounded-[12px] border-2 border-dashed border-slate-300 dark:border-white/20 hover:border-[#3ecf8e] dark:hover:border-[#3ecf8e] bg-slate-50/60 dark:bg-white/5 hover:bg-emerald-500/5 dark:hover:bg-[#3ecf8e]/5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-slate-600 dark:text-[#A1A1A1] hover:text-emerald-700 dark:hover:text-[#3ecf8e] ios-press">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <Plus className="w-4 h-4 text-[#3ecf8e] stroke-[2.5]" />
                <span className="text-[11px] font-semibold font-sans">Add Photo</span>
              </label>

              <label className="h-24 px-3.5 rounded-[12px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors text-slate-700 dark:text-[#A1A1A1] ios-press">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <Camera className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
                <span className="text-[10px] font-semibold">Camera</span>
              </label>
            </div>
          )}
        </div>
      ) : (
        /* Empty State: iOS 16 Interactive Dropzone Box */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'rounded-[16px] border-2 border-dashed p-5 text-center transition-all ios-card',
            isDragOver
              ? 'border-[#3ecf8e] bg-emerald-500/10 dark:bg-[#3ecf8e]/10 scale-[1.01]'
              : 'border-slate-300/80 dark:border-white/15 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/60 dark:bg-white/5'
          )}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center border border-emerald-500/20 shrink-0 shadow-xs">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200 font-sans">
                  Attach Photo of Receipt / Bill Slip
                </p>
                <p className="text-[11px] text-slate-400 dark:text-[#8E8E93] font-sans">
                  Drag and drop files here, or tap Camera / Upload (up to {maxPhotos} receipts)
                </p>
              </div>
            </div>

            {/* Quick Upload Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/15 text-slate-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer transition-colors shadow-xs ios-press">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3ecf8e]" />
                <span>Camera</span>
              </label>

              <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/15 text-slate-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer transition-colors shadow-xs ios-press">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <ImageIcon className="w-3.5 h-3.5 text-slate-400 dark:text-[#A1A1A1]" />
                <span>Choose Files</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 py-1 text-xs font-mono text-emerald-700 dark:text-[#3ecf8e] font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Attaching receipt to bill...</span>
        </div>
      )}
    </div>
  );
};
