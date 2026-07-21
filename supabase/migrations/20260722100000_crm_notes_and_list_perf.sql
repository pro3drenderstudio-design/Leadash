-- ─── CRM: internal notes + fast conversation list + contact search ───────
-- Three fixes in one migration since they touch the same tables:
--
--  1. crm_messages.is_internal_note (bool). The send route previously wrote
--     internal notes to a non-existent crm_conversation_notes table; the
--     insert failed silently and notes vanished. Notes now share the
--     crm_messages timeline with a flag so the UI can style them and the
--     dispatch code can skip actual delivery.
--
--  2. crm_conversations denormalises the last message so the inbox list
--     query no longer joins crm_messages. Populated by a trigger on
--     crm_messages insert. Turns "fetch 5000 messages to compute 25
--     snippets" into a single flat select.
--
--  3. Trigram indexes on crm_contacts (display_name, email,
--     whatsapp_number, phone) so a contact search via ILIKE stays fast
--     without a full-table scan.

-- ── 1. is_internal_note column ────────────────────────────────────────────
ALTER TABLE crm_messages
  ADD COLUMN IF NOT EXISTS is_internal_note boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS crm_messages_notes_idx
  ON crm_messages(conversation_id, created_at DESC)
  WHERE is_internal_note = true;

-- ── 2. Denormalised last-message columns ──────────────────────────────────
ALTER TABLE crm_conversations
  ADD COLUMN IF NOT EXISTS last_message_snippet    text,
  ADD COLUMN IF NOT EXISTS last_message_direction  text,
  ADD COLUMN IF NOT EXISTS last_message_is_note    boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION crm_update_last_message() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only real messages update the "last message" summary; internal notes
  -- don't count towards last_message_at (already the case) and don't push
  -- the snippet either (a note isn't a customer-facing conversation event).
  IF NEW.is_internal_note THEN RETURN NEW; END IF;

  UPDATE crm_conversations
     SET last_message_snippet   = substring(COALESCE(NEW.body, '') FROM 1 FOR 160),
         last_message_direction = NEW.direction,
         last_message_is_note   = false,
         last_message_at        = NEW.created_at,
         updated_at             = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_messages_last_message ON crm_messages;
CREATE TRIGGER crm_messages_last_message
  AFTER INSERT ON crm_messages
  FOR EACH ROW EXECUTE FUNCTION crm_update_last_message();

-- Backfill last_message_snippet / direction for existing conversations so
-- the list looks populated immediately rather than only after a new inbound.
UPDATE crm_conversations c
   SET last_message_snippet   = substring(COALESCE(m.body, '') FROM 1 FOR 160),
       last_message_direction = m.direction
  FROM (
    SELECT DISTINCT ON (conversation_id)
           conversation_id, body, direction
      FROM crm_messages
     WHERE is_internal_note = false
     ORDER BY conversation_id, created_at DESC
  ) m
 WHERE c.id = m.conversation_id
   AND c.last_message_snippet IS NULL;

-- ── 3. Trigram indexes for contact search ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS crm_contacts_display_name_trgm
  ON crm_contacts USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS crm_contacts_email_trgm
  ON crm_contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS crm_contacts_whatsapp_trgm
  ON crm_contacts USING gin (whatsapp_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS crm_contacts_phone_trgm
  ON crm_contacts USING gin (phone gin_trgm_ops);
