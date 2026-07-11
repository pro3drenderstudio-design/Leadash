/**
 * POST /api/outreach/crm/media/upload
 *
 * Outreach CRM equivalent of /api/crm/media/upload (admin CRM) — same
 * private `crm-media` bucket, but gated by workspace membership rather than
 * admin status, since this composer is used by regular workspace users.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { randomUUID } from "crypto";

const MAX_SIZE = 50 * 1024 * 1024; // matches the crm-media bucket's file_size_limit

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

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
  const path = `composer/${workspaceId}/${randomUUID()}-${safeName}`;

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
