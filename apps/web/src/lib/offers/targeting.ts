/**
 * Offer targeting — a targeted offer (offers.is_targeted) is only visible and
 * purchasable to workspaces that have an active (non-expired) row in
 * offer_targets. Powers the sponsored bundle (auto-targeted to 7-day-challenge
 * enrollees for a window) and any admin-assigned "activate for user X" case.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The current user's primary workspace (first membership). */
export async function resolveUserWorkspaceId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

/**
 * True when the workspace has an active target for the offer — i.e. it has
 * started (starts_at is null or in the past) and has not expired. A target with
 * a future starts_at is dormant (e.g. the sponsored bundle before cohort go-live).
 */
export async function hasActiveOfferTarget(db: SupabaseClient, offerId: string, workspaceId: string | null): Promise<boolean> {
  if (!workspaceId) return false;
  const { data } = await db
    .from("offer_targets")
    .select("starts_at, expires_at")
    .eq("offer_id", offerId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return false;
  const { starts_at: start, expires_at: exp } = data as { starts_at: string | null; expires_at: string | null };
  const now = new Date();
  const started = !start || new Date(start) <= now;
  const unexpired = !exp || new Date(exp) > now;
  return started && unexpired;
}

/**
 * All active targeted offers for a workspace — drives the billing-page banner.
 * Returns starts_at so the UI can distinguish "unlocks soon" from a live countdown.
 */
export async function activeTargetedOffersForWorkspace(db: SupabaseClient, workspaceId: string): Promise<
  Array<{ offer_id: string; starts_at: string | null; expires_at: string | null }>
> {
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("offer_targets")
    .select("offer_id, starts_at, expires_at")
    .eq("workspace_id", workspaceId)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  return (data ?? []) as Array<{ offer_id: string; starts_at: string | null; expires_at: string | null }>;
}
