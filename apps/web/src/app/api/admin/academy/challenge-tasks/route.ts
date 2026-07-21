import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

/** GET /api/admin/academy/challenge-tasks?product_id=xxx
 *  Returns all tasks for a product ordered by day, position. */
export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { data, error } = await db
    .from("academy_challenge_tasks")
    .select("*")
    .eq("product_id", productId)
    .order("day")
    .order("position");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

/** POST /api/admin/academy/challenge-tasks
 *  Body: { product_id, day, task_type, title, points, position?, ...optional }
 *  Creates a new challenge task. */
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    product_id?: string;
    day?: number;
    task_type?: string;
    title?: string;
    points?: number;
    position?: number;
    lesson_id?: string;
    proof_config?: Record<string, unknown>;
    metric_config?: Record<string, unknown>;
    live_session_id?: string;
    quiz_config?: Record<string, unknown>;
    is_published?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, day, task_type, title, points = 0, position, ...rest } = body;
  if (!product_id || day === undefined || !task_type || !title)
    return NextResponse.json({ error: "product_id, day, task_type, title required" }, { status: 400 });

  // Auto-position at end of the day if not provided
  let pos = position;
  if (pos === undefined) {
    const { count } = await db
      .from("academy_challenge_tasks")
      .select("*", { count: "exact", head: true })
      .eq("product_id", product_id)
      .eq("day", day);
    pos = count ?? 0;
  }

  const { data, error } = await db
    .from("academy_challenge_tasks")
    .insert({ product_id, day, task_type, title, points, position: pos, ...rest })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

/** PATCH /api/admin/academy/challenge-tasks
 *  Body: { id, ...updates }
 *  Allowed fields: task_type, title, points, position, is_published,
 *                  proof_config, metric_config, quiz_config, lesson_id, live_session_id */
export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    id?: string;
    task_type?: string;
    title?: string;
    points?: number;
    position?: number;
    is_published?: boolean;
    proof_config?: Record<string, unknown> | null;
    metric_config?: Record<string, unknown> | null;
    quiz_config?: Record<string, unknown> | null;
    self_check_config?: Record<string, unknown> | null;
    lesson_id?: string | null;
    live_session_id?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Whitelist allowed update fields
  const allowed: Record<string, unknown> = {};
  const allowedKeys = [
    "task_type", "title", "points", "position", "is_published",
    "proof_config", "metric_config", "quiz_config", "self_check_config", "lesson_id", "live_session_id",
  ];
  for (const key of allowedKeys) {
    if (key in updates) allowed[key] = (updates as Record<string, unknown>)[key];
  }

  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });

  const { data, error } = await db
    .from("academy_challenge_tasks")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

/** DELETE /api/admin/academy/challenge-tasks?id=xxx */
export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_challenge_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
