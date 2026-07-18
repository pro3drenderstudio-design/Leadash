-- Store the latest WhatsApp reaction emoji on a CRM message so the inbox can
-- render reactions (e.g. a 👍 a contact placed on one of our replies). NULL = no
-- reaction / reaction removed.
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS reaction text;
