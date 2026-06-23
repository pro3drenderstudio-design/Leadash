-- ── 046: Funnel tracking, workspace entitlements ─────────────────────────────
-- Adds funnel UTM + WhatsApp columns to workspaces, creates funnel_states for
-- per-user funnel progress, and workspace_entitlements for the 250k bundle
-- inbox credit.

-- ── 1. Workspace columns ─────────────────────────────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS whatsapp_number          text,
  ADD COLUMN IF NOT EXISTS utm_source               text,
  ADD COLUMN IF NOT EXISTS utm_medium               text,
  ADD COLUMN IF NOT EXISTS utm_campaign             text,
  ADD COLUMN IF NOT EXISTS utm_content              text,
  ADD COLUMN IF NOT EXISTS utm_term                 text,
  ADD COLUMN IF NOT EXISTS funnel_entry_at          timestamptz,
  ADD COLUMN IF NOT EXISTS bundle_expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS bundle_paystack_sub_code text;

-- ── 2. funnel_states ─────────────────────────────────────────────────────────
-- One row per user. Tracks position and key timestamps across the entire funnel.
CREATE TABLE IF NOT EXISTS funnel_states (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Single 30-day offer window: starts at challenge purchase, ends 30 days later.
  -- 250k bundle is visible only after day1_completed_at IS NOT NULL AND now() < bundle_offer_expires_at
  bundle_offer_expires_at timestamptz,

  -- Free training video tracking (not an academy enrollment, so stored here)
  free_video_watch_pct    int         NOT NULL DEFAULT 0
                          CHECK (free_video_watch_pct BETWEEN 0 AND 100),
  free_video_last_watched timestamptz,

  -- Funnel progression timestamps
  challenge_enrolled_at   timestamptz,
  day1_completed_at       timestamptz,
  upsell_shown_at         timestamptz,
  upsell_purchased_at     timestamptz,

  -- Current offer state — kept in sync with the timer and purchase events
  current_offer           text        CHECK (
    current_offer IN ('challenge', 'bundle_250k', 'standard', 'expired')
  ),

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS funnel_states_workspace_idx
  ON funnel_states (workspace_id);

CREATE INDEX IF NOT EXISTS funnel_states_bundle_offer_idx
  ON funnel_states (bundle_offer_expires_at)
  WHERE bundle_offer_expires_at IS NOT NULL;

ALTER TABLE funnel_states ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own row; admins have full access
CREATE POLICY "funnel_states_own"
  ON funnel_states FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "funnel_states_admin"
  ON funnel_states
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_funnel_states_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER funnel_states_updated_at
  BEFORE UPDATE ON funnel_states
  FOR EACH ROW EXECUTE FUNCTION update_funnel_states_updated_at();

-- ── 3. workspace_entitlements ─────────────────────────────────────────────────
-- Tracks inbox credits granted with the 250k bundle. The inbox billing cron
-- checks this table before charging any inbox in a workspace.
CREATE TABLE IF NOT EXISTS workspace_entitlements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entitlement_type text        NOT NULL CHECK (entitlement_type IN ('inbox_credit')),
  -- Max inboxes covered (oldest N inboxes by created_at are covered first)
  quantity         int         NOT NULL CHECK (quantity > 0),
  expires_at       timestamptz NOT NULL,
  source           text        NOT NULL, -- '250k_bundle'
  source_reference text,                 -- Paystack subscription code
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entitlements_workspace_idx
  ON workspace_entitlements (workspace_id);

CREATE INDEX IF NOT EXISTS entitlements_active_idx
  ON workspace_entitlements (workspace_id, is_active, expires_at)
  WHERE is_active = true;

ALTER TABLE workspace_entitlements ENABLE ROW LEVEL SECURITY;

-- Members can read their own workspace entitlements; admins have full access
CREATE POLICY "entitlements_workspace_read"
  ON workspace_entitlements FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "entitlements_admin"
  ON workspace_entitlements
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
