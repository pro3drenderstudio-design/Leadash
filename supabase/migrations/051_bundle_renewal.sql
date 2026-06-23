-- ── Migration 051: Bundle renewal lifecycle columns ─────────────────────────
-- Adds per-workspace columns needed to track the annual bundle subscription
-- separately from the main Leadash SaaS plan subscription.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS bundle_paystack_sub_code text,
  ADD COLUMN IF NOT EXISTS bundle_grace_ends_at      timestamptz;

-- Index for cron queries: find expiring bundles
CREATE INDEX IF NOT EXISTS workspaces_bundle_expires_idx
  ON workspaces (bundle_expires_at)
  WHERE bundle_expires_at IS NOT NULL;

-- Index for grace period expiry
CREATE INDEX IF NOT EXISTS workspaces_bundle_grace_idx
  ON workspaces (bundle_grace_ends_at)
  WHERE bundle_grace_ends_at IS NOT NULL;
