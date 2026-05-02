-- Fix warmup column defaults: start at 1/day (not 0) and target 30 (not 40)
ALTER TABLE outreach_inboxes
  ALTER COLUMN warmup_current_daily SET DEFAULT 1,
  ALTER COLUMN warmup_target_daily  SET DEFAULT 30;
