-- Add 'whatsapp' as a 4th channel alongside instagram/facebook/sms
ALTER TABLE crm_channel_configs DROP CONSTRAINT crm_channel_configs_channel_check;
ALTER TABLE crm_channel_configs ADD CONSTRAINT crm_channel_configs_channel_check
  CHECK (channel IN ('instagram','facebook','sms','whatsapp'));

-- Local cache of Meta WhatsApp Business message templates.
-- Source of truth is Meta; this table mirrors status/approval state so the UI
-- doesn't need a live Graph API call on every render. Sync via GET /api/admin/crm-settings/whatsapp-templates.
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id text,
  name             text NOT NULL,
  language         text NOT NULL DEFAULT 'en',
  category         text NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status           text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  components       jsonb NOT NULL DEFAULT '[]',
  rejected_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, language)
);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_templates_admin" ON whatsapp_templates FOR ALL USING (is_admin());
