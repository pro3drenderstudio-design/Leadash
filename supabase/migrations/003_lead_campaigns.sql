-- ─── Lead Generation Campaigns ───────────────────────────────────────────────

-- Extend workspaces with lead credits balance
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS lead_credits_balance integer NOT NULL DEFAULT 0;

-- Extend workspace_settings for third-party API keys
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS apify_api_key text,
  ADD COLUMN IF NOT EXISTS reoon_api_key text;

-- Lead generation campaigns (job tracking)
CREATE TABLE IF NOT EXISTS lead_campaigns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  mode                 text NOT NULL CHECK (mode IN ('scrape','verify_personalize','full_suite')),
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','running','completed','failed','cancelled')),
  -- Scrape config
  apify_actor_id       text,
  apify_run_id         text,
  apify_input          jsonb,
  -- Verify+Personalize source
  source_list_id       uuid REFERENCES outreach_lists(id) ON DELETE SET NULL,
  verify_enabled       boolean NOT NULL DEFAULT false,
  personalize_enabled  boolean NOT NULL DEFAULT false,
  personalize_prompt   text,
  -- Limits & progress
  max_leads            integer NOT NULL DEFAULT 100,
  total_scraped        integer NOT NULL DEFAULT 0,
  total_verified       integer NOT NULL DEFAULT 0,
  total_personalized   integer NOT NULL DEFAULT 0,
  total_valid          integer NOT NULL DEFAULT 0,
  -- Credits
  credits_reserved     integer NOT NULL DEFAULT 0,
  credits_used         integer NOT NULL DEFAULT 0,
  -- Meta
  error_message        text,
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lc_workspace ON lead_campaigns(workspace_id, created_at DESC);

-- Credit ledger (created after lead_campaigns so FK works)
CREATE TABLE IF NOT EXISTS lead_credit_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amount           integer NOT NULL,  -- positive=credit, negative=debit
  type             text NOT NULL CHECK (type IN ('grant','purchase','reserve','consume','refund')),
  description      text,
  lead_campaign_id uuid REFERENCES lead_campaigns(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lct_workspace ON lead_credit_transactions(workspace_id, created_at DESC);

-- Leads produced by a campaign
CREATE TABLE IF NOT EXISTS lead_campaign_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id         uuid NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  email               text NOT NULL,
  first_name          text,
  last_name           text,
  company             text,
  title               text,
  website             text,
  linkedin_url        text,
  phone               text,
  location            text,
  industry            text,
  -- Verification
  verification_status text CHECK (verification_status IN
                        ('pending','valid','invalid','catch_all','disposable','unknown')),
  verification_score  float4,
  -- Personalization
  personalized_line   text,
  -- Export tracking
  added_to_list_id    uuid REFERENCES outreach_lists(id) ON DELETE SET NULL,
  added_at            timestamptz,
  raw_data            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lcl_campaign ON lead_campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lcl_workspace ON lead_campaign_leads(workspace_id);
