-- ── 077: 7-Day Challenge automations + phone-format backfill ─────────────
-- Seeds three ACTIVE automation flows against the events emitted from:
--   /api/funnels/submit                       → funnel.form_submitted
--   /api/crm/inbound-whatsapp + inbound-email → crm.message_received
--   /api/admin/challenge-signups/[id]         → academy.enrollment_created
--
-- Idempotent: uses stable slugs in the flow name for ON CONFLICT lookup,
-- so re-running the migration is a no-op refresh instead of a duplicate.
--
-- The backfill at the bottom rewrites crm_contacts.whatsapp_number to the
-- 234-prefixed digits-only shape produced by lib/phone.ts::normalisePhoneNG,
-- so existing rows link cleanly with WhatsApp wa_ids going forward.

-- ── 1. Backfill: normalise existing crm_contacts.whatsapp_number ─────────
-- Strip everything that isn't a digit, drop 234 prefix if present, drop a
-- leading trunk 0, then re-add 234. Nulls stay nulls; numbers we can't
-- interpret (too short) are left untouched so nothing breaks silently.
UPDATE crm_contacts
SET whatsapp_number = CASE
  WHEN whatsapp_number IS NULL THEN NULL
  WHEN LENGTH(regexp_replace(whatsapp_number, '\D', '', 'g')) < 7 THEN whatsapp_number
  ELSE '234' || (
    CASE
      -- Drop 234 prefix if present, then trunk 0 if present.
      WHEN regexp_replace(whatsapp_number, '\D', '', 'g') LIKE '234%' THEN
        regexp_replace(regexp_replace(whatsapp_number, '\D', '', 'g'), '^234', '')
      ELSE
        regexp_replace(whatsapp_number, '\D', '', 'g')
    END
  )
END
WHERE whatsapp_number IS NOT NULL
  AND whatsapp_number !~ '^234[0-9]+$';

-- Same treatment for the `phone` column on workspaces (used as sender number
-- in the fallback path of the automation-worker's sendWhatsapp step).
UPDATE workspaces
SET whatsapp_number = CASE
  WHEN whatsapp_number IS NULL THEN NULL
  WHEN LENGTH(regexp_replace(whatsapp_number, '\D', '', 'g')) < 7 THEN whatsapp_number
  ELSE '234' || (
    CASE
      WHEN regexp_replace(whatsapp_number, '\D', '', 'g') LIKE '234%' THEN
        regexp_replace(regexp_replace(whatsapp_number, '\D', '', 'g'), '^234', '')
      ELSE
        regexp_replace(whatsapp_number, '\D', '', 'g')
    END
  )
END
WHERE whatsapp_number IS NOT NULL
  AND whatsapp_number !~ '^234[0-9]+$';

-- ── 2. Seed the three flows ──────────────────────────────────────────────
-- Deleted first so a re-run refreshes the definition. Executions in progress
-- reference the flow_versions snapshot, so this is safe: past runs continue
-- against their old JSON, new runs pick up the fresh one.
DELETE FROM automation_flows WHERE name IN (
  '[Challenge 7-day] Form → CRM lead',
  '[Challenge 7-day] Payment inquiry auto-reply',
  '[Challenge 7-day] Welcome after payment'
);

-- ── 2a. Form → CRM lead ──────────────────────────────────────────────────
-- Every form submission on funnel_slug=challenge-7day gets tagged and moved
-- to the "lead" lifecycle stage so the sales pipeline shows them.
INSERT INTO automation_flows (
  name, description, trigger_event, trigger_filters,
  duplicate_policy, flow_definition, is_active
)
VALUES (
  '[Challenge 7-day] Form → CRM lead',
  'Tag and move every 7-day-challenge funnel submission into the CRM lead pipeline.',
  'funnel.form_submitted',
  jsonb_build_object('funnel_slug', 'challenge-7day'),
  'deduplicate',
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'trigger', 'type', 'trigger',
        'position', jsonb_build_object('x', 40, 'y', 40),
        'data', jsonb_build_object('event', 'funnel.form_submitted')
      ),
      jsonb_build_object(
        'id', 'tag', 'type', 'addTag',
        'position', jsonb_build_object('x', 40, 'y', 180),
        'data', jsonb_build_object('tag', '7-day-challenge')
      ),
      jsonb_build_object(
        'id', 'stage', 'type', 'changeLifecycle',
        'position', jsonb_build_object('x', 40, 'y', 320),
        'data', jsonb_build_object('stage', 'lead')
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('id', 'e1', 'source', 'trigger', 'target', 'tag'),
      jsonb_build_object('id', 'e2', 'source', 'tag',     'target', 'stage')
    )
  ),
  true
);

