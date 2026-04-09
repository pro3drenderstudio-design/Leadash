-- ─── Outreach tables (all scoped to workspace_id) ────────────────────────────

CREATE TABLE outreach_inboxes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label                 text NOT NULL,
  email_address         text NOT NULL,
  provider              text NOT NULL DEFAULT 'smtp' CHECK (provider IN ('gmail','outlook','smtp')),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  -- OAuth
  oauth_access_token    text,
  oauth_refresh_token   text,
  oauth_expiry          timestamptz,
  -- SMTP/IMAP
  smtp_host             text,
  smtp_port             int DEFAULT 587,
  smtp_user             text,
  smtp_pass_encrypted   text,
  imap_host             text,
  imap_port             int DEFAULT 993,
  -- Settings
  daily_send_limit      int NOT NULL DEFAULT 30,
  send_window_start     text NOT NULL DEFAULT '09:00',
  send_window_end       text NOT NULL DEFAULT '17:00',
  signature             text,
  first_name            text,
  last_name             text,
  last_error            text,
  -- Warmup
  warmup_enabled        boolean NOT NULL DEFAULT false,
  warmup_current_daily  int NOT NULL DEFAULT 0,
  warmup_target_daily   int NOT NULL DEFAULT 40,
  warmup_ramp_per_week  int NOT NULL DEFAULT 5,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  list_id       uuid NOT NULL REFERENCES outreach_lists(id) ON DELETE CASCADE,
  email         text NOT NULL,
  first_name    text,
  last_name     text,
  company       text,
  title         text,
  website       text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced','invalid')),
  custom_fields jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, email)
);

CREATE TABLE outreach_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  inbox_ids           uuid[] NOT NULL DEFAULT '{}',
  list_ids            uuid[] NOT NULL DEFAULT '{}',
  timezone            text NOT NULL DEFAULT 'America/New_York',
  send_days           text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri}',
  send_start_time     text NOT NULL DEFAULT '09:00',
  send_end_time       text NOT NULL DEFAULT '17:00',
  daily_cap           int NOT NULL DEFAULT 100,
  track_opens         boolean NOT NULL DEFAULT true,
  track_clicks        boolean NOT NULL DEFAULT true,
  min_delay_seconds   int NOT NULL DEFAULT 30,
  max_delay_seconds   int NOT NULL DEFAULT 120,
  stop_on_reply       boolean NOT NULL DEFAULT true,
  pause_after_open    boolean NOT NULL DEFAULT false,
  reply_to_email      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_sequences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id      uuid NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  step_order       int NOT NULL,
  type             text NOT NULL DEFAULT 'email' CHECK (type IN ('email','wait')),
  wait_days        int NOT NULL DEFAULT 0,
  subject_template text,
  subject_template_b text,
  body_template    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, step_order)
);

CREATE TABLE outreach_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
  current_step int NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','replied','bounced','unsubscribed','paused')),
  ab_variant   text NOT NULL DEFAULT 'a' CHECK (ab_variant IN ('a','b')),
  crm_status   text NOT NULL DEFAULT 'neutral',
  next_send_at timestamptz,
  enrolled_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(campaign_id, lead_id)
);

CREATE TABLE outreach_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  enrollment_id    uuid NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
  sequence_step_id uuid REFERENCES outreach_sequences(id) ON DELETE SET NULL,
  inbox_id         uuid REFERENCES outreach_inboxes(id) ON DELETE SET NULL,
  to_email         text NOT NULL,
  subject          text NOT NULL,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','opened','bounced','failed')),
  sent_at          timestamptz,
  opened_at        timestamptz,
  clicked_at       timestamptz,
  replied_at       timestamptz,
  bounced_at       timestamptz,
  open_count       int NOT NULL DEFAULT 0,
  click_count      int NOT NULL DEFAULT 0,
  message_id       text,
  thread_id        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_tracked_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  send_id      uuid NOT NULL REFERENCES outreach_sends(id) ON DELETE CASCADE,
  link_index   int NOT NULL,
  original_url text NOT NULL,
  click_count  int NOT NULL DEFAULT 0
);

CREATE TABLE outreach_replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inbox_id      uuid REFERENCES outreach_inboxes(id) ON DELETE SET NULL,
  send_id       uuid REFERENCES outreach_sends(id) ON DELETE SET NULL,
  enrollment_id uuid REFERENCES outreach_enrollments(id) ON DELETE SET NULL,
  from_email    text NOT NULL,
  from_name     text,
  subject       text,
  body_text     text,
  message_id    text UNIQUE,
  in_reply_to   text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  ai_category   text,
  ai_confidence float4,
  is_filtered   boolean NOT NULL DEFAULT false,
  filter_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_warmup_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_inbox_id    uuid NOT NULL REFERENCES outreach_inboxes(id) ON DELETE CASCADE,
  to_inbox_id      uuid NOT NULL REFERENCES outreach_inboxes(id) ON DELETE CASCADE,
  message_id       text,
  thread_id        text,
  subject          text,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  replied_at       timestamptz,
  rescued_from_spam boolean NOT NULL DEFAULT false
);

CREATE TABLE outreach_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_unsubscribes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  source       text NOT NULL DEFAULT 'link',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, email)
);

CREATE TABLE outreach_blacklist_domains (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain       text NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

CREATE TABLE outreach_crm_filters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('phrase','subject_phrase','sender_email','sender_domain')),
  value        text NOT NULL,
  action       text NOT NULL DEFAULT 'exclude' CHECK (action IN ('exclude','auto_status')),
  auto_status  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_inboxes_ws           ON outreach_inboxes(workspace_id, status);
CREATE INDEX idx_campaigns_ws         ON outreach_campaigns(workspace_id, status);
CREATE INDEX idx_enrollments_ws_due   ON outreach_enrollments(workspace_id, status, next_send_at);
CREATE INDEX idx_enrollments_campaign ON outreach_enrollments(campaign_id);
CREATE INDEX idx_sends_ws             ON outreach_sends(workspace_id, status, sent_at DESC);
CREATE INDEX idx_sends_enrollment     ON outreach_sends(enrollment_id);
CREATE INDEX idx_replies_ws           ON outreach_replies(workspace_id, received_at DESC);
CREATE INDEX idx_replies_enrollment   ON outreach_replies(enrollment_id);
CREATE INDEX idx_warmup_ws            ON outreach_warmup_sends(workspace_id, sent_at DESC);
CREATE INDEX idx_leads_ws_list        ON outreach_leads(workspace_id, list_id, status);
CREATE INDEX idx_unsubscribes_email   ON outreach_unsubscribes(workspace_id, email);

-- ─── RLS (all outreach tables use same pattern) ───────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outreach_inboxes','outreach_lists','outreach_leads','outreach_campaigns',
    'outreach_sequences','outreach_enrollments','outreach_sends','outreach_tracked_links',
    'outreach_replies','outreach_warmup_sends','outreach_templates','outreach_unsubscribes',
    'outreach_blacklist_domains','outreach_crm_filters'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "ws_all_%1$s" ON %1$I USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id))',
      t
    );
  END LOOP;
END $$;
