/**
 * Single source of truth for "is this workspace allowed to use the app right
 * now" — read by the paywall overlay (apps/web/src/components/BillingPaywall.tsx)
 * and the billing-reconcile cron (apps/web/src/app/api/cron/billing-reconcile/route.ts).
 *
 * Business rule: no free plan. Every workspace must be on a paid plan to use
 * the app — new signups land on plan_id "free" straight out of onboarding and
 * are expected to pick a plan immediately; there is no lingering free tier.
 * The one carve-out is the beta-tester perk (plan_id "starter" + a 30-day
 * trial_ends_at, no subscription_renews_at) — intentional, but still time-
 * boxed like everything else once the 30 days pass.
 */

export type AccessBlockReason = "past_due" | "canceled" | "trial_expired" | "no_plan" | null;

export interface BillingWorkspace {
  plan_id:               string;
  plan_status:           string;
  trial_ends_at:         string | null;
  grace_ends_at:         string | null;
  subscription_renews_at: string | null;
}

export interface BillingAccessStatus {
  allowed: boolean;
  reason:  AccessBlockReason;
}

export function getBillingAccessStatus(ws: BillingWorkspace): BillingAccessStatus {
  if (ws.plan_status === "past_due") {
    return { allowed: false, reason: "past_due" };
  }

  if (ws.plan_status === "canceled") {
    return { allowed: false, reason: "canceled" };
  }

  // No free plan — must be on a real paid plan.
  if (ws.plan_id === "free") {
    return { allowed: false, reason: "no_plan" };
  }

  // A beta enrollment grants plan_id "starter" + a 30-day trial_ends_at with no
  // subscription_renews_at (see claimBetaIfApproved in (app)/layout.tsx). A
  // workspace that actually paid always has subscription_renews_at set from
  // the real checkout — that's what distinguishes "still on a granted trial"
  // from "legitimately subscribed." Checked on any non-free plan_id, not just
  // "starter" — the same ungated-grant pattern can end up on any tier.
  const isUnconvertedTrial = !ws.subscription_renews_at && !!ws.trial_ends_at;
  if (isUnconvertedTrial) {
    if (new Date(ws.trial_ends_at as string) < new Date()) {
      return { allowed: false, reason: "trial_expired" };
    }
    return { allowed: true, reason: null }; // still within the granted trial window
  }

  return { allowed: true, reason: null };
}
