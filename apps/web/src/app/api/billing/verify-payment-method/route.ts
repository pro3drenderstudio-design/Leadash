/**
 * POST /api/billing/verify-payment-method
 *
 * Called after redirect back from /api/billing/update-payment-method's
 * checkout. Verifies the charge, swaps in the fresh authorization_code,
 * clears past_due state, and records the invoice — mirrors
 * /api/outreach/domains/[id]/update-payment for the core plan subscription.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { reference } = await req.json() as { reference?: string };
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  let authorizationCode: string | null = null;
  let feesKobo: number | null = null;
  let billingEmail: string | null = null;
  let amountKobo: number | null = null;

  try {
    const result = await verifyPaystackPayment(reference);
    if (!result.paid) return NextResponse.json({ error: "Payment was not successful" }, { status: 402 });
    authorizationCode = result.authorizationCode;
    feesKobo           = result.feesKobo;
    billingEmail        = result.customerEmail;
    amountKobo          = result.amountKobo;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[verify-payment-method] verify failed ws=${workspaceId}:`, msg);
    return NextResponse.json({ error: `Payment verification failed: ${msg}` }, { status: 502 });
  }

  const nextRenewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.from("workspaces").update({
    plan_status:             "active",
    grace_ends_at:           null,
    subscription_renews_at:  nextRenewsAt,
    updated_at:              new Date().toISOString(),
    ...(authorizationCode ? { paystack_auth_code: authorizationCode } : {}),
    ...(billingEmail      ? { billing_email: billingEmail }           : {}),
  }).eq("id", workspaceId);

  await db.from("billing_invoices").insert({
    workspace_id:       workspaceId,
    type:               "plan_subscription",
    description:        "Plan subscription — card update",
    amount_kobo:         amountKobo ?? 0,
    fees_kobo:           feesKobo,
    paystack_reference:  reference,
    status:              "paid",
  });

  return NextResponse.json({ ok: true, nextRenewsAt });
}
