import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyEmails } from "@/lib/lead-campaigns/reoon";

const MAX_EMAILS = 500;
const COST_PER_EMAIL = 0.5;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { emails } = await req.json() as { emails?: string[] };
  if (!Array.isArray(emails) || !emails.length)
    return NextResponse.json({ error: "emails array is required" }, { status: 400 });
  if (emails.length > MAX_EMAILS)
    return NextResponse.json({ error: `Maximum ${MAX_EMAILS} emails per batch` }, { status: 400 });

  const apiKey = process.env.REOON_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "REOON_API_KEY is not configured" }, { status: 500 });

  const cost = emails.length * COST_PER_EMAIL;
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || ws.lead_credits_balance < cost)
    return NextResponse.json({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }, { status: 402 });

  const results = await verifyEmails(apiKey, emails.map(e => e.trim().toLowerCase()));

  await db.from("workspaces").update({ lead_credits_balance: ws.lead_credits_balance - cost }).eq("id", workspaceId);
  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    amount:       -cost,
    type:         "consume",
    description:  `Bulk email verification — ${emails.length} emails`,
  });

  return NextResponse.json({ results, credits_used: cost });
}
