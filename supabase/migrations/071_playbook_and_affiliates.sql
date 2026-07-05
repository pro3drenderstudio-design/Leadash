-- Ensure is_admin() helper exists (may have been created manually in prod DB)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
$$;

-- ── Playbook: ICP profiles ────────────────────────────────────────────────────

CREATE TABLE workspace_icps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT 'My ICP',
  industry        text,
  company_size    text,
  geography       text,
  roles           text,
  pains           text[] NOT NULL DEFAULT '{}',
  goals           text[] NOT NULL DEFAULT '{}',
  triggers        text[] NOT NULL DEFAULT '{}',
  objections      text[] NOT NULL DEFAULT '{}',
  tone            text,
  linked_list_ids uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_icps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_icps_member" ON workspace_icps FOR ALL USING (is_workspace_member(workspace_id));

-- ── Playbook: Offer templates ─────────────────────────────────────────────────

CREATE TABLE workspace_offer_templates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                      text NOT NULL DEFAULT 'My Offer',
  price_label               text,
  what                      text,
  value_prop                text,
  proof                     text,
  guarantee                 text,
  case_snippets             text[] NOT NULL DEFAULT '{}',
  cta_kind                  text NOT NULL DEFAULT 'book_call'
                              CHECK (cta_kind IN ('book_call', 'reply', 'link')),
  cta_label                 text,
  linked_checkout_offer_id  uuid REFERENCES offers(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_offer_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_offer_templates_member" ON workspace_offer_templates FOR ALL USING (is_workspace_member(workspace_id));

-- Track which ICP/offer template was used to generate a campaign's sequence
ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS icp_id              uuid REFERENCES workspace_icps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_template_id   uuid REFERENCES workspace_offer_templates(id) ON DELETE SET NULL;

-- ── Affiliate program ─────────────────────────────────────────────────────────

-- One affiliate record per workspace (auto-enrolled on first visit)
CREATE TABLE affiliates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  handle              text NOT NULL UNIQUE,  -- e.g. "malik20", used in /r/[handle]
  tier                text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold')),
  clicks              integer NOT NULL DEFAULT 0,
  signups             integer NOT NULL DEFAULT 0,
  paid_referrals      integer NOT NULL DEFAULT 0,
  bank_name           text,
  bank_account_number text,
  bank_account_name   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliates_own"   ON affiliates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "affiliates_update" ON affiliates FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "affiliates_admin"  ON affiliates FOR ALL USING (is_admin());

-- Attribution: track the affiliate that referred a workspace at signup
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL;

-- Each referred user/workspace
CREATE TABLE referrals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id          uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  source                text NOT NULL DEFAULT 'link' CHECK (source IN ('cookie','link')),
  first_paid_at         timestamptz,
  status                text NOT NULL DEFAULT 'lead'
                          CHECK (status IN ('lead','paid','churned','refunded')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_own"   ON referrals FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "referrals_admin" ON referrals FOR ALL USING (is_admin());

-- Commission events (written by Paystack webhook on charge.success)
CREATE TABLE commission_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referral_id         uuid NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('bounty','recurring')),
  amount_ngn          numeric(12,2) NOT NULL,
  source_payment_ref  text NOT NULL,
  holds_until         timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','available','paid','reversed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_payment_ref, kind)  -- idempotency: one commission per payment+kind
);

ALTER TABLE commission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_events_own"   ON commission_events FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "commission_events_admin" ON commission_events FOR ALL USING (is_admin());

-- Payouts
CREATE TABLE affiliate_payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount_ngn   numeric(12,2) NOT NULL,
  method       text NOT NULL CHECK (method IN ('bank','credit')),
  credit_multiplier numeric(4,2),
  destination  jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','processing','paid','held')),
  fraud_flag   boolean NOT NULL DEFAULT false,
  batch_id     uuid,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_payouts_own"   ON affiliate_payouts FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "affiliate_payouts_admin" ON affiliate_payouts FOR ALL USING (is_admin());

-- Fraud flags
CREATE TABLE fraud_flags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('self_referral','low_quality','velocity')),
  evidence     jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cleared','confirmed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fraud_flags_admin" ON fraud_flags FOR ALL USING (is_admin());
