/**
 * Shared activation for a combined checkout (plan + managed inboxes, one
 * payment). Called by BOTH the Paystack webhook (type "combined_checkout") and
 * the eager-verify route the callback page hits — so the plan is active the
 * instant the user returns, not dependent on webhook latency. Idempotent: keyed
 * on the plan invoice's unique paystack_reference.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createPaystackSubscription, disablePaystackSubscription } from "@/lib/billing/paystack";
import { logActivity } from "@/lib/activity";
import { awardChallengePoints } from "@/lib/academy/points";

export interface CombinedActivationInput {
  reference:         string;
  workspaceId:       string;
  planId:            string;
  isAnnual:          boolean;
  domainIds:         string[];
  authorizationCode: string | null;
  customerCode:      string | null;
  customerEmail:     string | null;
  amountKobo:        number | null;
  feesKobo:          number | null;
}

export async function activateCombinedCheckout(
  db: SupabaseClient,
  opts: CombinedActivationInput,
): Promise<{ alreadyDone: boolean }> {
  // Idempotency — one plan invoice per reference. If it exists, another caller
  // (webhook or verify) already ran; do nothing.
  const { data: existingInv } = await db
    .from("billing_invoices")
    .select("id")
    .eq("paystack_reference", opts.reference)
    .maybeSingle();
  if (existingInv) return { alreadyDone: true };

  const plan = await getPlanById(opts.planId);
  const renewDays = opts.isAnnual ? 365 : 30;
  const renewAt = new Date(Date.now() + renewDays * 24 * 60 * 60 * 1000).toISOString();

  // 0. If this workspace already had a Paystack subscription (e.g. an existing
  //    subscriber going through combined checkout to change plans + add
  //    inboxes), disable it first so we don't end up billing two subscriptions.
  const { data: prevWs } = await db.from("workspaces").select("paystack_sub_code").eq("id", opts.workspaceId).single();
  const prevSubCode = prevWs?.paystack_sub_code as string | null | undefined;
  if (prevSubCode) {
    try {
      const res = await fetch(`https://api.paystack.co/subscription/${prevSubCode}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const json = await res.json() as { data?: { email_token?: string } };
      if (json.data?.email_token) await disablePaystackSubscription({ code: prevSubCode, emailToken: json.data.email_token });
    } catch (e) {
      console.error(`[combined] failed to disable prior subscription ws=${opts.workspaceId}:`, e instanceof Error ? e.message : e);
    }
  }

  // 1. Activate the plan (limits, credits).
  await db.from("workspaces").update({
    plan_id:                plan.plan_id,
    plan_status:            "active",
    trial_ends_at:          null,
    subscription_renews_at: renewAt,
    max_inboxes:            plan.max_inboxes,
    max_monthly_sends:      plan.max_monthly_sends,
    max_seats:              plan.max_seats,
    ...(opts.authorizationCode ? { paystack_auth_code:     opts.authorizationCode } : {}),
    ...(opts.customerCode      ? { paystack_customer_code: opts.customerCode }      : {}),
    updated_at:             new Date().toISOString(),
  }).eq("id", opts.workspaceId);

  // Challenge gamification: higher plan tiers score more (no-op outside a live cohort).
  await awardChallengePoints(db, {
    workspaceId: opts.workspaceId,
    action:      `plan_${plan.plan_id}`,
    ref:         `plan:${opts.workspaceId}:${plan.plan_id}`,
  });

  // Insert the plan invoice — this is the idempotency key.
  await db.from("billing_invoices").insert({
    workspace_id:       opts.workspaceId,
    type:               "plan_subscription",
    description:        `${plan.name} plan (${opts.isAnnual ? "annual" : "monthly"}) — combined checkout`,
    amount_kobo:        opts.amountKobo ?? (plan.price_ngn * 100),
    fees_kobo:          opts.feesKobo,
    paystack_reference: opts.reference,
    status:             "paid",
  });

  // Grant included monthly credits (guarded by a unique grant reference).
  if (plan.included_credits > 0) {
    const grantRef = `grant:${opts.reference}`;
    const { error: grantErr } = await db.from("lead_credit_transactions").insert({
      workspace_id: opts.workspaceId, type: "grant", amount: plan.included_credits,
      description: `Monthly credits — ${plan.name} plan`, paystack_reference: grantRef,
    });
    if (!grantErr) {
      const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", opts.workspaceId).single();
      await db.from("workspaces").update({
        lead_credits_balance:         (ws?.lead_credits_balance ?? 0) + plan.included_credits,
        subscription_credits_balance: plan.included_credits,
      }).eq("id", opts.workspaceId);
    }
  }

  // 2. Attach a native Paystack subscription starting next cycle (month-1/year-1
  //    already paid). Captures paystack_sub_code so renewals + failures ride the
  //    normal webhook path.
  const planCode = opts.isAnnual ? plan.paystack_plan_code_annual : plan.paystack_plan_code;
  if (opts.customerCode && planCode) {
    try {
      const { subscriptionCode } = await createPaystackSubscription({
        customerCode: opts.customerCode, planCode, startDate: renewAt,
      });
      if (subscriptionCode) {
        await db.from("workspaces").update({ paystack_sub_code: subscriptionCode }).eq("id", opts.workspaceId);
      }
    } catch (e) {
      console.error(`[combined] deferred subscription failed ws=${opts.workspaceId}:`, e instanceof Error ? e.message : e);
    }
  }

  // 3. Hand each domain to the inbox-billing cron (recurring hosting).
  const nextInboxBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const domainId of opts.domainIds) {
    await db.from("outreach_domains").update({
      ...(opts.authorizationCode ? { paystack_auth_code: opts.authorizationCode } : {}),
      paystack_billing_email:  opts.customerEmail ?? null,
      inbox_next_billing_date: nextInboxBilling,
    }).eq("id", domainId);
  }

  const { data: wsName } = await db.from("workspaces").select("name").eq("id", opts.workspaceId).single();
  await logActivity({
    workspace_id: opts.workspaceId, workspace_name: wsName?.name,
    type: "subscription_started", title: `Subscribed to ${plan.name} (combined)`,
    description: `${wsName?.name ?? opts.workspaceId} — ${plan.name} + ${opts.domainIds.length} domain(s) via Paystack`,
    metadata: { plan_id: opts.planId, reference: opts.reference, domains: opts.domainIds.length },
  });

  return { alreadyDone: false };
}
