-- Add domain_price_usd column to outreach_domains
-- Stores the Porkbun registration price (without service fee) for cost validation

ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS domain_price_usd numeric;
