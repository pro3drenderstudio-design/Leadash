-- ── 054: CRM Extended — Multi-channel, Contact Profile, Merge ────────────────
-- Applied 2026-06-24 via Supabase MCP

-- Extend crm_contacts with new identity/profile fields
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS instagram_id    text,
  ADD COLUMN IF NOT EXISTS facebook_id     text,
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS avatar_url      text,
  ADD COLUMN IF NOT EXISTS company         text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead','prospect','customer','churned','blocked')),
  ADD COLUMN IF NOT EXISTS custom_fields   jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source          text,
  ADD COLUMN IF NOT EXISTS source_funnel_id uuid REFERENCES funnels(id),
  ADD COLUMN IF NOT EXISTS timezone        text;

-- Expand crm_conversations channel constraint
ALTER TABLE crm_conversations
  DROP CONSTRAINT IF EXISTS crm_conversations_channel_check;
ALTER TABLE crm_conversations
  ADD CONSTRAINT crm_conversations_channel_check
    CHECK (channel IN ('email','whatsapp','instagram','facebook','sms','chat'));

-- Add SLA and resolution tracking to conversations
ALTER TABLE crm_conversations
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached_at    timestamptz,
  ADD COLUMN IF NOT EXISTS category           text DEFAULT 'general'
    CHECK (category IN ('support','billing','sales','general'));

-- Tasks for contacts/conversations
CREATE TABLE IF NOT EXISTS crm_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES crm_conversations(id) ON DELETE SET NULL,
  assigned_to     uuid REFERENCES auth.users(id),
  created_by      uuid REFERENCES auth.users(id),
  title           text NOT NULL,
  due_at          timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Channel credential store (Instagram, Facebook, SMS)
CREATE TABLE IF NOT EXISTS crm_channel_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel          text NOT NULL UNIQUE
    CHECK (channel IN ('instagram','facebook','sms')),
  credentials      jsonb DEFAULT '{}',
  config           jsonb DEFAULT '{}',
  status           text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','error','disconnected')),
  token_expires_at timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- AI-suggested contact merge candidates
CREATE TABLE IF NOT EXISTS crm_merge_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a   uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  contact_b   uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  confidence  int NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  reason      text,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','merged','dismissed')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (contact_a, contact_b)
);

-- Audit log for contact merges
CREATE TABLE IF NOT EXISTS crm_contact_merges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id   uuid NOT NULL REFERENCES crm_contacts(id),
  source_id   uuid NOT NULL REFERENCES crm_contacts(id),
  merged_by   uuid REFERENCES auth.users(id),
  merged_at   timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS crm_contacts_instagram_id_idx ON crm_contacts(instagram_id) WHERE instagram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_facebook_id_idx  ON crm_contacts(facebook_id)  WHERE facebook_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_tasks_contact_id_idx      ON crm_tasks(contact_id);
CREATE INDEX IF NOT EXISTS crm_tasks_due_at_idx          ON crm_tasks(due_at)          WHERE completed_at IS NULL;

-- RLS
ALTER TABLE crm_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_channel_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_merge_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_merges    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_tasks_admin"             ON crm_tasks             FOR ALL USING (is_admin());
CREATE POLICY "crm_channel_configs_admin"   ON crm_channel_configs   FOR ALL USING (is_admin());
CREATE POLICY "crm_merge_suggestions_admin" ON crm_merge_suggestions FOR ALL USING (is_admin());
CREATE POLICY "crm_contact_merges_admin"    ON crm_contact_merges    FOR ALL USING (is_admin());
