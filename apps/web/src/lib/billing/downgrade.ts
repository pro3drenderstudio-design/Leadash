/**
 * Shared helper for downgrading a workspace to the free plan.
 *
 * On downgrade:
 *   - Plan set to free with its limits
 *   - plan_status = "canceled", grace_ends_at cleared
 *   - Subscription credits expire (they don't roll over)
 *   - Purchased credits are preserved
 *   - All active campaigns paused
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { pauseCampaignsForPoolOverage } from "@/lib/billing/pool-quota";

export async function downgradeWorkspaceToFree(
  db: SupabaseClient,
  workspaceId: string,
  reason = "subscription_ended",
): Promise<{ paused: number; creditsExpired: number }> {
  const freePlan = await getPlanById("free");

  // Fetch current credit balances
  const { data: ws } = await db
    .from("workspaces")
    .select("lead_credits_balance, subscription_credits_balance")
    .eq("id", workspaceId)
    .single();

  // Purchased credits = total minus the subscription allocation
  const subCredits       = ws?.subscription_credits_balance ?? 0;
  const totalCredits     = ws?.lead_credits_balance ?? 0;
  const purchasedCredits = Math.max(0, totalCredits - subCredits);

  // Downgrade plan + expire subscription credits, keep purchased credits
  await db.from("workspaces").update({
    plan_id:                      "free",
    plan_status:                  "canceled",
    paystack_sub_code:            null,
    grace_ends_at:                null,
    max_inboxes:                  freePlan.max_inboxes,
    max_monthly_sends:            freePlan.max_monthly_sends,
    max_seats:                    freePlan.max_seats,
    lead_credits_balance:         purchasedCredits,
    subscription_credits_balance: 0,
    updated_at:                   new Date().toISOString(),
  }).eq("id", workspaceId);

  // Record credit expiry transaction if there were sub credits to expire
  if (subCredits > 0) {
    await db.from("lead_credit_transactions").insert({
      workspace_id: workspaceId,
      type:         "consume",
      amount:       -subCredits,
      description:  `Subscription credits expired — ${reason}`,
    });
  }

  // Pause all active campaigns
  const paused = await pauseCampaignsForPoolOverage(db, workspaceId);

  return { paused, creditsExpired: subCredits };
}
