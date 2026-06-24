import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Admin-only CRUD for academy_lesson_blocks — the ordered rich-text /
 * callout / code blocks rendered under each lesson's video.
 *
 * Endpoints:
 *   GET    ?lesson_id=...        list blocks for one lesson, sorted by position
 *   POST   { lesson_id, ... }    create a new block (auto-positions at end)
 *   PATCH  { id, ... }           update block content / type / position
 *   DELETE ?id=...               delete one block
 *
 * Reads happen via the public-read RLS policy from migration 054; this admin
 * endpoint exists so authoring tools never bypass RLS to read sibling
 * unpublished work.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

const BLOCK_TYPES = new Set(["rich_text", "callout", "code"]);
const PATCHABLE   = new Set(["block_type", "content", "position"]);

export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lessonId = req.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  const { data, error } = await db
    .from("academy_lesson_blocks")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data });
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { lesson_id?: string; block_type?: string; content?: string; position?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { lesson_id, content } = body;
  const block_type = body.block_type ?? "rich_text";
  if (!lesson_id) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });
  if (!content)   return NextResponse.json({ error: "content required" }, { status: 400 });
  if (!BLOCK_TYPES.has(block_type)) return NextResponse.json({ error: "invalid block_type" }, { status: 400 });

  // Auto-position at the end of the lesson's existing blocks unless specified.
  let position = body.position;
  if (position === undefined) {
    const { count } = await db
      .from("academy_lesson_blocks")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lesson_id);
    position = count ?? 0;
  }

  const { data, error } = await db
    .from("academy_lesson_blocks")
    .insert({ lesson_id, block_type, content, position })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (k === "id") continue;
    if (PATCHABLE.has(k)) updates[k] = v;
  }

  if (updates.block_type && !BLOCK_TYPES.has(updates.block_type as string)) {
    return NextResponse.json({ error: "invalid block_type" }, { status: 400 });
  }

  const { data, error } = await db
    .from("academy_lesson_blocks")
    .update(updates)
    .eq("id", id)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data });
}

export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_lesson_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
