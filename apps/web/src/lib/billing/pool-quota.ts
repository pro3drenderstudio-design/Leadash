/**
 * Outreach leads pool quota helpers.
 *
 * The "outreach leads pool" is the outreach_leads table — leads imported for
 * sequences/campaigns. This is separate from lead_campaign_leads (scraping results).
 *
 * Each plan has a max_leads_pool quota. When a workspace exceeds that quota
 * (e.g. after a downgrade), active outreach campaigns are paused until the
 * workspace drops back under the limit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "@/lib/billing/plans";

export interface PoolQuotaStatus {
  used:      number;
  max:       number;   // -1 = unlimited
  overage:   number;   // 0 if within quota
  isOver:    boolean;
}

/**
 * Returns current pool usage vs. the workspace's plan quota.
 * Uses plan_configs table if available, falls back to hardcoded plans.ts.
 */
export async function getPoolQuotaStatus(
  db: SupabaseClient,
  workspaceId: string,
): Promise<PoolQuotaStatus> {
  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .single();

  const planId = (ws?.plan_id as string | null) ?? "free";
  const plan = getPlan(planId);

  const { data: planConfig } = await db
    .from("plan_configs")
    .select("max_leads_pool")
    .eq("plan_id", planId)
    .maybeSingle();

  const max: number = planConfig?.max_leads_pool ?? plan.maxLeadsPool;

  if (max < 0) {
    // Unlimited
    return { used: 0, max: -1, overage: 0, isOver: false };
  }

  const { count } = await db
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const used = count ?? 0;
  const overage = Math.max(0, used - max);
  return { used, max, overage, isOver: overage > 0 };
}

/**
 * Pauses all active outreach campaigns for a workspace and returns how many
 * were paused. Called on plan downgrade when pool quota is exceeded.
 */
export async function pauseCampaignsForPoolOverage(
  db: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { data, error } = await db
    .from("outreach_campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .select("id");

  if (error) {
    console.error("[pool-quota] pauseCampaignsForPoolOverage error:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
