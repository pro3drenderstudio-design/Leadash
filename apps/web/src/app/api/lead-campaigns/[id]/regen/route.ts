import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { personalizeLeads } from "@/lib/lead-campaigns/gemini";

const COST_PER_LEAD = 2;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { lead_ids } = await req.json() as { lead_ids: string[] };
  if (!Array.isArray(lead_ids) || !lead_ids.length) {
    return NextResponse.json({ error: "lead_ids required" }, { status: 400 });
  }

  const { data: campaign } = await db
    .from("lead_campaigns")
    .select("personalize_prompt")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!campaign?.personalize_prompt) {
    return NextResponse.json({ error: "Campaign has no personalization prompt" }, { status: 400 });
  }

  const { data: leads } = await db
    .from("lead_campaign_leads")
    .select("id, first_name, last_name, title, company, industry, website")
    .in("id", lead_ids)
    .eq("campaign_id", id)
    .eq("workspace_id", workspaceId);

  if (!leads?.length) return NextResponse.json({ error: "No leads found" }, { status: 404 });

  const cost = leads.length * COST_PER_LEAD;

  const { data: ws } = await db
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();

  if (!ws || ws.lead_credits_balance < cost) {
    return NextResponse.json(
      { error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` },
      { status: 402 },
    );
  }

  await db.from("workspaces")
    .update({ lead_credits_balance: ws.lead_credits_balance - cost })
    .eq("id", workspaceId);

  type Lead = { id: string; first_name?: string | null; last_name?: string | null; title?: string | null; company?: string | null; industry?: string | null; website?: string | null };
  const lines = await personalizeLeads(leads as Lead[], campaign.personalize_prompt);

  const updated: { id: string; personalized_line: string }[] = [];
  for (let i = 0; i < leads.length; i++) {
    if (lines[i]) {
      await db.from("lead_campaign_leads")
        .update({ personalized_line: lines[i] })
        .eq("id", (leads as Lead[])[i].id);
      updated.push({ id: (leads as Lead[])[i].id, personalized_line: lines[i] });
    }
  }

  await db.from("lead_credit_transactions").insert({
    workspace_id:     workspaceId,
    amount:           -cost,
    type:             "consume",
    description:      `Regen personalization — ${leads.length} lead${leads.length !== 1 ? "s" : ""}`,
    lead_campaign_id: id,
  });

  return NextResponse.json({ updated, credits_used: cost });
}
