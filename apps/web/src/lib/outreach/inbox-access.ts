import type { SupabaseClient } from "@supabase/supabase-js";

export type InboxAccessResult =
  | { ok: true }
  | { ok: false; code: "trial_expired" | "inbox_limit" | "inbox_claimed"; message: string };

/**
 * Check whether a workspace is allowed to add a new inbox.
 *
 * Rules:
 * 1. Free plan: bounded by `max_inboxes` on the workspace row (default 3).
 * 2. Paid plans: limited only by max_inboxes on the workspace row.
 * 3. An email address can only belong to one workspace at a time.
 *
 * The legacy 14-day trial system has been discontinued — `trial_ends_at`
 * is kept on the table for back-compat but is no longer used as a gate.
 * The `trial_expired` error code is preserved in the union for callers
 * that still reference it; nothing in this function emits it anymore.
 *
 * @param db           Admin Supabase client (bypasses RLS)
 * @param workspaceId  The workspace trying to add the inbox
 * @param emailAddress Optional — if provided, checks cross-workspace uniqueness
 */
export async function checkInboxAccess(
  db: SupabaseClient,
  workspaceId: string,
  emailAddress?: string,
): Promise<InboxAccessResult> {
  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id, plan_status, max_inboxes")
    .eq("id", workspaceId)
    .single();

  if (!ws) return { ok: false, code: "inbox_limit", message: "Workspace not found." };

  // ── 1b. Past-due grace period — block new inbox adds ───────────────────────
  if ((ws as Record<string, unknown>).plan_status === "past_due") {
    return {
      ok: false,
      code: "inbox_limit",
      message: "Your account has a past-due payment. Resolve your billing to add new inboxes.",
    };
  }

  // ── 2. Inbox count limit (count only active + paused; errored inboxes don't
  //        occupy a real sending slot so shouldn't block adding a working one) ──
  if (ws.max_inboxes !== -1) {
    const [{ count }, { data: entitlements }] = await Promise.all([
      db
        .from("outreach_inboxes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .in("status", ["active", "paused", "warming"]),
      db
        .from("workspace_entitlements")
        .select("quantity")
        .eq("workspace_id", workspaceId)
        .eq("entitlement_type", "inbox_credit")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString()),
    ]);

    const bonusInboxes = (entitlements ?? []).reduce((sum, e) => sum + (e.quantity ?? 0), 0);
    const effectiveLimit = ws.max_inboxes + bonusInboxes;
    const currentCount = count ?? 0;

    if (currentCount >= effectiveLimit) {
      return {
        ok: false,
        code: "inbox_limit",
        message: `You have reached the inbox limit (${effectiveLimit}) for your plan. Upgrade to add more.`,
      };
    }
  }

  // ── 3. Cross-workspace uniqueness ──────────────────────────────────────────
  if (emailAddress) {
    const { data: existing } = await db
      .from("outreach_inboxes")
      .select("workspace_id")
      .eq("email_address", emailAddress)
      .neq("workspace_id", workspaceId)
      .maybeSingle();

    if (existing) {
      return {
        ok: false,
        code: "inbox_claimed",
        message:
          "This email address is already connected to another account. Remove it from that account first, or contact support.",
      };
    }
  }

  return { ok: true };
}

/**
 * Returns trial info for a workspace.
 *
 * The trial program has been discontinued — this helper now always returns
 * "no trial" regardless of the legacy `trial_ends_at` value. Kept as a stub
 * so any remaining callers compile cleanly while we migrate them off; once
 * no consumers remain, this can be deleted.
 */
export function getTrialStatus(_workspace: {
  plan_id: string;
  trial_ends_at: string | null;
}): { onTrial: boolean; expired: boolean; daysLeft: number } {
  return { onTrial: false, expired: false, daysLeft: 0 };
}
