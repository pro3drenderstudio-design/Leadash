import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page") ?? "0");
  const limit  = parseInt(url.searchParams.get("limit") ?? "50");
  const status = url.searchParams.get("status");

  let query = db
    .from("outreach_enrollments")
    .select("id, status, current_step, next_send_at, ab_variant, enrolled_at, lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title)", { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId)
    .order("enrolled_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollments: data, total: count ?? 0 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  const { list_ids } = await req.json() as { list_ids: string[] };
  if (!list_ids?.length) return NextResponse.json({ error: "list_ids required" }, { status: 400 });

  // Get leads from those lists
  const { data: leads } = await db
    .from("outreach_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("list_id", list_ids)
    .eq("status", "active");

  if (!leads?.length) return NextResponse.json({ enrolled: 0 });

  // Get campaign to check stop_on_reply + list of already enrolled
  const { data: existing } = await db
    .from("outreach_enrollments")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  const enrolledIds = new Set((existing ?? []).map(e => e.lead_id));
  const toEnroll = leads.filter(l => !enrolledIds.has(l.id));

  if (!toEnroll.length) return NextResponse.json({ enrolled: 0 });

  const rows = toEnroll.map(l => ({
    workspace_id: workspaceId,
    campaign_id:  campaignId,
    lead_id:      l.id,
    ab_variant:   Math.random() < 0.5 ? "a" : "b",
  }));

  const { data: inserted, error } = await db.from("outreach_enrollments").insert(rows).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrolled: inserted?.length ?? 0 });
}
