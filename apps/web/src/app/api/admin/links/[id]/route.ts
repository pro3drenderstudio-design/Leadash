import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db } : null;
}

// GET /api/admin/links/[id]?from=YYYY-MM-DD&to=YYYY-MM-DD — link detail with click analytics
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  // Date range — default to last 30 days
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam   = url.searchParams.get("to");
  const windowFrom = fromParam
    ? new Date(`${fromParam}T00:00:00.000Z`).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const windowTo = toParam
    ? new Date(`${toParam}T23:59:59.999Z`).toISOString()
    : new Date().toISOString();

  const [{ data: link }, { data: clicks }] = await Promise.all([
    db.from("tracked_links").select("*").eq("id", id).single(),
    db.from("tracked_link_clicks")
      .select("clicked_at, device_type, country, referrer, visitor_id")
      .eq("link_id", id)
      .gte("clicked_at", windowFrom)
      .lte("clicked_at", windowTo)
      .order("clicked_at", { ascending: true })
      .limit(5000),
  ]);

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  type ClickRow = { clicked_at: string; device_type: string | null; country: string | null; referrer: string | null; visitor_id: string | null };
  const typedClicks = (clicks ?? []) as ClickRow[];

  const total   = typedClicks.length;
  const unique  = new Set(typedClicks.map(c => c.visitor_id).filter(Boolean)).size;

  // Daily breakdown for the selected window
  const dailyMap: Record<string, number> = {};
  for (const c of typedClicks) {
    const day = c.clicked_at.slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  }
  const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  // Device breakdown
  const devices: Record<string, number> = {};
  for (const c of typedClicks) {
    const d = c.device_type ?? "unknown";
    devices[d] = (devices[d] ?? 0) + 1;
  }

  // Top referrers
  const referrers: Record<string, number> = {};
  for (const c of typedClicks) {
    let r = "direct";
    if (c.referrer) {
      try { r = new URL(c.referrer).hostname; } catch { r = c.referrer.slice(0, 40); }
    }
    referrers[r] = (referrers[r] ?? 0) + 1;
  }
  const top_referrers = Object.entries(referrers).sort(([,a],[,b]) => b - a).slice(0, 10).map(([source, count]) => ({ source, count }));

  return NextResponse.json({
    link,
    analytics: { total, unique, daily, devices, top_referrers, window_from: windowFrom, window_to: windowTo },
  });
}

// PATCH /api/admin/links/[id] — update destination URL, title, status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const body = await req.json() as Partial<{
    title: string;
    destination_url: string;
    description: string;
    is_active: boolean;
  }>;

  const { error } = await db
    .from("tracked_links")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/links/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const { error } = await db.from("tracked_links").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
