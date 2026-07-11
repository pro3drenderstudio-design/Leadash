/**
 * POST /api/crm/media/upload
 *
 * Mints a signed upload URL/token for the private `crm-media` bucket — the
 * browser uploads the actual file bytes directly to Supabase Storage from
 * here, bypassing this route entirely. Vercel serverless functions cap
 * request bodies at ~4.5MB, so proxying file bytes through this route (the
 * old implementation) rejected any voice recording or attachment over that
 * size with a plain-text 413 the client couldn't parse as JSON.
 *
 * Returns a storage `path` (used to re-fetch bytes server-side when actually
 * sending, for both Postal and WhatsApp) and a `token` for the client to
 * pass to `supabase.storage.from("crm-media").uploadToSignedUrl(path, token, file)`.
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

  const { name, mimeType, size } = await req.json() as { name?: string; mimeType?: string; size?: number };
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (typeof size === "number" && size > MAX_SIZE) {
    return NextResponse.json({ error: `File exceeds the ${MAX_SIZE / 1024 / 1024}MB limit` }, { status: 400 });
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const path = `composer/${user.id}/${randomUUID()}-${safeName}`;

  const { data: signed, error } = await db.storage.from("crm-media").createSignedUploadUrl(path);
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({
    path,
    token:    signed.token,
    name,
    mimeType: mimeType || "application/octet-stream",
    size:     size ?? 0,
  });
}
