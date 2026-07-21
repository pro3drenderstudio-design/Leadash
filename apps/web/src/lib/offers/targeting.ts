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
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

/**
 * Every workspace the user belongs to — as a MEMBER *or* as the OWNER. Owners
 * usually also have a member row, but relying on membership alone is fragile
 * (the owner is authoritative via workspaces.owner_id), so we union both.
 */
export async function userWorkspaceIds(db: SupabaseClient, userId: string): Promise<string[]> {
  const [members, owned] = await Promise.all([
    db.from("workspace_members").select("workspace_id").eq("user_id", userId),
    db.from("workspaces").select("id").eq("owner_id", userId),
  ]);
  const ids = new Set<string>();
  for (const m of (members.data ?? []) as { workspace_id: string }[]) ids.add(m.workspace_id);
  for (const w of (owned.data ?? []) as { id: string }[]) ids.add(w.id);
  return [...ids];
}

/**
 * The active target row for this offer across ANY of the user's workspaces, or
 * null. Checking every workspace (not just the "first" one) is what makes a
 * sponsored offer reachable regardless of which workspace the user is currently
 * in — the offer_target is attached to their challenge workspace, which may not
 * be their first membership. Active/expiry is evaluated in JS (rather than a
 * chained PostgREST `.or()`) to keep it robust.
 */
export async function activeTargetForUser(
  db: SupabaseClient,
  offerId: string,
  userId: string,
): Promise<{ starts_at: string | null; expires_at: string | null } | null> {
  const wsIds = await userWorkspaceIds(db, userId);
  if (wsIds.length === 0) return null;
  const { data } = await db
    .from("offer_targets")
    .select("starts_at, expires_at")
    .eq("offer_id", offerId)
    .in("workspace_id", wsIds);

  const now = Date.now();
  const active = ((data ?? []) as { starts_at: string | null; expires_at: string | null }[]).filter(
    (t) =>
      (!t.starts_at || new Date(t.starts_at).getTime() <= now) &&
      (!t.expires_at || new Date(t.expires_at).getTime() > now),
  );
  if (active.length === 0) return null;
  // Prefer the latest-expiring window.
  active.sort((a, b) => (b.expires_at ? new Date(b.expires_at).getTime() : Infinity) - (a.expires_at ? new Date(a.expires_at).getTime() : Infinity));
  return active[0];
}

/** True when any of the user's workspaces has an active target for the offer. */
export async function hasActiveOfferTargetForUser(db: SupabaseClient, offerId: string, userId: string): Promise<boolean> {
  return (await activeTargetForUser(db, offerId, userId)) !== null;
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
