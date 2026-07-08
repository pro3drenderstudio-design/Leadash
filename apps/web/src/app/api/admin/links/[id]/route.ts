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

// GET /api/admin/links/[id] — link detail with click analytics
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const today         = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  const [{ data: link }, { data: clicks }] = await Promise.all([
    db.from("tracked_links").select("*").eq("id", id).single(),
    db.from("tracked_link_clicks")
      .select("clicked_at, device_type, country, referrer, visitor_id")
      .eq("link_id", id)
      .gte("clicked_at", thirtyDaysAgo)
      .order("clicked_at", { ascending: false })
      .limit(500),
  ]);

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  type ClickRow = { clicked_at: string; device_type: string | null; country: string | null; referrer: string | null; visitor_id: string | null };
  const typedClicks = (clicks ?? []) as ClickRow[];

  const clicksToday  = typedClicks.filter(c => c.clicked_at >= today).length;
  const clicks7d     = typedClicks.filter(c => c.clicked_at >= sevenDaysAgo).length;
  const clicks30d    = typedClicks.length;

  // Daily breakdown for sparkline (last 30 days)
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
    const r = c.referrer ? new URL(c.referrer).hostname : "direct";
    referrers[r] = (referrers[r] ?? 0) + 1;
  }
  const top_referrers = Object.entries(referrers).sort(([,a],[,b]) => b - a).slice(0, 10).map(([source, count]) => ({ source, count }));

  return NextResponse.json({
    link,
    analytics: { clicks_today: clicksToday, clicks_7d: clicks7d, clicks_30d: clicks30d, daily, devices, top_referrers },
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
