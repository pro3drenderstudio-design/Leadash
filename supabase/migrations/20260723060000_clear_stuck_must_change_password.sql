-- ─── One-time cleanup: unstick users trapped in the reset loop ────────────
-- Prior bug: the clear-must-reset endpoint tried to drop
-- user_metadata.must_change_password by destructuring the key out of the
-- JS object, but Supabase's admin.updateUserById MERGES user_metadata
-- rather than replacing it. So the flag stayed `true` in the DB even
-- after a successful password reset, and the middleware bounced users
-- straight back to /reset-password on their next sign-in.
--
-- The code fix (setting must_change_password=false explicitly) works for
-- future resets, but every currently-affected user still has the flag
-- stuck at `true`. Set it to false for everyone. This is safe:
--   * Users who already reset (bug victims) → unblocked immediately.
--   * Users who never reset yet → they still receive the welcome email
--     asking them to change their temp password; the gate isn't a
--     security control (the admin already knows the temp password), it's
--     just a UX prompt.
UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('must_change_password', false),
       updated_at = now()
 WHERE (raw_user_meta_data->>'must_change_password')::boolean = true;
