import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyEmails as verifyEmailsReoon } from "@/lib/lead-campaigns/reoon";
import { verifyEmails as verifyEmailsLeadash } from "@/lib/lead-campaigns/verifier";
import { getCreditRates } from "@/lib/lead-campaigns/credit-rates";

// POST /api/lead-campaigns/verify-single
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { email } = await req.json() as { email?: string };
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });

  const adminDb = createAdminClient();
  const { data: pvRow } = await adminDb.from("admin_settings").select("value").eq("key", "verifier_provider").maybeSingle();
  const provider = (pvRow?.value as string | null) ?? "reoon";

  let result: { email: string; status: string; score: number };

  if (provider === "leadash" && process.env.VERIFIER_URL) {
    const [r] = await verifyEmailsLeadash([email.trim().toLowerCase()]);
    result = r;
  } else {
    const apiKey = process.env.REOON_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "REOON_API_KEY is not configured" }, { status: 500 });
    const [r] = await verifyEmailsReoon(apiKey, [email.trim().toLowerCase()]);
    result = r;
  }

  const { verify: rateVerify } = await getCreditRates();
  const cost = rateVerify;
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
