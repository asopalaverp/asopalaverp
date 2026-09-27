// ==============================================================================
// ASOPALAV ERP — CLOUDFLARE R2 SECURE STORAGE EDGE FUNCTION
// Path: supabase/functions/r2-storage/index.ts
// Runtime: Deno / Supabase Edge Functions
// Description:
//   Provides zero-trust pre-signed upload URLs and server-validated file deletion
//   so that S3 Secret Access Keys are NEVER exposed to client browser bundles.
// ==============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@^3.758.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@^3.758.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accountId = Deno.env.get("R2_ACCOUNT_ID") || Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "41fcdd0b926599600e392e23fd9a17ce";
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "";
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
    const bucketName = Deno.env.get("R2_BUCKET_NAME") || "asopalav-erp-media";
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN") || "https://pub-5c613915e11142e0af82109d818863e1.r2.dev";

    if (!accessKeyId || !secretAccessKey) {
      return new Response(
        JSON.stringify({ error: "R2 server-side credentials are not configured in Edge Function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const body = await req.json();
    const action = body.action || "get-upload-url";

    // 1. Generate Pre-Signed Upload URL
    if (action === "get-upload-url") {
      const folder = body.folder || "receipts";
      const contentType = body.contentType || "image/webp";
      const originalName = body.fileName || "file.webp";
      const ext = originalName.split(".").pop() || "webp";

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const day = pad(now.getDate());
      const month = pad(now.getMonth() + 1);
      const year = now.getFullYear();
      const hours = pad(now.getHours());
      const minutes = pad(now.getMinutes());
      const seconds = pad(now.getSeconds());
      const randomStr = Math.random().toString(36).substring(2, 6);

      const safeKey = `${folder}/${year}-${month}/${folder}_${day}-${month}-${year}_${hours}-${minutes}-${seconds}_${randomStr}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: safeKey,
        ContentType: contentType,
      });

      // URL valid for 5 minutes (300 seconds)
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
      const publicUrl = `${publicDomain}/${safeKey}`;

      return new Response(
        JSON.stringify({
          success: true,
          uploadUrl,
          publicUrl,
          key: safeKey,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Safe Server-Side Deletion
    if (action === "delete-file") {
      const urlOrKey = body.urlOrKey || "";
      const key = urlOrKey
        .replace(/^https?:\/\/[^/]+\//, "")
        .replace(/^\/+/, "");

      // Security check: Only permit deleting media inside permitted folders
      const ALLOWED_FOLDERS = ["receipts/", "avatars/", "signatures/"];
      const isAllowed = ALLOWED_FOLDERS.some((f) => key.startsWith(f));

      if (!isAllowed) {
        return new Response(
          JSON.stringify({ error: "Unauthorized file path deletion attempted." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      await s3Client.send(command);

      return new Response(
        JSON.stringify({ success: true, key }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action requested." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
