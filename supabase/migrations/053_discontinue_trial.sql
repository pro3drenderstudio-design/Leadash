-- ── 053: Discontinue the 14-day free trial program ────────────────────────────
-- The trial gave new sign-ups subscription-level access for 14 days. Going
-- forward, users sign up directly to the free plan, pay for credits as they
-- need them, and upgrade to a subscription when they want subscription-gated
-- features (more inboxes, warmup, AI, etc.).
--
-- This migration grandfathers existing free-plan workspaces:
--   - Clears trial_ends_at so legacy gates (e.g. inbox-access) stop tripping.
--   - Moves plan_status from 'trialing' to 'active' so back-compat queries
--     that filter on plan_status don't continue to report trial accounts.
--
-- Paid plans are deliberately untouched — they may still have a stale
-- trial_ends_at from before they upgraded, and a non-null value there is
-- harmless (no code paths read it from a paid plan).

UPDATE public.workspaces
SET
  trial_ends_at = NULL,
  plan_status   = 'active'
WHERE plan_id = 'free'
  AND (trial_ends_at IS NOT NULL OR plan_status = 'trialing');

-- Reload PostgREST so the API picks up the change immediately.
NOTIFY pgrst, 'reload schema';
