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
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const { reference, plan_id } = await req.json() as { reference?: string; plan_id?: string };
  if (!reference || !plan_id) {
    return NextResponse.json({ error: "reference and plan_id are required" }, { status: 400 });
  }

  const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(reference);
  if (!paid) {
    return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });
  }

  const plan = await getPlanById(plan_id);
  const db   = createAdminClient();

  // Upsert plan — idempotent, webhook may have already done this
  await db.from("workspaces").update({
    plan_id:           plan.plan_id,
    plan_status:       "active",
    max_inboxes:       plan.max_inboxes,
    max_monthly_sends: plan.max_monthly_sends,
    max_seats:         plan.max_seats,
    ...(authorizationCode ? { paystack_auth_code:      authorizationCode } : {}),
    ...(customerCode      ? { paystack_customer_code:  customerCode }      : {}),
    updated_at:        new Date().toISOString(),
  }).eq("id", workspaceId);

  // Record invoice (ignore duplicate if webhook already wrote it)
  await db.from("billing_invoices").upsert({
    workspace_id:       workspaceId,
    type:               "plan_subscription",
    description:        `${plan.name} plan subscription`,
    amount_kobo:        plan.price_ngn * 100,
    paystack_reference: reference,
    status:             "paid",
  }, { onConflict: "paystack_reference", ignoreDuplicates: true });

  // Grant included credits if not already granted (check for existing grant transaction)
  if (plan.included_credits > 0) {
    const { data: existing } = await db.from("lead_credit_transactions")
      .select("id").eq("workspace_id", workspaceId)
      .eq("description", `Monthly credits — ${plan.name} plan`)
      .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()) // within last 5 min
      .maybeSingle();

    if (!existing) {
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
  }

  return NextResponse.json({ ok: true, plan_id: plan.plan_id, plan_name: plan.name });
}
