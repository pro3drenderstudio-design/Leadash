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

type Db = ReturnType<typeof createAdminClient>;

/** Views + conversions for a page since a start time (variant = a page). */
async function pageStats(db: Db, pageId: string, since: string | null) {
  const base = () => {
    let q = db.from("funnel_page_events").select("id", { count: "exact", head: true }).eq("page_id", pageId);
    if (since) q = q.gte("occurred_at", since);
    return q;
  };
  const [{ count: views }, { count: conversions }] = await Promise.all([
    base().eq("event_type", "view"),
    base().eq("event_type", "conversion"),
  ]);
  return { views: views ?? 0, conversions: conversions ?? 0 };
}

/** GET — all A/B tests for the funnel, each with its variants + live stats. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id: funnelId } = await params;

  const { data: tests } = await db
    .from("funnel_ab_tests")
    .select("id, name, status, control_page_id, winner_page_id, goal_metric, auto_winner, started_at, ended_at")
    .eq("funnel_id", funnelId)
    .order("started_at", { ascending: false });

  const pageNames = new Map<string, string>();
  const { data: pages } = await db.from("funnel_pages").select("id, name").eq("funnel_id", funnelId);
  for (const p of (pages ?? []) as { id: string; name: string }[]) pageNames.set(p.id, p.name);

  const withVariants = await Promise.all(
    ((tests ?? []) as Array<{ id: string; started_at: string | null }>).map(async (t) => {
      const { data: variants } = await db
        .from("funnel_ab_variants")
        .select("id, page_id, traffic_pct")
        .eq("test_id", t.id)
        .order("created_at", { ascending: true });
      const variantsWithStats = await Promise.all(
        ((variants ?? []) as Array<{ id: string; page_id: string; traffic_pct: number }>).map(async (v) => {
          const s = await pageStats(db, v.page_id, t.started_at);
          return {
            ...v,
            page_name: pageNames.get(v.page_id) ?? "—",
            views: s.views,
            conversions: s.conversions,
            conversion_rate: s.views ? s.conversions / s.views : 0,
          };
        }),
      );
      return { ...t, variants: variantsWithStats };
    }),
  );

  return NextResponse.json({ tests: withVariants, pages: pages ?? [] });
}

/** POST — create a running test. Body: { name, control_page_id, variants:[{page_id, traffic_pct}] } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id: funnelId } = await params;

  let body: { name?: string; control_page_id?: string; variants?: Array<{ page_id: string; traffic_pct: number }> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  const control = body.control_page_id;
  const variants = (body.variants ?? []).filter((v) => v.page_id);
  if (!name || !control) return NextResponse.json({ error: "name and control_page_id required" }, { status: 400 });
  if (variants.length < 2) return NextResponse.json({ error: "Pick at least 2 variant pages" }, { status: 400 });
  if (!variants.some((v) => v.page_id === control)) {
    return NextResponse.json({ error: "The control page must be one of the variants" }, { status: 400 });
  }

  // One running test per control page keeps public assignment unambiguous.
  const { data: existing } = await db
    .from("funnel_ab_tests")
    .select("id")
    .eq("funnel_id", funnelId)
    .eq("control_page_id", control)
    .eq("status", "running")
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "A running test already exists for this page. End it first." }, { status: 409 });

  const { data: test, error } = await db
    .from("funnel_ab_tests")
    .insert({ funnel_id: funnelId, name, control_page_id: control, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !test) return NextResponse.json({ error: error?.message ?? "Failed to create test" }, { status: 500 });

  const rows = variants.map((v) => ({
    test_id: test.id,
    page_id: v.page_id,
    traffic_pct: Math.max(0, Math.min(100, Math.round(v.traffic_pct))),
  }));
  const { error: vErr } = await db.from("funnel_ab_variants").insert(rows);
  if (vErr) {
    await db.from("funnel_ab_tests").delete().eq("id", test.id);
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, test_id: test.id }, { status: 201 });
}
