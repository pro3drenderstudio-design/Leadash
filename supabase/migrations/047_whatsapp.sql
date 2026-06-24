-- ── 047: WhatsApp messages + funnel admin_settings keys ──────────────────────
-- Creates the whatsapp_messages audit/delivery table and seeds all admin_settings
-- keys required by the funnel, bundle, WhatsApp, Resend, and CRM systems.

-- ── 1. whatsapp_messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number         text        NOT NULL,
  direction            text        NOT NULL DEFAULT 'outbound'
                       CHECK (direction IN ('inbound', 'outbound')),

  -- Template sends
  template_name        text,
  template_params      jsonb       NOT NULL DEFAULT '{}',

  -- Raw body (stored for inbound messages and free-form CRM outbound)
  body                 text,

  -- Delivery state
  status               text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','sent','delivered','read','failed')),
  provider_message_id  text,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,
  failed_reason        text,

  -- Retry tracking (exponential backoff up to whatsapp_max_retry_hours)
  retry_count          int         NOT NULL DEFAULT 0,
  next_retry_at        timestamptz,

  -- Admin review flag: set when both WA + email fallback fail
  flagged_for_review   boolean     NOT NULL DEFAULT false,

  -- Origin: 'automation' | 'crm' | 'system'
  source               text,

  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_messages_workspace_idx
  ON whatsapp_messages (workspace_id);

CREATE INDEX IF NOT EXISTS wa_messages_status_idx
  ON whatsapp_messages (status);

CREATE INDEX IF NOT EXISTS wa_messages_retry_idx
  ON whatsapp_messages (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_messages_flagged_idx
  ON whatsapp_messages (flagged_for_review)
  WHERE flagged_for_review = true;

CREATE INDEX IF NOT EXISTS wa_messages_provider_idx
  ON whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_messages_admin" ON whatsapp_messages;
CREATE POLICY "wa_messages_admin"
  ON whatsapp_messages
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 2. Admin settings — all funnel / bundle / WhatsApp / CRM keys ─────────────
INSERT INTO admin_settings (key, value) VALUES

  -- Funnel & timer
  ('funnel_bundle_offer_days',              '30'),
  ('funnel_challenge_price_ngn',            '10000'),
  ('funnel_bundle_price_ngn',               '250000'),
  ('funnel_bundle_duration_months',         '12'),
  ('funnel_bundle_inbox_count',             '20'),
  ('funnel_bundle_grace_period_days',       '7'),
  ('funnel_bundle_renewal_warning_days',    '30'),
  ('funnel_partner_name',                   '"Learn By Mizark"'),
  ('funnel_mizark_invite_link',             '""'),
  ('funnel_bundle_growth_plan_value_ngn',   '540000'),
  ('funnel_bundle_mizark_value_ngn',        '750000'),

  -- Video
  ('funnel_vsl_youtube_id',                 '""'),

  -- Meta Pixel (editable from admin panel — no redeployment needed)
  ('meta_pixel_id',                         '""'),

  -- WhatsApp (Meta Cloud API)
  ('whatsapp_phone_number_id',              '""'),
  ('whatsapp_access_token',                 '""'),
  ('whatsapp_waba_id',                      '""'),
  ('whatsapp_sender_name',                  '"Leadash"'),
  ('whatsapp_max_retry_hours',              '6'),
  ('whatsapp_24hr_warning_mins',            '60'),

  -- CRM inboxes
  ('crm_support_email',                     '"support@leadash.com"'),
  ('crm_marketing_email',                   '"temi@leadash.com"'),
  ('crm_default_assignee',                  'null'),
  ('crm_auto_reopen_on_reply',              'true')

ON CONFLICT (key) DO NOTHING;
