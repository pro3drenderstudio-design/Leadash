import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { personalizeLeads } from "@/lib/lead-campaigns/gemini";

const BATCH_SIZE   = 200; // process in chunks to stay within timeouts
const MAX_LEADS    = 5000;
const COST_PER_LEAD = 0.5;

interface LeadInput {
  email?:      string | null;
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

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
    return NextResponse.json({ error: `Maximum ${MAX_LEADS} leads per request` }, { status: 400 });

  const cost = leads.length * COST_PER_LEAD;
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || ws.lead_credits_balance < cost)
    return NextResponse.json({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }, { status: 402 });

  // Process in batches of BATCH_SIZE to avoid OpenAI rate limits / timeouts
  const allLines: string[] = [];
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const lines = await personalizeLeads(chunk, prompt.trim());
    allLines.push(...lines);
  }

  await db.from("workspaces").update({ lead_credits_balance: ws.lead_credits_balance - cost }).eq("id", workspaceId);
  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    amount:       -cost,
    type:         "consume",
    description:  `AI enrichment — ${leads.length} leads`,
  });

  const results = leads.map((lead, i) => ({ ...lead, personalized_line: allLines[i] ?? "" }));
  return NextResponse.json({ results, credits_used: cost });
}
