/**
 * Award challenge points for a product action. Thin wrapper over the
 * award_challenge_points RPC — a no-op unless the caller is in an active,
 * live-cohort challenge. Fire-and-forget: never throws, never blocks the action.
 *
 * Weights + daily caps live in academy_products.challenge_config.points_rules.
 * `ref` is an optional idempotency key (e.g. a send_id) so retries/duplicates
 * don't double-score.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function awardChallengePoints(
  db: SupabaseClient,
  opts: { userId?: string | null; workspaceId?: string | null; action: string; ref?: string | null },
): Promise<void> {
  if (!opts.userId && !opts.workspaceId) return;
  try {
    await db.rpc("award_challenge_points", {
      p_user_id:      opts.userId ?? null,
      p_workspace_id: opts.workspaceId ?? null,
      p_action:       opts.action,
      p_ref:          opts.ref ?? null,
    });
  } catch (e) {
    console.error("[points] award error:", e instanceof Error ? e.message : e);
  }
}
