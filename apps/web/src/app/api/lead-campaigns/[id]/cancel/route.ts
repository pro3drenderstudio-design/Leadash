import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: campaign } = await db
    .from("lead_campaigns")
    .select("credits_reserved, credits_used, status, name, workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["pending", "running"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign cannot be cancelled in its current state" }, { status: 400 });
  }

  // Refund unused credits
  const refund = Math.max(0, campaign.credits_reserved - campaign.credits_used);
  if (refund > 0) {
    const { data: ws } = await db
      .from("workspaces")
      .select("lead_credits_balance")
      .eq("id", workspaceId)
      .single();

    if (ws) {
      await db.from("workspaces")
        .update({ lead_credits_balance: ws.lead_credits_balance + refund })
        .eq("id", workspaceId);

      await db.from("lead_credit_transactions").insert({
        workspace_id:     workspaceId,
        amount:           refund,
        type:             "refund",
        description:      `Cancellation refund for "${campaign.name}"`,
        lead_campaign_id: id,
      });
    }
  }

  await db.from("lead_campaigns").update({
    status:       "cancelled",
    completed_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ refunded: refund });
}
