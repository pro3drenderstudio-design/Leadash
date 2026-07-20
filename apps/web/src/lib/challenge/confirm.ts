/**
 * Side-effects of confirming a challenge signup — shared by the admin confirm
 * route and the public Paystack auto-confirm path so both grant identically.
 *
 * Does two things (idempotent):
 *   1. Enrolls the user into the challenge product's currently-open (is_default)
 *      cohort. Content stays locked until that cohort goes live (cohort.starts_at).
 *   2. If a sponsored-offer trigger is configured (admin_settings.sponsored_offer_triggers),
 *      creates a time-windowed offer_target that is DORMANT until cohort go-live
 *      and expires window_days after go-live — because the offer is first
 *      announced in the Day-1 video, the countdown must start at go-live, not at
 *      confirmation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ConfirmSignup {
  user_id: string | null;
  workspace_id: string | null;
}

export async function applyChallengeConfirmation(
  db: SupabaseClient,
  opts: { signup: ConfirmSignup; createdBy?: string | null; productSlug?: string },
): Promise<{ workspaceId: string | null; cohortId: string | null; cohortStartsAt: string | null; offerTargeted: boolean }> {
  const productSlug = opts.productSlug ?? "challenge-7day";
  const signupUserId = opts.signup.user_id;

  // Resolve the enrollee's workspace. challenge_signups.workspace_id is usually
  // NULL — the real link is signup.user_id → workspaces.owner_id.
  let wsId = opts.signup.workspace_id;
  if (!wsId && signupUserId) {
    const { data: ws } = await db
      .from("workspaces")
      .select("id")
      .eq("owner_id", signupUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    wsId = (ws?.id as string) ?? null;
  }

  if (!signupUserId || !wsId) return { workspaceId: wsId, cohortId: null, cohortStartsAt: null, offerTargeted: false };

  // Resolve the product + its currently-open cohort.
  const { data: product } = await db
    .from("academy_products")
    .select("id")
    .eq("slug", productSlug)
    .single();
  if (!product) return { workspaceId: wsId, cohortId: null, cohortStartsAt: null, offerTargeted: false };

  // Self-heal the cohort schedule before enrolling — ensures the current
  // enrolling (is_default) cohort exists even if the hourly cron lagged, so a
  // confirmation always lands in the right cohort. Idempotent + advisory-locked.
  try { await db.rpc("run_cohort_scheduler"); }
  catch (e) { console.error("[challenge/confirm] scheduler self-heal error:", e instanceof Error ? e.message : e); }

  const { data: cohort } = await db
    .from("academy_cohorts")
    .select("id, starts_at")
    .eq("product_id", product.id)
    .eq("is_default", true)
    .maybeSingle();
  const cohortId = (cohort?.id as string) ?? null;
  const cohortStartsAt = (cohort?.starts_at as string | null) ?? null;

  // 1. Enroll into the challenge (academy_enrollments requires BOTH user_id and
  //    workspace_id NOT NULL). Locked until cohort go-live (cohort mode).
  const { error: enrollError } = await db.from("academy_enrollments").upsert({
    user_id:      signupUserId,
    workspace_id: wsId,
    product_id:   product.id,
    cohort_id:    cohortId,
    access_type:  "admin_granted",
    status:       "active",
    enrolled_at:  new Date().toISOString(),
  }, { onConflict: "user_id,product_id" });
  if (enrollError) console.error("[challenge/confirm] enroll error:", enrollError.message);

  // 2. Sponsored-offer trigger → dormant-until-go-live targeted offer.
  let offerTargeted = false;
  try {
    const { data: trigRow } = await db.from("admin_settings").select("value").eq("key", "sponsored_offer_triggers").maybeSingle();
    let triggers: Array<{ source_slug: string; offer_slug: string; window_days?: number }> = [];
    const raw = trigRow?.value;
    if (typeof raw === "string") triggers = JSON.parse(raw);
    else if (Array.isArray(raw)) triggers = raw as typeof triggers;
    const trig = triggers.find(t => t.source_slug === productSlug);
    if (trig) {
      const { data: offer } = await db.from("offers").select("id").eq("slug", trig.offer_slug).maybeSingle();
      if (offer) {
        const windowMs = (trig.window_days ?? 7) * DAY_MS;
        // Countdown starts at cohort go-live; if no cohort start yet, fall back
        // to "now" so the offer is at least visible (self-heals once a cohort exists).
        const startsAt = cohortStartsAt;
        const base = cohortStartsAt ? new Date(cohortStartsAt).getTime() : Date.now();
        const expiresAt = new Date(base + windowMs).toISOString();
        await db.from("offer_targets").upsert({
          offer_id:     offer.id,
          workspace_id: wsId,
          source:       `challenge:${productSlug}`,
          starts_at:    startsAt,
          expires_at:   expiresAt,
          created_by:   opts.createdBy ?? null,
        }, { onConflict: "offer_id,workspace_id" });
        offerTargeted = true;
      }
    }
  } catch (e) {
    console.error("[challenge/confirm] sponsored target error:", e instanceof Error ? e.message : e);
  }

  return { workspaceId: wsId, cohortId, cohortStartsAt: cohortStartsAt, offerTargeted };
}
