import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Admin-only file upload for funnel page builder media (block images, section
 * background images). Mirrors /api/admin/academy/upload.
 *
 *   POST multipart/form-data — fields:
 *     file       The blob to upload (required)
 *     funnel_id  Foreign key for path scoping (required)
 *
 * Bucket: `funnel-media` (public read, authenticated write — see migration
 * that created it).
 */

const BUCKET = "funnel-media";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 }); }

  const file     = form.get("file");
  const funnelId = form.get("funnel_id");
  if (!(file instanceof File))                    return NextResponse.json({ error: "file required" }, { status: 400 });
  if (typeof funnelId !== "string" || !funnelId)  return NextResponse.json({ error: "funnel_id required" }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type))               return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (file.size > MAX_BYTES)                      return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });

  // Path: <funnel_id>/<timestamp>-<original-filename>
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-");
  const path     = `${funnelId}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}. Ensure the '${BUCKET}' bucket exists with public read.` },
      { status: 500 },
    );
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url:       pub.publicUrl,
    file_mime: file.type,
    file_bytes: file.size,
    path,
  });
}
