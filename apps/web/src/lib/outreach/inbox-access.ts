import type { SupabaseClient } from "@supabase/supabase-js";

export type InboxAccessResult =
  | { ok: true }
  | { ok: false; code: "trial_expired" | "inbox_limit" | "inbox_claimed"; message: string };

/**
 * Check whether a workspace is allowed to add a new inbox.
 *
 * Rules:
 * 1. Free plan: max 5 inboxes. Trial lasts 14 days from workspace creation.
 *    After trial expires, no new inboxes can be added and warmup is blocked.
 * 2. Paid plans: limited only by max_inboxes on the workspace row.
 * 3. An email address can only belong to one workspace at a time.
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
  // Load workspace limits + trial info
  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id, max_inboxes, trial_ends_at")
    .eq("id", workspaceId)
    .single();

  if (!ws) return { ok: false, code: "inbox_limit", message: "Workspace not found." };

  // ── 1. Trial check (free plan only) ────────────────────────────────────────
  if (ws.plan_id === "free" && ws.trial_ends_at) {
    const trialExpired = new Date(ws.trial_ends_at) < new Date();
    if (trialExpired) {
      return {
        ok: false,
        code: "trial_expired",
        message:
          "Your 14-day free trial has expired. Upgrade your plan to add inboxes and re-enable warmup.",
      };
    }
  }

  // ── 2. Inbox count limit ────────────────────────────────────────────────────
  if (ws.max_inboxes !== -1) {
    const { count } = await db
      .from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    const currentCount = count ?? 0;
    if (currentCount >= ws.max_inboxes) {
      return {
        ok: false,
        code: "inbox_limit",
        message: `You have reached the inbox limit (${ws.max_inboxes}) for your plan. Upgrade to add more.`,
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
 * Returns trial info for a free-plan workspace.
 * Used by the UI to display banners.
 */
export function getTrialStatus(workspace: {
  plan_id: string;
  trial_ends_at: string | null;
}): { onTrial: boolean; expired: boolean; daysLeft: number } {
  if (workspace.plan_id !== "free" || !workspace.trial_ends_at) {
    return { onTrial: false, expired: false, daysLeft: 0 };
  }
  const msLeft = new Date(workspace.trial_ends_at).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  return { onTrial: true, expired: daysLeft === 0, daysLeft };
}
