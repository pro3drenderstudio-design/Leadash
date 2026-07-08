import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

// GET /api/admin/outreach/campaigns
// Query params: search, status, page
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp     = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || null;
  const status = sp.get("status")          || null;
  const page   = Math.max(0, parseInt(sp.get("page") ?? "0") || 0);
  const PAGE   = 50;

  let q = ctx.adminClient
    .from("outreach_campaigns")
    .select(
      `id, name, status, daily_cap, created_at, deleted_at, workspace_id,
       workspaces!inner (name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(page * PAGE, (page + 1) * PAGE - 1);

  if (search) q = q.ilike("name", `%${search}%`);
  if (status === "active")  q = q.is("deleted_at", null).eq("status", "active");
  else if (status === "deleted") q = q.not("deleted_at", "is", null);
  else if (status)          q = q.is("deleted_at", null).eq("status", status);
  else                      q = q.is("deleted_at", null);

  const { data: campaigns, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type WsRow       = { name: string };
  type CampaignRow = { id: string; name: string; status: string; daily_cap: number | null; created_at: string; deleted_at: string | null; workspace_id: string; workspaces: unknown };
  type EnrollRow   = { campaign_id: string; status: string };

  const typedCampaigns = (campaigns ?? []) as CampaignRow[];
  const campaignIds = typedCampaigns.map(c => c.id);

  // Fetch enrollment counts for these campaigns
  const enrollmentCounts: Record<string, { total: number; active: number; completed: number; failed: number }> = {};
  if (campaignIds.length > 0) {
    const { data: enrollments } = await ctx.adminClient
      .from("outreach_enrollments")
      .select("campaign_id, status")
      .in("campaign_id", campaignIds)
      .is("deleted_at", null);

    for (const e of (enrollments ?? []) as EnrollRow[]) {
      const cid = e.campaign_id;
      if (!enrollmentCounts[cid]) enrollmentCounts[cid] = { total: 0, active: 0, completed: 0, failed: 0 };
      enrollmentCounts[cid].total++;
      if (e.status === "active" || e.status === "pending") enrollmentCounts[cid].active++;
      else if (e.status === "completed")                   enrollmentCounts[cid].completed++;
      else if (e.status === "failed")                      enrollmentCounts[cid].failed++;
    }
  }

  const mapped = typedCampaigns.map(c => {
    const ws = c.workspaces as WsRow | null;
    const { workspaces: _w, ...rest } = c;
    const counts = enrollmentCounts[c.id] ?? { total: 0, active: 0, completed: 0, failed: 0 };
    return { ...rest, workspace_name: ws?.name ?? "", ...counts };
  });

  return NextResponse.json({ campaigns: mapped, total: count ?? 0, page });
}
