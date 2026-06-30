-- Automation engine fixes: allow executions to be marked "skipped" (trigger
-- filter mismatch) the same way steps already can, and repair the seeded
-- system templates so they point at real events with real node-type/data
-- shapes instead of dead/aspirational ones.

-- 1. automation_executions needs the same skip vocabulary automation_execution_steps already has.
alter table automation_executions add column if not exists skip_reason text;

alter table automation_executions drop constraint if exists automation_executions_status_check;
alter table automation_executions add constraint automation_executions_status_check
  check (status in ('running', 'completed', 'failed', 'paused', 'cancelled', 'skipped'));

-- 2. Fix seeded automation_templates: give each a top-level trigger_event (the
--    create-from-template route falls back to "custom" without it), and repoint
--    dead/aspirational trigger events at real ones this migration's sibling code
--    changes now actually fire.

-- Welcome Sequence: "workspace.created" never fires anywhere — repoint to the
-- real funnel opt-in event.
update automation_templates
set definition = jsonb_set(
  jsonb_set(definition, '{nodes,0,data}', '{"event":"user.opted_in","label":"Funnel Opt-in"}'::jsonb),
  '{trigger_event}', '"user.opted_in"'::jsonb
),
category = 'Welcome'
where id = '0860a59b-d81e-4583-a9ed-3439b9a14bf2';

-- Trial Conversion: trials were discontinued (see 053_discontinue_trial.sql) —
-- this template describes a feature that no longer exists. Remove rather than
-- repoint to something unrelated.
delete from automation_templates where id = 'bf1fe3e6-5b02-4d24-b4c6-53846ce2bba4';

-- Payment Failed Recovery: "billing.payment_failed" becomes real in this
-- change set (Paystack webhook invoice.payment_failed handler). Node types
-- were already correct camelCase — just needed the top-level trigger_event.
update automation_templates
set definition = jsonb_set(definition, '{trigger_event}', '"billing.payment_failed"'::jsonb),
    category = 'Billing'
where id = '9de7204b-b72b-4a9f-a16e-ebc23d90f5af';

-- Re-engagement: "academy.inactivity_14d" has no real backing (no inactivity
-- detection job exists). Repoint to the new real academy.streak_broken event,
-- which is the same underlying intent — a disengaging learner who needs a nudge.
update automation_templates
set definition = jsonb_set(
  jsonb_set(definition, '{nodes,0,data}', '{"event":"academy.streak_broken","label":"Streak Broken"}'::jsonb),
  '{trigger_event}', '"academy.streak_broken"'::jsonb
),
category = 'Re-engagement'
where id = '942d7832-d2a8-4125-9b37-47c5474bb57e';

-- Funnel Purchase Follow-up: "funnel.purchase_completed" never fires anywhere —
-- repoint to the new real offers.purchase_created event. Also fix node a3's
-- data key: the builder's changeLifecycle config reads `lifecycle`, not `stage`.
update automation_templates
set definition = jsonb_set(
  jsonb_set(
    jsonb_set(definition, '{nodes,0,data}', '{"event":"offers.purchase_created","label":"Offer Purchased"}'::jsonb),
    '{trigger_event}', '"offers.purchase_created"'::jsonb
  ),
  '{nodes,2,data}', '{"label":"Set lifecycle: Customer","lifecycle":"customer"}'::jsonb
),
category = 'Conversion'
where id = 'a362e4af-780a-4836-971c-a46aa22cc85d';
