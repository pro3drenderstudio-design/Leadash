import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackPayment } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const { reference } = await req.json() as { reference?: string };
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const db = createAdminClient();

  // Idempotency — if we already processed this reference, return current balance
  const { data: existing } = await db
    .from("lead_credit_transactions")
    .select("id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (existing) {
    const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
    return NextResponse.json({ already_processed: true, balance: ws?.lead_credits_balance ?? 0 });
  }

  // Verify with Paystack
  const { paid, metadata } = await verifyPaystackPayment(reference);
  if (!paid) return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });

  const type        = metadata.type as string | undefined;
  const metaWsId    = metadata.workspace_id as string | undefined;
  const creditsStr  = metadata.credits as string | undefined;
  const packId      = metadata.pack_id as string | undefined;

  if (type !== "credit_purchase") return NextResponse.json({ error: "Not a credit purchase" }, { status: 400 });
  if (metaWsId !== workspaceId)   return NextResponse.json({ error: "Workspace mismatch" }, { status: 403 });
  if (!creditsStr || !packId)     return NextResponse.json({ error: "Missing metadata" }, { status: 400 });

  const credits = parseInt(creditsStr, 10);
  if (!credits || credits <= 0)   return NextResponse.json({ error: "Invalid credit amount" }, { status: 400 });

  // Grant credits atomically — insert transaction first (unique constraint prevents double-grant)
  const { error: txError } = await db.from("lead_credit_transactions").insert({
    workspace_id:       workspaceId,
    type:               "purchase",
    amount:             credits,
    description:        `Credit pack: ${packId}`,
    paystack_reference: reference,
  });

  if (txError) {
    // Unique constraint violation — another request beat us, return current balance
    const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
    return NextResponse.json({ already_processed: true, balance: ws?.lead_credits_balance ?? 0 });
  }

  // Update balance
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  const newBalance = (ws?.lead_credits_balance ?? 0) + credits;
  await db.from("workspaces").update({ lead_credits_balance: newBalance }).eq("id", workspaceId);

  return NextResponse.json({ granted: credits, balance: newBalance });
}
