-- ── 049: CRM — Unified WhatsApp + Email Inbox ────────────────────────────────
-- Internal tool for the Leadash team to manage all inbound/outbound
-- communications with customers. Separate from the outreach CRM (cold email).

-- ── 1. crm_contacts ───────────────────────────────────────────────────────────
-- One row per customer. Linked to a Leadash user/workspace if known;
-- unknown contacts are created when emails/WA messages arrive from
-- unrecognised senders.
CREATE TABLE IF NOT EXISTS crm_contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id)  ON DELETE SET NULL,
  workspace_id    uuid        REFERENCES workspaces(id)  ON DELETE SET NULL,
  email           text,
  whatsapp_number text,
  display_name    text,
  tags            jsonb       NOT NULL DEFAULT '[]',
  notes           text,
  -- active | archived | blocked
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','archived','blocked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_contacts_user_idx
  ON crm_contacts (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_contacts_email_idx
  ON crm_contacts (email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_contacts_phone_idx
  ON crm_contacts (whatsapp_number) WHERE whatsapp_number IS NOT NULL;

ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contacts_admin" ON crm_contacts;
CREATE POLICY "crm_contacts_admin"
  ON crm_contacts
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 2. crm_conversations ──────────────────────────────────────────────────────
-- A thread per contact per channel. Email threads are keyed by Message-ID chain;
-- WhatsApp threads are keyed by the phone number pair.
--
-- last_inbound_at drives the WhatsApp 24-hour service window:
--   < 24h ago  → free-form compose available
--   > 24h ago  → template-only mode
CREATE TABLE IF NOT EXISTS crm_conversations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  -- 'email' | 'whatsapp'
  channel             text        NOT NULL CHECK (channel IN ('email','whatsapp')),
  -- The specific address or phone number for this thread
  channel_identifier  text,
  -- Which Leadash inbox received it ('support' | 'marketing')
  inbox_address       text,
  subject             text,  -- email threads only
  -- open | pending | resolved | closed | snoozed
  status              text        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','pending','resolved','closed','snoozed')),
  assigned_to         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  snooze_until        timestamptz,
  last_message_at     timestamptz,
  -- Tracks the WhatsApp 24-hour free-messaging window
  last_inbound_at     timestamptz,
  unread_count        int         NOT NULL DEFAULT 0,
  tags                jsonb       NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_convos_contact_idx
  ON crm_conversations (contact_id);

CREATE INDEX IF NOT EXISTS crm_convos_assigned_status_idx
  ON crm_conversations (assigned_to, status);

CREATE INDEX IF NOT EXISTS crm_convos_status_time_idx
  ON crm_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS crm_convos_inbox_idx
  ON crm_conversations (inbox_address, status);

-- Index for snooze wake-ups (cron checks this)
CREATE INDEX IF NOT EXISTS crm_convos_snooze_idx
  ON crm_conversations (snooze_until)
  WHERE status = 'snoozed' AND snooze_until IS NOT NULL;

ALTER TABLE crm_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_conversations_admin" ON crm_conversations;
CREATE POLICY "crm_conversations_admin"
  ON crm_conversations
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 3. crm_messages ───────────────────────────────────────────────────────────
-- Every inbound and outbound message, from both email and WhatsApp channels.
-- Automated WhatsApp messages (Day unlocks, reminders) are NOT stored here —
-- they live in whatsapp_messages. Only CRM-sent and all inbound messages here.
CREATE TABLE IF NOT EXISTS crm_messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid        NOT NULL REFERENCES crm_conversations(id) ON DELETE CASCADE,
  contact_id          uuid        NOT NULL REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  -- 'inbound' | 'outbound'
  direction           text        NOT NULL CHECK (direction IN ('inbound','outbound')),
  -- 'email' | 'whatsapp'
  channel             text        NOT NULL CHECK (channel IN ('email','whatsapp')),

  -- Email fields
  from_address        text,
  from_name           text,
  subject             text,
  body                text,
  body_html           text,
  attachments         jsonb       NOT NULL DEFAULT '[]',

  -- WhatsApp fields
  -- 'text' | 'template' | 'image' | 'document' | 'audio' | 'video'
  wa_message_type     text,
  template_name       text,
  template_params     jsonb       NOT NULL DEFAULT '{}',

  -- For outbound: which admin team member sent this
  sent_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Provider references
  provider_message_id text,
  -- Email threading: stores Message-ID header so replies can be linked
  provider_thread_id  text,

  -- Delivery state
  -- sent | delivered | read | failed | bounced
  status              text        NOT NULL DEFAULT 'sent'
                      CHECK (status IN ('sent','delivered','read','failed','bounced')),
  failed_reason       text,
  delivered_at        timestamptz,
  read_at             timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_messages_convo_idx
  ON crm_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_messages_contact_idx
  ON crm_messages (contact_id);

CREATE INDEX IF NOT EXISTS crm_messages_provider_idx
  ON crm_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_messages_admin" ON crm_messages;
CREATE POLICY "crm_messages_admin"
  ON crm_messages
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 4. crm_message_events ─────────────────────────────────────────────────────
-- Delivery and engagement events from Resend webhooks (opens, clicks, bounces)
-- and Meta Cloud API delivery receipts.
CREATE TABLE IF NOT EXISTS crm_message_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES crm_messages(id) ON DELETE CASCADE,
  -- opened | clicked | bounced | complained | delivered | read
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_events_message_idx
  ON crm_message_events (message_id);

ALTER TABLE crm_message_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_message_events_admin" ON crm_message_events;
CREATE POLICY "crm_message_events_admin"
  ON crm_message_events
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 5. crm_notes ─────────────────────────────────────────────────────────────
-- Internal team notes per conversation. Never visible to the customer.
CREATE TABLE IF NOT EXISTS crm_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES crm_conversations(id) ON DELETE CASCADE,
  author_id       uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  body            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_notes_convo_idx
  ON crm_notes (conversation_id);

ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_notes_admin" ON crm_notes;
CREATE POLICY "crm_notes_admin"
  ON crm_notes
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
