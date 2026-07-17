-- Offer targeting: show an offer to only specific workspaces, optionally within
-- a time window. Powers the sponsored bundle (visible to 7-day-challenge
-- enrollees for 7 days) and any future "activate this offer for user X" case.
-- Also adds a custom sales-page config blob for bespoke landing pages.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_targeted boolean NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS sales_page jsonb;

CREATE TABLE IF NOT EXISTS offer_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source       text NOT NULL,          -- 'challenge:<slug>' | 'manual' | 'course:<id>'
  expires_at   timestamptz,            -- NULL = no expiry
  created_by   uuid,                   -- admin user, or NULL for system
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS offer_targets_ws_idx ON offer_targets (workspace_id, expires_at);

ALTER TABLE offer_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_targets_member_read ON offer_targets;
CREATE POLICY offer_targets_member_read ON offer_targets FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
