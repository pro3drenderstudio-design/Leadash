/**
 * POST /api/billing/verify
 *
 * Called immediately when the user returns from Paystack checkout.
 * Verifies the payment reference and upgrades the workspace plan on the spot,
 * so the upgrade is instant without waiting for the webhook.
 * Idempotent — safe to call multiple times for the same reference.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment, disablePaystackSubscription } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const db = createAdminClient();

  // 10 verify calls per hour per workspace
  const allowed = await checkRateLimit(db, `verify:${workspaceId}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { reference, plan_id } = await req.json() as { reference?: string; plan_id?: string };
  if (!reference || !plan_id) {
    return NextResponse.json({ error: "reference and plan_id are required" }, { status: 400 });
  }

  const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(reference);
  if (!paid) {
    return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });
  }

  const plan = await getPlanById(plan_id);

  // Read current workspace state before upgrading so we can cancel any existing subscription
  const { data: currentWs } = await db
    .from("workspaces")
    .select("paystack_sub_code, plan_id")
    .eq("id", workspaceId)
    .single();

  // Upsert plan — idempotent, webhook may have already done this
  await db.from("workspaces").update({
    plan_id:                plan.plan_id,
    plan_status:            "active",
    trial_ends_at:          null,
    subscription_renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    max_inboxes:            plan.max_inboxes,
    max_monthly_sends:      plan.max_monthly_sends,
    max_seats:              plan.max_seats,
    ...(authorizationCode ? { paystack_auth_code:      authorizationCode } : {}),
    ...(customerCode      ? { paystack_customer_code:  customerCode }      : {}),
    updated_at:             new Date().toISOString(),
  }).eq("id", workspaceId);

  // Record invoice — upsert so webhook duplicate is silently ignored.
  // Returns the row only when newly inserted; returns nothing on conflict.
  const { data: newInvoice } = await db.from("billing_invoices").upsert({
    workspace_id:       workspaceId,
    type:               "plan_subscription",
    description:        `${plan.name} plan subscription`,
    amount_kobo:        plan.price_ngn * 100,
    paystack_reference: reference,
    status:             "paid",
  }, { onConflict: "paystack_reference", ignoreDuplicates: true }).select("id");

  // Grant included credits only when invoice was newly created here.
  // If webhook already processed this reference, newInvoice will be empty.
  if (plan.included_credits > 0 && newInvoice && newInvoice.length > 0) {
    const { data: ws } = await db.from("workspaces")
      .select("lead_credits_balance, subscription_credits_balance")
      .eq("id", workspaceId).single();
    if (ws) {
      await db.from("workspaces").update({
        lead_credits_balance:         (ws.lead_credits_balance ?? 0) + plan.included_credits,
        subscription_credits_balance: plan.included_credits,
      }).eq("id", workspaceId);
    }
    await db.from("lead_credit_transactions").insert({
      workspace_id: workspaceId,
      type:         "grant",
      amount:       plan.included_credits,
      description:  `Monthly credits — ${plan.name} plan`,
    });
  }

  // If the workspace was on a different paid plan, cancel the old Paystack subscription
  // so the user isn't billed twice. Fire-and-forget — failure is logged, not fatal.
  const oldSubCode = currentWs?.paystack_sub_code;
  if (oldSubCode && currentWs?.plan_id !== plan.plan_id) {
    (async () => {
      try {
        const res = await fetch(
          `https://api.paystack.co/subscription/${oldSubCode}`,
          { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(8000) },
        );
        const json = await res.json() as { data?: { email_token?: string } };
        const emailToken = json.data?.email_token;
        if (emailToken) {
          await disablePaystackSubscription({ code: oldSubCode, emailToken });
          await db.from("workspaces").update({ paystack_sub_code: null }).eq("id", workspaceId);
        }
      } catch (e) {
        console.error("[billing/verify] Failed to cancel old subscription:", e);
      }
    })().catch(() => {});
  }

  return NextResponse.json({ ok: true, plan_id: plan.plan_id, plan_name: plan.name });
}
