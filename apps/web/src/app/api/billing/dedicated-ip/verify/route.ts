/**
 * POST /api/billing/dedicated-ip/verify
 *
 * Called when user returns from Paystack checkout for dedicated IP.
 * Verifies payment and creates the subscription record in "pending" status.
 * Admin must then provision the IP via the admin panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { createAdminClient } from "@/lib/supabase/server";
import { getDedicatedIpPrice } from "@/lib/billing/dedicatedIpPrice";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const { reference } = await req.json() as { reference?: string };
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(reference);
  if (!paid) {
    return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });
  }

  const db = createAdminClient();

  // Idempotency — don't create a second subscription for the same reference
  const { data: existing } = await db
    .from("billing_invoices")
    .select("id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, already_processed: true });
  }

  const { priceNgn } = await getDedicatedIpPrice();

  // Create the subscription record in pending state
  const { data: sub } = await db
    .from("dedicated_ip_subscriptions")
    .insert({
      workspace_id:           workspaceId,
      status:                 "pending",
      ...(authorizationCode ? { paystack_auth_code:     authorizationCode } : {}),
      ...(customerCode      ? { paystack_customer_code: customerCode }      : {}),
      price_ngn:              priceNgn,
    })
    .select("id")
    .single();

  // Record invoice
  await db.from("billing_invoices").insert({
    workspace_id:       workspaceId,
    type:               "dedicated_ip",
    description:        "Dedicated IP add-on",
    amount_kobo:        priceNgn * 100,
    paystack_reference: reference,
    status:             "paid",
  });

  return NextResponse.json({ ok: true, subscription_id: sub?.id });
}
