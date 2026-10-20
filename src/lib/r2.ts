/**
 * ==============================================================================
 * ASOPALAV ERP — SECURE CLOUD STORAGE GATEWAY (Zero Browser Secrets)
 * ==============================================================================
 * All file uploads and deletions are routed either directly through Supabase Storage
 * (using public anonymous keys with Row-Level Security policies) or through the
 * Supabase Edge Function gateway ('r2-storage') where S3/R2 credentials remain
 * strictly server-side.
 *
 * NO AWS/R2 ACCESS KEY OR SECRET ACCESS KEY IS EVER EXPOSED TO CLIENT BROWSERS.
 * ==============================================================================
 */

import { supabase } from '@/lib/supabase';
import { getStoredCloudConfig } from '@/store/cloudConfigStore';

// Safe public configuration (No secret keys)
const getPublicConfig = () => {
  const current = getStoredCloudConfig();
  return {
    bucketName: current.r2BucketName || import.meta.env.VITE_R2_BUCKET_NAME || 'asopalav-erp-media',
    publicDomain: current.r2PublicDomain || import.meta.env.VITE_R2_PUBLIC_DOMAIN || '',
  };
};

// Backwards-compatible stubs for any dynamic consumers
export const s3Client = null;
export const reinitializeR2 = () => null;

/**
 * Compresses an image client-side to an optimized WebP / JPEG Blob to save bandwidth and storage.
 */
export async function compressImageToBlob(
  file: File | Blob,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.80
): Promise<{ blob: Blob; contentType: string; ext: string }> {
  // If not an image (e.g. PDF), return original
  if (file.type && !file.type.startsWith('image/')) {
    return {
      blob: file,
      contentType: file.type || 'application/octet-stream',
      ext: file instanceof File ? file.name.split('.').pop() || 'bin' : 'bin',
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            maxHeight = height;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ blob, contentType: 'image/webp', ext: 'webp' });
              } else {
                canvas.toBlob(
                  (jpegBlob) => {
                    resolve({
                      blob: jpegBlob || file,
                      contentType: 'image/jpeg',
                      ext: 'jpg',
                    });
                  },
                  'image/jpeg',
                  quality
                );
              }
            },
            'image/webp',
            quality
          );
        } else {
          resolve({ blob: file, contentType: file.type || 'image/jpeg', ext: 'jpg' });
        }
      };
      img.onerror = () => resolve({ blob: file, contentType: file.type || 'image/jpeg', ext: 'jpg' });
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve({ blob: file, contentType: file.type || 'image/jpeg', ext: 'jpg' });
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a file with automatic client-side compression and zero secret exposure.
 * Upload routes through:
 *  1. Supabase Storage (primary zero-secret storage bucket 'receipts')
 *  2. Supabase Edge Function 'r2-storage' (pre-signed server URL gateway)
 *  3. Local object URL fallback (offline / demo resilience)
 */
export async function uploadToR2(
  file: File | Blob | Uint8Array,
  folder: 'receipts' | 'signatures' | 'avatars' = 'receipts',
  fileName?: string
): Promise<string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const randomStr = Math.random().toString(36).substring(2, 6);

  try {
    let uploadBlob: Blob;
    let contentType = 'image/webp';
    let fileExt = 'webp';

    if (file instanceof File || file instanceof Blob) {
      // 1. Compress image before uploading to reduce storage consumption
      const compressed = await compressImageToBlob(file, 1600, 1600, 0.80);
      contentType = compressed.contentType;
      fileExt = compressed.ext;
      uploadBlob = compressed.blob;
    } else {
      uploadBlob = new Blob([file as BlobPart], { type: 'image/webp' });
      fileExt = fileName ? fileName.split('.').pop() || 'webp' : 'webp';
    }

    const safeKey = `${folder}/${year}-${month}/${folder}_${day}-${month}-${year}_${hours}-${minutes}-${seconds}_${randomStr}.${fileExt}`;

    // 2. Direct Supabase Storage (Primary - Zero secrets required in client bundle)
    try {
      const { data: supaUpload, error: supaErr } = await supabase.storage
        .from('receipts')
        .upload(safeKey, uploadBlob, { contentType, upsert: true });

      if (!supaErr && supaUpload?.path) {
        const { data: pubData } = supabase.storage.from('receipts').getPublicUrl(supaUpload.path);
        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      }
    } catch {
      // Fall through to Edge Function or preview
    }

    // 3. Supabase Edge Function Pre-Signed URL (Server-side R2 Gateway)
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('r2-storage', {
        body: {
          action: 'get-upload-url',
          folder,
          contentType,
          fileName: fileName || `upload.${fileExt}`,
        },
      });

      if (!edgeError && edgeData?.uploadUrl && edgeData?.publicUrl) {
        const presignedPut = await fetch(edgeData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: uploadBlob,
        });

        if (presignedPut.ok) {
          return edgeData.publicUrl;
        }
      }
    } catch {
      // Fall through to local preview
    }

    // 4. Local Object URL Fallback for Offline / Dev / Demo
    if (typeof window !== 'undefined' && (file instanceof File || file instanceof Blob)) {
      return URL.createObjectURL(file);
    }

    const { publicDomain } = getPublicConfig();
    return publicDomain ? `${publicDomain}/${safeKey}` : '';
  } catch (err) {
    console.warn('Storage upload encountered an issue:', err);
    if (typeof window !== 'undefined' && (file instanceof File || file instanceof Blob)) {
      return URL.createObjectURL(file);
    }
    return '';
  }
}

/**
 * Deletes an uploaded file via server-side Supabase Edge Function or Supabase Storage.
 * Restricts deletion strictly to allowed media folders ('receipts/', 'avatars/', 'signatures/').
 */
export async function deleteFromR2(urlOrKey: string): Promise<boolean> {
  if (!urlOrKey) return false;

  // Local object URL revocation
  if (urlOrKey.startsWith('blob:')) {
    if (typeof window !== 'undefined') {
      try {
        URL.revokeObjectURL(urlOrKey);
      } catch {}
    }
    return true;
  }

  const key = urlOrKey
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+/, '');

  if (!key) return false;

  // Security Check: Restrict deletions strictly to media asset folders
  const ALLOWED_FOLDERS = ['receipts/', 'avatars/', 'signatures/'];
  const isAllowed = ALLOWED_FOLDERS.some((f) => key.startsWith(f));
  if (!isAllowed) {
    console.warn(`[Security] Blocked unauthorized storage deletion targeting key: ${key}`);
    return false;
  }

  // 1. Try Supabase Edge Function first (server-side R2 delete)
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'delete-file', urlOrKey: key },
    });
    if (!edgeError && edgeData?.success) {
      return true;
    }
  } catch {}

  // 2. Direct Supabase Storage Removal
  try {
    const { error: supaErr } = await supabase.storage.from('receipts').remove([key]);
    if (!supaErr) {
      return true;
    }
  } catch {}

  return false;
}
