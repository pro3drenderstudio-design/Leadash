import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { enqueueEnrichBulk } from "@/lib/queue";
import type { LeadInput } from "@/types/lead-campaigns";

const MAX_LEADS     = 50_000;
const COST_PER_LEAD = 0.5;

// POST /api/lead-campaigns/enrich
// Validates, deducts credits, inserts a pending job row, enqueues to BullMQ.
// Returns { job_id } immediately — the client polls enrich-jobs/[id] for progress.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { leads, prompt } = await req.json() as { leads?: LeadInput[]; prompt?: string };
  if (!Array.isArray(leads) || !leads.length)
    return NextResponse.json({ error: "leads array is required" }, { status: 400 });
  if (!prompt?.trim())
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (leads.length > MAX_LEADS)
    return NextResponse.json({ error: `Maximum ${MAX_LEADS.toLocaleString()} leads per batch` }, { status: 400 });

  const cost = leads.length * COST_PER_LEAD;

  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || (ws.lead_credits_balance as number) < cost)
    return NextResponse.json({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }, { status: 402 });

  await db.from("workspaces")
    .update({ lead_credits_balance: (ws.lead_credits_balance as number) - cost })
    .eq("id", workspaceId);

  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    amount:       -cost,
    type:         "consume",
    description:  `AI enrichment — ${leads.length} leads`,
  });

  const expires = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const { data: jobRow, error: jobErr } = await db
    .from("lead_enrichment_jobs")
    .insert({
      workspace_id:  workspaceId,
      status:        "pending",
      total:         leads.length,
      processed:     0,
      prompt:        prompt.trim().slice(0, 2000),
      leads,                       // worker reads this
      credits_used:  cost,
      expires_at:    expires,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow)
    return NextResponse.json({ error: jobErr?.message ?? "Failed to create job" }, { status: 500 });

  try {
    await enqueueEnrichBulk(jobRow.id, workspaceId);
  } catch (err) {
    await db.from("lead_enrichment_jobs")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Queue unavailable" })
      .eq("id", jobRow.id);
    return NextResponse.json({ error: "Failed to enqueue job — Redis may be unavailable" }, { status: 500 });
  }

  return NextResponse.json({ job_id: jobRow.id }, { status: 202 });
}
