-- Add missing fields to lead_campaign_leads
ALTER TABLE lead_campaign_leads
  ADD COLUMN IF NOT EXISTS department        text,
  ADD COLUMN IF NOT EXISTS seniority         text,
  ADD COLUMN IF NOT EXISTS org_city          text,
  ADD COLUMN IF NOT EXISTS org_state         text,
  ADD COLUMN IF NOT EXISTS org_country       text,
  ADD COLUMN IF NOT EXISTS org_description   text,
  ADD COLUMN IF NOT EXISTS org_founded_year  text,
  ADD COLUMN IF NOT EXISTS org_size          text,
  ADD COLUMN IF NOT EXISTS org_linkedin_url  text;
