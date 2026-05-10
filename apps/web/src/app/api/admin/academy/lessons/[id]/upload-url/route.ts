import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createMuxUpload } from "@/lib/academy/mux";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: lesson } = await db.from("academy_lessons").select("id").eq("id", id).single();
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const { uploadId, url } = await createMuxUpload();

  // Persist the upload ID so we can poll it later
  await db.from("academy_lessons").update({ mux_upload_id: uploadId }).eq("id", id);

  return NextResponse.json({ upload_id: uploadId, url });
}
