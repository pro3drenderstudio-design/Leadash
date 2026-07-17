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

const ACADEMY_GRANT_PRODUCT = "10k-academy";

/** GET /api/admin/academy/cohort-leaderboard?product_id=xxx[&cohort_id=yyy]
 *  Returns cohorts for a challenge product (newest first) with each cohort's
 *  ranked leaderboard and winner state — the screenshot + winner-confirm surface. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  let productId = req.nextUrl.searchParams.get("product_id");
  const productSlug = req.nextUrl.searchParams.get("product_slug") ?? (productId ? null : "challenge-7day");
  if (!productId && productSlug) {
    const { data: prod } = await db.from("academy_products").select("id").eq("slug", productSlug).maybeSingle();
    productId = (prod?.id as string | undefined) ?? null;
  }
  if (!productId) return NextResponse.json({ error: "product not found" }, { status: 404 });
  const onlyCohort = req.nextUrl.searchParams.get("cohort_id");

  let cohortsQuery = db
    .from("academy_cohorts")
    .select("id, name, starts_at, ends_at, status, is_default, enrolled_count, winner_enrollment_id, winner_awarded_at, cash_prize_status")
    .eq("product_id", productId)
    .order("starts_at", { ascending: false });
  if (onlyCohort) cohortsQuery = cohortsQuery.eq("id", onlyCohort);

  const { data: cohorts, error } = await cohortsQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = [];
  for (const c of (cohorts ?? []) as Array<Record<string, unknown>>) {
    const cohortId = c.id as string;
    // Enrollments in this cohort + their gamification points.
    const { data: enrollments } = await db
      .from("academy_enrollments")
      .select("id, user_id, workspace_id, status, workspaces(name)")
      .eq("cohort_id", cohortId);
    const enrRows = (enrollments ?? []) as Array<{ id: string; user_id: string; workspace_id: string; status: string; workspaces: { name: string } | null }>;
    const ids = enrRows.map(e => e.id);

    let gamMap = new Map<string, { points: number; streak_days: number; reported_earnings_cents: number }>();
    if (ids.length > 0) {
      const { data: gam } = await db
        .from("academy_gamification")
        .select("enrollment_id, points, streak_days, reported_earnings_cents")
        .in("enrollment_id", ids);
      gamMap = new Map(((gam ?? []) as Array<{ enrollment_id: string; points: number; streak_days: number; reported_earnings_cents: number }>)
        .map(g => [g.enrollment_id, g]));
    }

    const rows = enrRows
      .map(e => {
        const g = gamMap.get(e.id);
        return {
          enrollment_id: e.id,
          user_id: e.user_id,
          name: e.workspaces?.name ?? "—",
          points: g?.points ?? 0,
          streak_days: g?.streak_days ?? 0,
          reported_earnings_cents: g?.reported_earnings_cents ?? 0,
          graduated: e.status === "completed",
        };
      })
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ rank: i + 1, ...r }));

    out.push({
      id: cohortId,
      name: c.name,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      status: c.status,
      is_default: c.is_default,
      participant_count: rows.length,
      winner_enrollment_id: c.winner_enrollment_id,
      winner_awarded_at: c.winner_awarded_at,
      cash_prize_status: c.cash_prize_status,
      rows,
    });
  }

  return NextResponse.json({ cohorts: out });
}

/** POST /api/admin/academy/cohort-winner
 *  Body: { cohort_id, enrollment_id?, cash_prize_status? }
 *  Confirms the cohort winner: optionally overrides the auto-picked winner, grants
 *  the $10k Academy to the winner, and records the cash prize state (manual payout). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  let body: { cohort_id?: string; enrollment_id?: string; cash_prize_status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { cohort_id } = body;
  if (!cohort_id) return NextResponse.json({ error: "cohort_id required" }, { status: 400 });

  const { data: cohort } = await db
    .from("academy_cohorts")
    .select("id, winner_enrollment_id")
    .eq("id", cohort_id)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: "Cohort not found" }, { status: 404 });

  const winnerEnrollmentId = body.enrollment_id ?? (cohort.winner_enrollment_id as string | null);
  if (!winnerEnrollmentId) return NextResponse.json({ error: "No winner selected" }, { status: 400 });

  // Resolve the winner's user + workspace to grant the academy.
  const { data: winnerEnr } = await db
    .from("academy_enrollments")
    .select("user_id, workspace_id")
    .eq("id", winnerEnrollmentId)
    .maybeSingle();
  if (!winnerEnr) return NextResponse.json({ error: "Winner enrollment not found" }, { status: 404 });

  // Grant the $10k Academy (idempotent on user+product).
  const { error: grantErr } = await db.from("academy_enrollments").upsert({
    user_id:      winnerEnr.user_id,
    workspace_id: winnerEnr.workspace_id,
    product_id:   ACADEMY_GRANT_PRODUCT,
    access_type:  "gifted",
    status:       "active",
    enrolled_at:  new Date().toISOString(),
  }, { onConflict: "user_id,product_id" });
  if (grantErr) return NextResponse.json({ error: `Grant failed: ${grantErr.message}` }, { status: 500 });

  const { data: updated, error: updErr } = await db
    .from("academy_cohorts")
    .update({
      winner_enrollment_id: winnerEnrollmentId,
      winner_awarded_at:    new Date().toISOString(),
      cash_prize_status:    body.cash_prize_status ?? "pending",
    })
    .eq("id", cohort_id)
    .select("id, winner_enrollment_id, winner_awarded_at, cash_prize_status")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, cohort: updated });
}
