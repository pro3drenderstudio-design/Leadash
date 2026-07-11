/**
 * POST /api/outreach/crm/media/upload
 *
 * Outreach CRM equivalent of /api/crm/media/upload (admin CRM) — same
 * private `crm-media` bucket, but gated by workspace membership rather than
 * admin status, since this composer is used by regular workspace users.
 *
 * Mints a signed upload URL/token — the browser uploads the actual file
 * bytes directly to Supabase Storage, bypassing this route (and Vercel's
 * ~4.5MB serverless request-body cap, which the old file-proxying
 * implementation hit for any recording/attachment over that size).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { randomUUID } from "crypto";

const MAX_SIZE = 50 * 1024 * 1024; // matches the crm-media bucket's file_size_limit

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { name, mimeType, size } = await req.json() as { name?: string; mimeType?: string; size?: number };
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (typeof size === "number" && size > MAX_SIZE) {
    return NextResponse.json({ error: `File exceeds the ${MAX_SIZE / 1024 / 1024}MB limit` }, { status: 400 });
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const path = `composer/${workspaceId}/${randomUUID()}-${safeName}`;

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
