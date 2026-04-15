-- ─── Dynamic plan configuration ───────────────────────────────────────────────
-- Replaces the hardcoded plans.ts values. Admin can edit these from the
-- dashboard and changes take effect sitewide (including Paystack sync).

CREATE TABLE IF NOT EXISTS plan_configs (
  plan_id                  text PRIMARY KEY,
  name                     text        NOT NULL,
  sort_order               integer     NOT NULL DEFAULT 0,
  -- Pricing
  price_ngn                integer     NOT NULL DEFAULT 0,
  price_usd                numeric(10,2) NOT NULL DEFAULT 0,
  paystack_plan_code       text,
  stripe_price_id          text,
  -- Limits (-1 = unlimited)
  max_inboxes              integer     NOT NULL DEFAULT -1,
  max_monthly_sends        integer     NOT NULL DEFAULT -1,
  max_seats                integer     NOT NULL DEFAULT 1,
  max_leads_pool           integer     NOT NULL DEFAULT 0,
  included_credits         integer     NOT NULL DEFAULT 0,
  trial_days               integer     NOT NULL DEFAULT 0,
  -- Domain inbox billing (per mailbox per month)
  inbox_monthly_price_ngn  integer     NOT NULL DEFAULT 0,
  -- Feature flags
  can_scrape_leads         boolean     NOT NULL DEFAULT false,
  can_run_campaigns        boolean     NOT NULL DEFAULT false,
  feat_warmup              boolean     NOT NULL DEFAULT true,
  feat_preview_leads       boolean     NOT NULL DEFAULT true,
  feat_ai_personalization  boolean     NOT NULL DEFAULT false,
  feat_ai_classification   boolean     NOT NULL DEFAULT false,
  feat_api_access          boolean     NOT NULL DEFAULT false,
  -- Visibility
  is_active                boolean     NOT NULL DEFAULT true,
  -- Audit
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES auth.users ON DELETE SET NULL
);

-- Seed from the current plans.ts values
INSERT INTO plan_configs (
  plan_id, name, sort_order,
  price_ngn, price_usd, paystack_plan_code, stripe_price_id,
  max_inboxes, max_monthly_sends, max_seats, max_leads_pool,
  included_credits, trial_days, inbox_monthly_price_ngn,
  can_scrape_leads, can_run_campaigns,
  feat_warmup, feat_preview_leads, feat_ai_personalization,
  feat_ai_classification, feat_api_access, is_active
) VALUES
  ('free',       'Free Trial',  0,      0,       0,     null, null,    5,   0,      1,  0,       0,       14, 0,     false, false, true,  true,  false, false, false, true),
  ('starter',    'Starter',     1,  15000,      10,     null, null,   -1,  -1,      3,  1000,   2000,      0, 2500,  true,  true,  true,  true,  true,  true,  false, true),
  ('growth',     'Growth',      2,  45000,      28,     null, null,   -1,  -1,     10, 10000,  20000,      0, 2500,  true,  true,  true,  true,  true,  true,  true,  true),
  ('scale',      'Scale',       3,  95000,      59,     null, null,   -1,  -1, 999999, 35000,  70000,      0, 2500,  true,  true,  true,  true,  true,  true,  true,  true),
  ('enterprise', 'Enterprise',  4, 250000,     156,     null, null,   -1,  -1, 999999, 150000, 300000,     0, 2500,  true,  true,  true,  true,  true,  true,  true,  true)
ON CONFLICT (plan_id) DO NOTHING;

-- RLS: admins manage via service role key (bypasses RLS).
-- Public read is fine since plan info is not sensitive.
ALTER TABLE plan_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_configs_public_read" ON plan_configs
  FOR SELECT USING (true);

CREATE POLICY "plan_configs_service_write" ON plan_configs
  FOR ALL USING (false);  -- blocked for anon/authenticated; service role bypasses
