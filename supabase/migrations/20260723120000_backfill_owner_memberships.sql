-- ─── Backfill workspace_members rows for legacy owner-only workspaces ─────
-- Some early workspaces were created with owner_id set but no matching
-- workspace_members row. Any code that walks membership (OAuth account
-- linking in /api/auth/callback, dashboards, invites) treated those owners
-- as workspace-less — the concrete symptom was an existing user signing in
-- with Google and being routed to onboarding, where they created a
-- duplicate workspace. Insert the missing owner rows. Idempotent.
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
  FROM workspaces w
 WHERE w.owner_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
   )
ON CONFLICT DO NOTHING;
