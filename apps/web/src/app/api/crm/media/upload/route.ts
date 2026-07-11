/**
 * POST /api/crm/media/upload
 *
 * Uploads a file (image/document/audio/video, including recorded voice
 * notes) from a CRM composer to the private `crm-media` bucket. Returns a
 * storage `path` (used to re-fetch bytes server-side when actually sending,
 * for both Postal and WhatsApp) plus a signed URL for immediate preview.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

const MAX_SIZE = 50 * 1024 * 1024; // matches the crm-media bucket's file_size_limit

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File exceeds the ${MAX_SIZE / 1024 / 1024}MB limit` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const path = `composer/${user.id}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await db.storage
    .from("crm-media")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: signed, error: signError } = await db.storage
    .from("crm-media")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Upload succeeded but failed to sign URL" }, { status: 500 });
  }

  return NextResponse.json({
    path,
    url:      signed.signedUrl,
    name:     file.name,
    mimeType: file.type || "application/octet-stream",
    size:     file.size,
  });
}
