-- Add microsoft365 provider type to inboxes
ALTER TABLE outreach_inboxes
  DROP CONSTRAINT IF EXISTS outreach_inboxes_provider_check;
ALTER TABLE outreach_inboxes
  ADD CONSTRAINT outreach_inboxes_provider_check
    CHECK (provider IN ('gmail','outlook','smtp','postal','microsoft365'));

-- Add provisioning status for placeholder inboxes awaiting vendor
ALTER TABLE outreach_inboxes
  DROP CONSTRAINT IF EXISTS outreach_inboxes_status_check;
ALTER TABLE outreach_inboxes
  ADD CONSTRAINT outreach_inboxes_status_check
    CHECK (status IN ('active','paused','error','provisioning'));

-- Track inbox provider type on domains (default postal for all existing)
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS inbox_provider text NOT NULL DEFAULT 'postal';
ALTER TABLE outreach_domains
  DROP CONSTRAINT IF EXISTS outreach_domains_inbox_provider_check;
ALTER TABLE outreach_domains
  ADD CONSTRAINT outreach_domains_inbox_provider_check
    CHECK (inbox_provider IN ('postal','microsoft365'));

-- Microsoft tenant details populated by vendor when provisioning
-- { verification_txt, dkim_sel1_target, dkim_sel2_target }
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS ms_tenant_data jsonb;

-- Add provisioning status to domains
ALTER TABLE outreach_domains
  DROP CONSTRAINT IF EXISTS outreach_domains_status_check;
ALTER TABLE outreach_domains
  ADD CONSTRAINT outreach_domains_status_check
    CHECK (status IN ('pending','purchasing','dns_pending','verifying',
                      'provisioning','active','failed','payment_failed'));

-- Admin-adjustable Microsoft inbox monthly price in NGN (same pattern as inbox_monthly_price_ngn)
ALTER TABLE plan_configs
  ADD COLUMN IF NOT EXISTS ms_inbox_monthly_price_ngn integer NOT NULL DEFAULT 4200;

-- MX lookup cache to persist provider detection across Vercel invocations (24h TTL)
CREATE TABLE IF NOT EXISTS domain_provider_cache (
  domain      text PRIMARY KEY,
  provider    text CHECK (provider IN ('gmail','outlook')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS domain_provider_cache_expires_idx ON domain_provider_cache (expires_at);
