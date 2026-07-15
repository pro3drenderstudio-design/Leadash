-- Merge duplicate crm_contacts (oldest row wins) that accumulated because the
-- inbound-whatsapp webhook's contact lookup used .maybeSingle() without an
-- order/limit, which silently treated "2+ ambiguous matches" the same as
-- "no match found" and created a new contact on every subsequent message.
-- Then add unique constraints so it can't happen again.

WITH ranked AS (
  SELECT id, whatsapp_number,
         first_value(id) OVER (PARTITION BY whatsapp_number ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY whatsapp_number ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE whatsapp_number IS NOT NULL
), dupes AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE crm_conversations c SET contact_id = d.canonical_id FROM dupes d WHERE c.contact_id = d.id;

WITH ranked AS (
  SELECT id, whatsapp_number,
         first_value(id) OVER (PARTITION BY whatsapp_number ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY whatsapp_number ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE whatsapp_number IS NOT NULL
), dupes AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE crm_messages m SET contact_id = d.canonical_id FROM dupes d WHERE m.contact_id = d.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY whatsapp_number ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE whatsapp_number IS NOT NULL
)
DELETE FROM crm_contacts WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id, instagram_id,
         first_value(id) OVER (PARTITION BY instagram_id ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY instagram_id ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE instagram_id IS NOT NULL
), dupes AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE crm_conversations c SET contact_id = d.canonical_id FROM dupes d WHERE c.contact_id = d.id;

WITH ranked AS (
  SELECT id, instagram_id,
         first_value(id) OVER (PARTITION BY instagram_id ORDER BY created_at ASC) AS canonical_id,
         row_number() OVER (PARTITION BY instagram_id ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE instagram_id IS NOT NULL
), dupes AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE crm_messages m SET contact_id = d.canonical_id FROM dupes d WHERE m.contact_id = d.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY instagram_id ORDER BY created_at ASC) AS rn
  FROM crm_contacts WHERE instagram_id IS NOT NULL
)
DELETE FROM crm_contacts WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Collapse duplicate crm_conversations per (contact_id, channel) that resulted from the merge above
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

ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_whatsapp_number_key UNIQUE (whatsapp_number);
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_instagram_id_key UNIQUE (instagram_id);
