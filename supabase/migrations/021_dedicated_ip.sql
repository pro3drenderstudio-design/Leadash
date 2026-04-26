-- ── Dedicated IP subscriptions ──────────────────────────────────────────────
-- Tracks which workspaces have paid for a dedicated sending IP add-on.
-- Provisioning is manual: admin sets ip_address + postal_pool_id via admin panel.
CREATE TABLE dedicated_ip_subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'cancelling', 'cancelled')),
  ip_address              text,
  postal_pool_id          text,
  paystack_sub_code       text,
  paystack_auth_code      text,
  paystack_customer_code  text,
  max_domains             int         NOT NULL DEFAULT 10,
  max_inboxes             int         NOT NULL DEFAULT 50,
  price_ngn               int         NOT NULL DEFAULT 78400,
  notes                   text,
  cancel_requested_at     timestamptz,
  retire_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON dedicated_ip_subscriptions (workspace_id);
CREATE INDEX ON dedicated_ip_subscriptions (status);

ALTER TABLE dedicated_ip_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view their dedicated ip sub"
  ON dedicated_ip_subscriptions FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- ── Blacklist check history ──────────────────────────────────────────────────
-- One row per daily DNS blacklist check run per subscription.
CREATE TABLE dedicated_ip_blacklist_checks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid        NOT NULL REFERENCES dedicated_ip_subscriptions(id) ON DELETE CASCADE,
  checked_at       timestamptz NOT NULL DEFAULT now(),
  blacklists_checked text[]    NOT NULL DEFAULT '{}',
  blacklists_hit     text[]    NOT NULL DEFAULT '{}',
  is_clean           boolean   NOT NULL DEFAULT true,
  raw_results        jsonb
);

CREATE INDEX ON dedicated_ip_blacklist_checks (subscription_id, checked_at DESC);

ALTER TABLE dedicated_ip_blacklist_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view their blacklist checks"
  ON dedicated_ip_blacklist_checks FOR SELECT
  USING (subscription_id IN (
    SELECT id FROM dedicated_ip_subscriptions
    WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));

-- ── Link domains to a dedicated IP subscription ──────────────────────────────
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS dedicated_ip_subscription_id uuid
    REFERENCES dedicated_ip_subscriptions(id) ON DELETE SET NULL;
