-- Add stop_on_auto_reply flag to campaigns.
-- When false (default): OOO / auto-replies do not stop the sequence.
-- When true: auto-replies are treated the same as real replies.
ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS stop_on_auto_reply boolean NOT NULL DEFAULT false;
