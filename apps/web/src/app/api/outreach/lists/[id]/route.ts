import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const force = new URL(req.url).searchParams.get("force") === "1";

  // Verify ownership
  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!force) {
    // Check for active enrollments tied to leads in this list
    const { data: leads } = await db
      .from("outreach_leads")
      .select("id")
      .eq("list_id", id)
      .eq("workspace_id", workspaceId);

    const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
    if (leadIds.length > 0) {
      const { data: enrollments } = await db
        .from("outreach_enrollments")
        .select("id, campaign_id, campaign:outreach_campaigns!campaign_id(id, name)")
        .eq("workspace_id", workspaceId)
        .in("lead_id", leadIds)
        .in("status", ["active", "paused"]);

      if (enrollments && enrollments.length > 0) {
        type EnrollmentRow = { id: string; campaign_id: string; campaign: { id: string; name: string } | null };
        const campaignMap = new Map<string, string>();
        for (const e of enrollments as EnrollmentRow[]) {
          if (e.campaign) campaignMap.set(e.campaign.id, e.campaign.name);
        }
        const campaigns = Array.from(campaignMap.entries()).map(([cid, name]) => ({ id: cid, name }));
        return NextResponse.json(
          { error: "active_enrollments", enrolled_count: enrollments.length, campaigns },
          { status: 409 },
        );
      }
    }
  }

  // Delete leads first, then the list
  await db.from("outreach_leads").delete().eq("list_id", id).eq("workspace_id", workspaceId);
  const { error } = await db.from("outreach_lists").delete().eq("id", id).eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json();
  const { name, description } = body;

  const { data, error } = await db
    .from("outreach_lists")
    .update({ ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
