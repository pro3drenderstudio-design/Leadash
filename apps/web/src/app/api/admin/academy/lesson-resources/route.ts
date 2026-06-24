import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Admin-only CRUD for academy_lesson_resources — the structured downloads
 * (Supabase Storage URLs) and external links attached to each lesson.
 *
 *   GET    ?lesson_id=...   list resources for a lesson, sorted by position
 *   POST   { ... }          create a resource
 *   PATCH  { id, ... }      update label / description / url / position
 *   DELETE ?id=...          delete a resource
 */

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

const RESOURCE_TYPES = new Set(["file", "link"]);
const PATCHABLE = new Set(["label", "description", "url", "position", "resource_type", "file_mime", "file_bytes"]);

export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lessonId = req.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  const { data, error } = await db
    .from("academy_lesson_resources")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resources: data });
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    lesson_id?:     string;
    resource_type?: string;
    label?:         string;
    description?:   string;
    url?:           string;
    position?:      number;
    file_mime?:     string;
    file_bytes?:    number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { lesson_id, label, url } = body;
  const resource_type = body.resource_type ?? "link";
  if (!lesson_id) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });
  if (!label)     return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!url)       return NextResponse.json({ error: "url required" }, { status: 400 });
  if (!RESOURCE_TYPES.has(resource_type)) {
    return NextResponse.json({ error: "invalid resource_type" }, { status: 400 });
  }

  let position = body.position;
  if (position === undefined) {
    const { count } = await db
      .from("academy_lesson_resources")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lesson_id);
    position = count ?? 0;
  }

  const { data, error } = await db
    .from("academy_lesson_resources")
    .insert({
      lesson_id,
      resource_type,
      label,
      description: body.description ?? null,
      url,
      position,
      file_mime:  body.file_mime  ?? null,
      file_bytes: body.file_bytes ?? null,
    })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id") continue;
    if (PATCHABLE.has(k)) updates[k] = v;
  }

  if (updates.resource_type && !RESOURCE_TYPES.has(updates.resource_type as string)) {
    return NextResponse.json({ error: "invalid resource_type" }, { status: 400 });
  }

  const { data, error } = await db
    .from("academy_lesson_resources")
    .update(updates)
    .eq("id", id)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data });
}

export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_lesson_resources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
