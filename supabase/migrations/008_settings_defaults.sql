-- ─── Outreach default settings ────────────────────────────────────────────────
-- Per-workspace defaults for new inboxes and campaigns.

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS default_daily_limit  int  DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_timezone     text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS default_send_start   text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS default_send_end     text DEFAULT '17:00';
