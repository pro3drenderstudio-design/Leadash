import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

/**
 * PATCH — update a test. Body may include:
 *   { status } — 'running' | 'paused' | 'completed'
 *   { winner_page_id } — declares the winner (also completes the test)
 *   { variants: [{ id, traffic_pct }] } — adjust the split
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; testId: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { testId } = await params;

  let body: { status?: string; winner_page_id?: string; variants?: Array<{ id: string; traffic_pct: number }> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (body.winner_page_id) {
    update.winner_page_id = body.winner_page_id;
    update.status = "completed";
    update.ended_at = new Date().toISOString();
  } else if (body.status && ["running", "paused", "completed"].includes(body.status)) {
    update.status = body.status;
    if (body.status === "completed") update.ended_at = new Date().toISOString();
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("funnel_ab_tests").update(update).eq("id", testId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body.variants)) {
    await Promise.all(
      body.variants
        .filter((v) => v.id)
        .map((v) =>
          db.from("funnel_ab_variants")
            .update({ traffic_pct: Math.max(0, Math.min(100, Math.round(v.traffic_pct))) })
            .eq("id", v.id)
            .eq("test_id", testId),
        ),
    );
  }

  return NextResponse.json({ ok: true });
}

/** DELETE — remove a test (variants cascade). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; testId: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { testId } = await params;

  const { error } = await db.from("funnel_ab_tests").delete().eq("id", testId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
