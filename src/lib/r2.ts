import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getStoredCloudConfig } from '@/store/cloudConfigStore';
import { supabase } from '@/lib/supabase';

let currentConfig = getStoredCloudConfig();

let accountId = currentConfig.cloudflareAccountId || import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID || '';
let accessKeyId = currentConfig.r2AccessKeyId || import.meta.env.VITE_R2_ACCESS_KEY_ID || '';
let secretAccessKey = currentConfig.r2SecretAccessKey || import.meta.env.VITE_R2_SECRET_ACCESS_KEY || '';
let bucketName = currentConfig.r2BucketName || import.meta.env.VITE_R2_BUCKET_NAME || '';
let publicDomain = currentConfig.r2PublicDomain || import.meta.env.VITE_R2_PUBLIC_DOMAIN || '';

export let s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const reinitializeR2 = (newConfig?: Partial<typeof currentConfig>) => {
  currentConfig = { ...getStoredCloudConfig(), ...newConfig };
  accountId = currentConfig.cloudflareAccountId;
  accessKeyId = currentConfig.r2AccessKeyId;
  secretAccessKey = currentConfig.r2SecretAccessKey;
  bucketName = currentConfig.r2BucketName;
  publicDomain = currentConfig.r2PublicDomain;

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return s3Client;
};

// Listen for global configuration updates
if (typeof window !== 'undefined') {
  window.addEventListener('asopalav:cloud-config-updated', ((e: CustomEvent) => {
    if (e.detail) {
      reinitializeR2(e.detail);
    }
  }) as EventListener);
}

/**
 * Compresses an image client-side to an optimized WebP / JPEG Blob to save R2 storage
 */
export async function compressImageToBlob(
  file: File | Blob,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.80
): Promise<{ blob: Blob; contentType: string; ext: string }> {
  // If not an image, return original
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
 * Uploads a file to Cloudflare R2 with automatic client-side compression and pre-signed URL security
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

    // 2. Primary Zero-Trust Path: Supabase Edge Function Pre-Signed URL
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
    } catch (e) {
      // Fall through to direct S3 client fallback
    }

    // 3. Fallback: Direct S3 Client Upload
    const safeKey = `${folder}/${year}-${month}/${folder}_${day}-${month}-${year}_${hours}-${minutes}-${seconds}_${randomStr}.${fileExt}`;
    const arrayBuffer = await uploadBlob.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
      Body: body,
      ContentType: contentType,
    });

    // Timeout after 6 seconds so UI never hangs
    const uploadPromise = s3Client.send(command);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('R2 Upload Timeout')), 6000)
    );

    await Promise.race([uploadPromise, timeoutPromise]);
    return `${publicDomain}/${safeKey}`;
  } catch (err) {
    console.warn('R2 upload failed:', err);
    return '';
  }
}

/**
 * Deletes an uploaded file from Cloudflare R2 when removed by user
 */
export async function deleteFromR2(urlOrKey: string): Promise<boolean> {
  if (!urlOrKey) return false;

  const key = urlOrKey
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+/, '');

  if (!key) return false;

  // Security Check: Restrict deletions strictly to media asset folders
  const ALLOWED_FOLDERS = ['receipts/', 'avatars/', 'signatures/'];
  const isAllowed = ALLOWED_FOLDERS.some((f) => key.startsWith(f));
  if (!isAllowed) {
    console.warn(`[Security] Blocked unauthorized R2 deletion targeting key: ${key}`);
    return false;
  }

  // 1. Try Supabase Edge Function first
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'delete-file', urlOrKey: key },
    });
    if (!edgeError && edgeData?.success) {
      return true;
    }
  } catch (e) {
    // Fall through to S3 client
  }

  // 2. Direct S3 Client Fallback
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`Successfully removed ${key} from Cloudflare R2`);
    return true;
  } catch (err) {
    console.warn(`Failed to delete ${key} from Cloudflare R2:`, err);
    return false;
  }
}
