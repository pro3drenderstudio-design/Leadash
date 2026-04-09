import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId, eid } = await params;

  const { error } = await db
    .from("outreach_enrollments")
    .delete()
    .eq("id", eid)
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
