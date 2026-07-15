-- One remaining duplicate crm_conversations pair surfaced (same contact,
-- same channel) that predated the contact-level dedup + code fix going
-- live in production. Collapse any remaining duplicates the same way, then
-- add a unique constraint so a second conversation per (contact, channel)
-- can never be created again — matches the existing one-thread-per-channel
-- data model (inbound handlers always look up and reuse the existing
-- conversation for a contact+channel rather than creating a new one).

WITH ranked AS (
  SELECT id, contact_id, channel, unread_count, last_message_at, last_inbound_at,
         first_value(id) OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC) AS rn
  FROM crm_conversations
),
agg AS (
  SELECT canonical_id, sum(unread_count) AS total_unread,
         max(last_message_at) AS max_last_msg, max(last_inbound_at) AS max_last_inbound
  FROM ranked GROUP BY canonical_id
)
UPDATE crm_conversations c
SET unread_count = a.total_unread, last_message_at = a.max_last_msg, last_inbound_at = a.max_last_inbound
FROM agg a WHERE c.id = a.canonical_id;

WITH ranked AS (
  SELECT id, contact_id, channel,
         first_value(id) OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC) AS rn
  FROM crm_conversations
),
dupe_convos AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE crm_messages m SET conversation_id = d.canonical_id FROM dupe_convos d WHERE m.conversation_id = d.id;

WITH ranked AS (
  SELECT id, contact_id, channel,
         row_number() OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC) AS rn
  FROM crm_conversations
)
DELETE FROM crm_conversations WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE crm_conversations ADD CONSTRAINT crm_conversations_contact_channel_key UNIQUE (contact_id, channel);
