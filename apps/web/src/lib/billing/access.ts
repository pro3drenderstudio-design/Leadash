/**
 * Single source of truth for "is this workspace allowed to use the app right
 * now" — read by the paywall overlay (apps/web/src/components/BillingPaywall.tsx)
 * and the billing-reconcile cron (apps/web/src/app/api/cron/billing-reconcile/route.ts).
 *
 * Business rule: every new workspace gets a 14-day free trial on plan_id
 * "free" — full page access with limits (2 inboxes, 2,000-lead pool, can build
 * sequences but not activate them). The trial is allowed while trial_ends_at is
 * in the future; once it lapses (or a workspace is on "free" with no trial),
 * the paywall shows and they must pick a plan. Paid plans (with
 * subscription_renews_at) are always allowed. The beta perk (a non-free plan +
 * trial_ends_at, no subscription_renews_at) still works the same way.
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

  // Free plan = the 14-day trial. Allowed while the trial window is open; once
  // it lapses (or there's no trial window at all), show the pick-a-plan wall.
  if (ws.plan_id === "free") {
    if (ws.trial_ends_at && new Date(ws.trial_ends_at) > new Date()) {
      return { allowed: true, reason: null };
    }
    return { allowed: false, reason: ws.trial_ends_at ? "trial_expired" : "no_plan" };
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
