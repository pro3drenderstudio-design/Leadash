-- ── 079: repair phone numbers mangled by the pre-fix normalisePhoneNG ────
-- The previous normaliser blindly prefixed `234` to anything that didn't
-- already start with it, so international numbers like +447700900123 (UK)
-- were stored as `234447700900123`. WhatsApp Cloud API accepted inbound
-- messages tagged by the real wa_id but our outbound send used the mangled
-- stored value and never reached the recipient.
--
-- Detection: a valid Nigerian E.164 is exactly `234` + 10 digits starting
-- with 7/8/9 (mobile). Anything matching `^234[0-6]` or `^234...` longer
-- than 13 digits is a mangled international number — strip the leading
-- `234` and we're left with the real E.164 wa_id.
--
-- Safe re-run: the WHERE clauses only match rows that still look mangled,
-- so applying twice is a no-op.

UPDATE crm_contacts
SET whatsapp_number = SUBSTRING(whatsapp_number FROM 4),
    updated_at      = now()
WHERE whatsapp_number IS NOT NULL
  AND (
    whatsapp_number ~ '^234[0-6]'                                   -- 234 + non-mobile digit
    OR (whatsapp_number LIKE '234%' AND LENGTH(whatsapp_number) > 13) -- 234 + too many digits
  );

UPDATE workspaces
SET whatsapp_number = SUBSTRING(whatsapp_number FROM 4),
    updated_at      = now()
WHERE whatsapp_number IS NOT NULL
  AND (
    whatsapp_number ~ '^234[0-6]'
    OR (whatsapp_number LIKE '234%' AND LENGTH(whatsapp_number) > 13)
  );

-- challenge_signups.phone was also written through the mangling normaliser.
-- Skipped: no unique constraint or outbound-messaging code reads from that
-- column, so leaving the historical value doesn't affect delivery. It'll
-- be corrected on the next signup by the fixed normalisePhone().