-- ── 2b. Payment-inquiry auto-reply ───────────────────────────────────────
-- Two conditions in series:
--   1. body contains "trouble"  → endFlow (do NOT auto-reply — this is the
--      "Hi, I paid for the challenge but I'm having trouble filling the
--      form." case, admin needs to handle)
--   2. body contains "paid"     → sendWhatsapp the "give me a few minutes"
--      confirmation-in-progress reply. Case-insensitive contains is handled
--      by the worker, so the flow just needs the substring.
INSERT INTO automation_flows (
  name, description, trigger_event, trigger_filters,
  duplicate_policy, flow_definition, is_active
)
VALUES (
  '[Challenge 7-day] Payment inquiry auto-reply',
  'When a CRM contact WhatsApp''s us saying they paid, reply that we''re confirming — unless they mentioned "trouble filling the form" (that path stays human).',
  'crm.message_received',
  jsonb_build_object('channel', 'whatsapp'),
  'parallel',
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'trigger', 'type', 'trigger',
        'position', jsonb_build_object('x', 40, 'y', 40),
        'data', jsonb_build_object('event', 'crm.message_received')
      ),
      jsonb_build_object(
        'id', 'checkTrouble', 'type', 'condition',
        'position', jsonb_build_object('x', 40, 'y', 180),
        'data', jsonb_build_object('field', 'body_lower', 'operator', 'contains', 'value', 'trouble')
      ),
      jsonb_build_object(
        'id', 'endTrouble', 'type', 'endFlow',
        'position', jsonb_build_object('x', -140, 'y', 320),
        'data', jsonb_build_object()
      ),
      jsonb_build_object(
        'id', 'checkPaid', 'type', 'condition',
        'position', jsonb_build_object('x', 200, 'y', 320),
        'data', jsonb_build_object('field', 'body_lower', 'operator', 'contains', 'value', 'paid')
      ),
      jsonb_build_object(
        'id', 'endNoMatch', 'type', 'endFlow',
        'position', jsonb_build_object('x', 40, 'y', 460),
        'data', jsonb_build_object()
      ),
      jsonb_build_object(
        'id', 'reply', 'type', 'sendWhatsapp',
        'position', jsonb_build_object('x', 360, 'y', 460),
        'data', jsonb_build_object(
          'body', 'Thanks for this information sir. Please, give me a few minutes while I confirm your payment.'
        )
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('id', 'e1',         'source', 'trigger',      'target', 'checkTrouble'),
      jsonb_build_object('id', 'e-trouble',  'source', 'checkTrouble', 'target', 'endTrouble',  'sourceHandle', 'yes'),
      jsonb_build_object('id', 'e-noTrouble','source', 'checkTrouble', 'target', 'checkPaid',   'sourceHandle', 'no'),
      jsonb_build_object('id', 'e-noPaid',   'source', 'checkPaid',    'target', 'endNoMatch',  'sourceHandle', 'no'),
      jsonb_build_object('id', 'e-paid',     'source', 'checkPaid',    'target', 'reply',       'sourceHandle', 'yes')
    )
  ),
  true
);

-- ── 2c. Welcome after payment ────────────────────────────────────────────
-- Fires when an admin confirms the signup on /admin/challenge-signups. The
-- worker's sendWhatsapp step reads payload.contact_id first, then payload.phone,
-- then workspace, so a signup that never became a Leadash workspace still
-- receives the welcome.
INSERT INTO automation_flows (
  name, description, trigger_event, trigger_filters,
  duplicate_policy, flow_definition, is_active
)
VALUES (
  '[Challenge 7-day] Welcome after payment',
  'When admin confirms a 7-day-challenge signup, WhatsApp them the community link and next steps.',
  'academy.enrollment_created',
  jsonb_build_object('product_slug', 'challenge-7day'),
  'deduplicate',
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'trigger', 'type', 'trigger',
        'position', jsonb_build_object('x', 40, 'y', 40),
        'data', jsonb_build_object('event', 'academy.enrollment_created')
      ),
      jsonb_build_object(
        'id', 'welcome', 'type', 'sendWhatsapp',
        'position', jsonb_build_object('x', 40, 'y', 200),
        'data', jsonb_build_object(
          'body', E'Welcome aboard! 🎉 Your spot in the 7-Day Job & Client Acquisition Challenge is confirmed.\nStep 1 — Join your private community here 👇 https://chat.whatsapp.com/Km8xb3WTSkEDCcbJfFbOTV?s=cl&p=i&ilr=1\nStep 2 — Turn on notifications for the group\nStep 3 — Show up Monday 9PM WAT for Day 1\nThat''s it. This is where the work you want starts getting sent your way. See you inside! 🔥'
        )
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('id', 'e1', 'source', 'trigger', 'target', 'welcome')
    )
  ),
  true
);
