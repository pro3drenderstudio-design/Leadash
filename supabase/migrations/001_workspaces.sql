-- ─── Workspaces ──────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  owner_id            uuid NOT NULL REFERENCES auth.users(id),
  stripe_customer_id  text,
  stripe_sub_id       text,
  plan_id             text NOT NULL DEFAULT 'free',
  plan_status         text NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active','past_due','canceled','trialing')),
  trial_ends_at       timestamptz,
  billing_email       text,
  onboarding_step     int NOT NULL DEFAULT 0,
  onboarding_done     boolean NOT NULL DEFAULT false,
  max_inboxes         int NOT NULL DEFAULT 3,
  max_monthly_sends   int NOT NULL DEFAULT 1000,
  max_seats           int NOT NULL DEFAULT 1,
  sends_this_month    int NOT NULL DEFAULT 0,
  sends_month_reset   date NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── Workspace members ────────────────────────────────────────────────────────
CREATE TABLE workspace_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_by   uuid REFERENCES auth.users(id),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- ─── Workspace invites ────────────────────────────────────────────────────────
CREATE TABLE workspace_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'member',
  token        text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, email)
);

-- ─── API keys ─────────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_hash     text UNIQUE NOT NULL,
  last_used_at timestamptz,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Webhook endpoints ────────────────────────────────────────────────────────
CREATE TABLE webhook_endpoints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url          text NOT NULL,
  events       text[] NOT NULL DEFAULT '{}',
  secret       text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Workspace settings ───────────────────────────────────────────────────────
CREATE TABLE workspace_settings (
  workspace_id         uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  footer_enabled       boolean NOT NULL DEFAULT true,
  footer_custom_text   text,
  footer_address       text,
  track_opens_default  boolean NOT NULL DEFAULT true,
  track_clicks_default boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── Usage events (billing audit log) ────────────────────────────────────────
CREATE TABLE usage_events (
  id           bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  quantity     int NOT NULL DEFAULT 1,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_events_ws ON usage_events(workspace_id, created_at DESC);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_workspace_members_user    ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_ws      ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_invites_token   ON workspace_invites(token);
CREATE INDEX idx_workspace_invites_email   ON workspace_invites(email);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of a workspace?
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;

-- Workspaces: members can read; owner can update/delete
CREATE POLICY "ws_select"  ON workspaces FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "ws_insert"  ON workspaces FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "ws_update"  ON workspaces FOR UPDATE USING (is_workspace_member(id));
CREATE POLICY "ws_delete"  ON workspaces FOR DELETE USING (owner_id = auth.uid());

-- Members: members can read; owner/admin can insert/delete
CREATE POLICY "wm_select"  ON workspace_members FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "wm_insert"  ON workspace_members FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "wm_delete"  ON workspace_members FOR DELETE USING (is_workspace_member(workspace_id));

-- Invites: members can read
CREATE POLICY "wi_select"  ON workspace_invites FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "wi_insert"  ON workspace_invites FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "wi_delete"  ON workspace_invites FOR DELETE USING (is_workspace_member(workspace_id));

-- API keys: members can read; only member can delete their own
CREATE POLICY "ak_select"  ON api_keys FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ak_insert"  ON api_keys FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ak_delete"  ON api_keys FOR DELETE USING (is_workspace_member(workspace_id));

-- Webhooks
CREATE POLICY "wh_select"  ON webhook_endpoints FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "wh_insert"  ON webhook_endpoints FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "wh_update"  ON webhook_endpoints FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "wh_delete"  ON webhook_endpoints FOR DELETE USING (is_workspace_member(workspace_id));

-- Settings
CREATE POLICY "ws_settings_select" ON workspace_settings FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_settings_upsert" ON workspace_settings FOR ALL USING (is_workspace_member(workspace_id));
