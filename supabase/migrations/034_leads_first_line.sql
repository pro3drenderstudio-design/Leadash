-- Add AI-generated first line to leads
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS first_line text;
