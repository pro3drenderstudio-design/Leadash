-- ── 078: helper to look up a user id by email ────────────────────────────
-- Used by /api/admin/team/invite-check to decide whether an invitee already
-- has a Leadash auth account (steer to /login) or not (steer to /signup).
--
-- SECURITY DEFINER so the service role — and only the service role — can
-- resolve emails to user ids. We do NOT grant execute to anon/authenticated,
-- so this can't be used as an oracle to enumerate registered emails from
-- the client.

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- Lock down execute — only service_role (which bypasses grants) can call it.
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
