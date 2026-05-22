-- Cap daily_send_limit at 40 (hard max) and set all inboxes to 30 (default).
-- Also caps warmup_target_daily so ramp targets can't exceed the hard max.

-- Set all existing inboxes to 30 sends/day
UPDATE outreach_inboxes SET daily_send_limit = 30;
UPDATE outreach_inboxes SET warmup_target_daily = LEAST(warmup_target_daily, 40);

-- Schema defaults
ALTER TABLE outreach_inboxes ALTER COLUMN daily_send_limit SET DEFAULT 30;

-- Hard ceiling enforced at DB level
ALTER TABLE outreach_inboxes
  ADD CONSTRAINT outreach_inboxes_daily_send_limit_max CHECK (daily_send_limit <= 40);
