-- ─── Admin user management: CRM backfill for every auth user ──────────────
-- Prior state: only the funnel/challenge signup paths upserted crm_contacts.
-- Users who signed up the regular way (or existed before those flows) had no
-- CRM row, so inbound WhatsApp from a real user resolved to an unknown
-- contact and lost all context (name, tags, notes).
--
-- This migration:
--   1. Links contacts that already exist by email (user_id was NULL) to the
--      matching auth.users row. Fills in a few fields we can safely default.
--   2. Creates a fresh crm_contacts row for every remaining auth.users row
--      that has no matching contact. Lifecycle stage is 'customer' when the
--      user owns a workspace, otherwise 'lead' — accountants can retag later.
--
-- No schema changes. Everything writes into existing columns.
--
-- Idempotent: WHERE clauses only touch rows that don't already satisfy the
-- linkage, so applying twice is a no-op.

-- Helper: normalise a phone number to E.164 form using the same rules the
-- app-layer normalisePhone() applies (kept minimal here — only handles the
-- common Nigerian-mobile trunk-0 and 234-prefix cases). Robust
-- normalisation still happens at the application layer on future writes.
CREATE OR REPLACE FUNCTION finance_normalise_phone(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN NULL; END IF;
  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  -- Leading + gets stripped by the regex above; keep as-is (E.164 without +)
  -- Trunk-0 Nigerian mobile: '0803...' → '234803...'
  IF digits ~ '^0[7-9]' AND length(digits) = 11 THEN
    RETURN '234' || substring(digits FROM 2);
  END IF;
  -- Bare 10-digit Nigerian mobile: '803...' → '234803...'
  IF digits ~ '^[7-9]' AND length(digits) = 10 THEN
    RETURN '234' || digits;
  END IF;
  RETURN digits;
END;
$$;

-- ── 1. Link existing email-matched contacts to auth users ─────────────────
UPDATE crm_contacts c
   SET user_id = u.id,
       -- Backfill display_name if empty and the auth user has one
       display_name = COALESCE(NULLIF(c.display_name, ''),
                               NULLIF(u.raw_user_meta_data->>'full_name', ''),
                               split_part(u.email, '@', 1)),
       -- Backfill whatsapp_number only if empty AND the number isn't already
       -- claimed by another contact (whatsapp_number is UNIQUE).
       whatsapp_number = CASE
         WHEN NULLIF(c.whatsapp_number, '') IS NOT NULL THEN c.whatsapp_number
         WHEN EXISTS (
           SELECT 1 FROM crm_contacts c2
            WHERE c2.id <> c.id
              AND c2.whatsapp_number = COALESCE(finance_normalise_phone(u.raw_user_meta_data->>'phone'),
                                                finance_normalise_phone(u.phone))
         ) THEN c.whatsapp_number
         ELSE COALESCE(finance_normalise_phone(u.raw_user_meta_data->>'phone'),
                       finance_normalise_phone(u.phone))
       END,
       updated_at = now()
  FROM auth.users u
 WHERE c.user_id IS NULL
   AND c.email IS NOT NULL
   AND lower(c.email) = lower(u.email);

-- ── 2. Create contacts for auth users still not represented ───────────────
-- crm_contacts.whatsapp_number has a UNIQUE constraint (mig
-- 20260714010000_crm_contact_dedup). If two auth users share a phone
-- (spouses, siblings, a re-used dev test number, etc.) inserting both would
-- collide. The subselect below leaves whatsapp_number NULL when the
-- normalised value is already claimed by an existing contact — the admin
-- can retag manually later on whichever row wins.
INSERT INTO crm_contacts (
  user_id, email, display_name, whatsapp_number,
  lifecycle_stage, status, tags, created_at, updated_at
)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
  (
    SELECT CASE
      WHEN norm IS NULL THEN NULL
      WHEN EXISTS (SELECT 1 FROM crm_contacts c WHERE c.whatsapp_number = norm) THEN NULL
      ELSE norm
    END
    FROM (VALUES (COALESCE(finance_normalise_phone(u.raw_user_meta_data->>'phone'),
                           finance_normalise_phone(u.phone)))) AS t(norm)
  ),
  -- 'customer' if they own at least one workspace, else 'lead'
  CASE WHEN EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id)
       THEN 'customer' ELSE 'lead' END,
  'active',
  '[]'::jsonb,
  now(),
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_contacts c
     WHERE c.user_id = u.id OR (c.email IS NOT NULL AND lower(c.email) = lower(u.email))
  );
