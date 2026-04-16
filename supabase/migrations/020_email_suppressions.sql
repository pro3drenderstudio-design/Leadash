-- Global cross-workspace email suppression list.
-- Addresses here are never sent to regardless of which workspace tries to reach them.
-- Populated by: hard bounces, spam complaints, manual admin suppression.

CREATE TABLE IF NOT EXISTS email_suppressions (
  email               text        PRIMARY KEY,
  reason              text        NOT NULL DEFAULT 'hard_bounce',
  -- 'hard_bounce' | 'spam_complaint' | 'unsubscribe' | 'manual'
  source_workspace_id uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Only service role accesses this table (cross-workspace, never exposed via API to end users)
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON email_suppressions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
