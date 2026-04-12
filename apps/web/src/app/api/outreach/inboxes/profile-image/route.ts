import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// POST /api/outreach/inboxes/profile-image
// Uploads a profile image for an inbox (or the workspace default) to Supabase Storage.
// Body: multipart/form-data — fields: file (required), inbox_id (optional; omit for default)
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const formData = await req.formData();
  const file    = formData.get("file") as File | null;
  const inboxId = formData.get("inbox_id") as string | null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF allowed" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const ext       = file.type.split("/")[1].replace("jpeg", "jpg");
  const filename  = inboxId
    ? `${workspaceId}/inbox-${inboxId}.${ext}`
    : `${workspaceId}/default.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await db.storage
    .from("inbox-profiles")
    .upload(filename, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: { publicUrl } } = db.storage
    .from("inbox-profiles")
    .getPublicUrl(filename);

  // Bust cache by appending a timestamp
  const url = `${publicUrl}?t=${Date.now()}`;

  if (inboxId) {
    // Verify inbox belongs to this workspace then update
    const { error } = await db
      .from("outreach_inboxes")
      .update({ profile_image_url: url })
      .eq("id", inboxId)
      .eq("workspace_id", workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Save as workspace default
    const { error } = await db
      .from("workspace_settings")
      .upsert({ workspace_id: workspaceId, default_inbox_profile_image_url: url }, { onConflict: "workspace_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url });
}
