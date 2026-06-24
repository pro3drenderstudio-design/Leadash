import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Admin-only file upload for academy resources.
 *
 *   POST multipart/form-data — fields:
 *     file       The blob to upload (required)
 *     lesson_id  Foreign key for path scoping (required)
 *
 * Returns the file's public URL + mime + size so the caller can immediately
 * POST it to /api/admin/academy/lesson-resources without a second round-trip.
 *
 * Bucket: `academy-resources`. If your prod project doesn't have it yet,
 * create one in the Supabase Storage dashboard with public read enabled,
 * or extend this route to call createBucket() lazily.
 */

const BUCKET = "academy-resources";

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
  const lessonId = form.get("lesson_id");
  if (!(file instanceof File))           return NextResponse.json({ error: "file required" }, { status: 400 });
  if (typeof lessonId !== "string" || !lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  // Path: <lesson_id>/<timestamp>-<original-filename>
  // Lesson-scoped folders keep the bucket tidy and let admins clean up by
  // dropping a folder when a lesson is deleted.
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-");
  const path     = `${lessonId}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
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
    file_mime: file.type || null,
    file_bytes: file.size,
    path,
  });
}
