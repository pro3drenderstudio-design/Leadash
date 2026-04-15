import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyEmails } from "@/lib/lead-campaigns/reoon";

// POST /api/lead-campaigns/verify-single
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { email } = await req.json() as { email?: string };
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });

  const apiKey = process.env.REOON_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "REOON_API_KEY is not configured" }, { status: 500 });

  const [result] = await verifyEmails(apiKey, [email.trim().toLowerCase()]);

  const cost = 0.5;
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance, subscription_credits_balance").eq("id", workspaceId).single();
  if (ws && ws.lead_credits_balance >= cost) {
    await db.from("workspaces").update({
      lead_credits_balance:         ws.lead_credits_balance - cost,
      subscription_credits_balance: Math.max(0, (ws.subscription_credits_balance ?? 0) - cost),
    }).eq("id", workspaceId);
    await db.from("lead_credit_transactions").insert({
      workspace_id: workspaceId,
      amount: -cost,
      type: "consume",
      description: `Single email verification — ${email}`,
    });
  }

  return NextResponse.json(result);
}
