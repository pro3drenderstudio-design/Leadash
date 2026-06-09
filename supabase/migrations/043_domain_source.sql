-- Explicit domain source flag: who manages DNS for this domain?
-- 'leadash'  = purchased through Leadash, DNS in our Cloudflare zone — user cannot edit
-- 'external' = user's own domain connected to Leadash — user manages DNS at their provider
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS domain_source text NOT NULL DEFAULT 'external'
  CHECK (domain_source IN ('leadash', 'external'));

-- Backfill: domains with a price > $0 were purchased and provisioned through Leadash
UPDATE outreach_domains
  SET domain_source = 'leadash'
  WHERE COALESCE(domain_price_usd, 0) > 0;
