-- Add personalize_valid_only and source_campaign_id to lead_campaigns
ALTER TABLE lead_campaigns
  ADD COLUMN IF NOT EXISTS personalize_valid_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_campaign_id uuid REFERENCES lead_campaigns(id) ON DELETE SET NULL;
