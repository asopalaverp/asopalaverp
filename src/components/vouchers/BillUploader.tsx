import React, { useState } from 'react';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';
import { useUIStore } from '@/store/uiStore';
import { UploadCloud, X, Loader2, Eye, Camera, Plus, Image as ImageIcon } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils';
import { showToast } from '@/components/ui/ToastContainer';

interface BillUploaderProps {
  photoUrls: string[];
  onChange: (urls: string[]) => void;
  maxPhotos?: number;
}

export const BillUploader: React.FC<BillUploaderProps> = ({
  photoUrls,
  onChange,
  maxPhotos = 4,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { openLightbox } = useUIStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);

    if (photoUrls.length + files.length > maxPhotos) {
      const msg = `Maximum of ${maxPhotos} photos allowed.`;
      setUploadError(msg);
      showToast({
        type: 'error',
        title: 'Limit Exceeded',
        message: msg,
      });
      return;
    }

    const ALLOWED_BILL_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    for (let i = 0; i < files.length; i++) {
      if (!ALLOWED_BILL_MIMES.includes(files[i].type)) {
        const msg = 'Only JPEG, PNG, and WebP images are allowed for bill uploads.';
        setUploadError(msg);
        showToast({
          type: 'error',
          title: 'Invalid File Type',
          message: msg,
        });
        e.target.value = '';
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
      const uploadPromises = Array.from(files).map((file) =>
        uploadToR2(file, 'receipts', file.name)
      );
      const results = await Promise.all(uploadPromises);
      const validUrls = results.filter((u) => Boolean(u && u.trim()));
      if (validUrls.length > 0) {
        onChange([...photoUrls, ...validUrls]);
        triggerHaptic('success');
        showToast({
          id: toastId,
          type: 'success',
          title: 'Bill Uploaded',
          message: `Added ${validUrls.length} receipt image(s) to bill.`,
        });
      } else {
        const errMsg = 'Cloudflare R2 upload failed. Please verify your R2 Access Key & Secret Key.';
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
      e.target.value = '';
    }
  };

  const handleRemove = async (index: number) => {
    triggerHaptic('light');
    const urlToRemove = photoUrls[index];
    onChange(photoUrls.filter((_, idx) => idx !== index));

    showToast({
      type: 'info',
      title: 'Photo Removed',
      message: 'Receipt photo removed and deleted from cloud storage.',
    });

    if (urlToRemove) {
      try {
        await deleteFromR2(urlToRemove);
      } catch (e) {
        console.warn('Background R2 delete notice:', e);
      }
    }
  };

  return (
    <div className="space-y-2.5 font-sans">
      {uploadError && (
        <p className="p-2.5 rounded-[6px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-medium font-sans">
          {uploadError}
        </p>
      )}

      {/* Thumbnails + Inline Add Tile Strip */}
      {photoUrls.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          {photoUrls.map((url, idx) => (
            <div
              key={idx}
              className="relative group rounded-[8px] overflow-hidden bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2e2e2e] w-28 h-24 flex items-center justify-center shadow-xs"
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
                  className="p-1.5 rounded-[5px] bg-white dark:bg-[#242424] text-slate-900 dark:text-white border border-slate-300 dark:border-[#383838] hover:border-[#3ecf8e] cursor-pointer shadow-xs"
                  title="View Full Size"
                >
                  <Eye className="w-3.5 h-3.5 text-[#3ecf8e]" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1.5 rounded-[5px] bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
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
              <label className="w-28 h-24 rounded-[8px] border-2 border-dashed border-slate-300 dark:border-[#333] hover:border-[#3ecf8e] dark:hover:border-[#3ecf8e] bg-slate-50/60 dark:bg-[#161616] hover:bg-emerald-500/5 dark:hover:bg-[#3ecf8e]/5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-slate-600 dark:text-zinc-400 hover:text-emerald-700 dark:hover:text-[#3ecf8e]">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <Plus className="w-4 h-4 text-[#3ecf8e] stroke-[2.5]" />
                <span className="text-[10.5px] font-medium font-sans">Add Photo</span>
              </label>

              <label className="h-24 px-3 rounded-[8px] border border-slate-200 dark:border-[#2e2e2e] bg-slate-50/50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#222222] flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-slate-700 dark:text-zinc-300">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <Camera className="w-4 h-4 text-emerald-600 dark:text-[#3ecf8e]" />
                <span className="text-[10px] font-medium">Camera</span>
              </label>
            </div>
          )}
        </div>
      ) : (
        /* Empty State: Slim Sleek Dropzone */
        <div className="rounded-[8px] border-2 border-dashed border-slate-200 dark:border-[#2a2a2a] hover:border-slate-300 dark:hover:border-[#3a3a3a] bg-slate-50/40 dark:bg-[#161616] p-4 text-center transition-colors">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-[#3ecf8e] flex items-center justify-center border border-emerald-500/20 shrink-0">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200 font-sans">
                  Attach Photo of Receipt / Bill Slip
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-sans">
                  Snap with camera or upload file (up to 4 receipts)
                </p>
              </div>
            </div>

            {/* Quick Upload Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] hover:bg-slate-50 dark:hover:bg-[#282828] text-slate-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition-colors shadow-2xs">
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

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#202020] hover:bg-slate-50 dark:hover:bg-[#282828] text-slate-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition-colors shadow-2xs">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
                <ImageIcon className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                <span>Upload File</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 py-1 text-xs font-mono text-emerald-700 dark:text-[#3ecf8e] font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Uploading receipt to cloud...</span>
        </div>
      )}
    </div>
  );
};
