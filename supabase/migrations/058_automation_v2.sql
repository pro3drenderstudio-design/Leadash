-- ── 055: Automation V2 — Templates, Chain Safety, Execution History ──────────
-- Applied 2026-06-24 via Supabase MCP

-- Extend automation_flows with new fields
ALTER TABLE automation_flows
  ADD COLUMN IF NOT EXISTS draft_history jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS template_id   uuid,
  ADD COLUMN IF NOT EXISTS tags          text[],
  ADD COLUMN IF NOT EXISTS run_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at   timestamptz;

-- Reusable flow templates (system + workspace)
CREATE TABLE IF NOT EXISTS automation_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'general',
  preview_img text,
  definition  jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Extend executions with chain tracking and contact linkage
ALTER TABLE automation_executions
  ADD COLUMN IF NOT EXISTS parent_execution_id uuid REFERENCES automation_executions(id),
  ADD COLUMN IF NOT EXISTS chain_depth          int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_id           uuid REFERENCES crm_contacts(id),
  ADD COLUMN IF NOT EXISTS next_run_at          timestamptz;

-- Allow execution steps to record skip reasons
ALTER TABLE automation_execution_steps
  ADD COLUMN IF NOT EXISTS skip_reason text;

-- RLS for templates
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_templates_admin"       ON automation_templates FOR ALL    USING (is_admin());
CREATE POLICY "automation_templates_system_read" ON automation_templates FOR SELECT USING (is_system = true);

-- Seed system templates
INSERT INTO automation_templates (name, description, category, is_system, definition)
VALUES
  (
    'Welcome Sequence',
    'Send a welcome WhatsApp message 5 minutes after a new lead is created, then a follow-up email after 1 day.',
    'onboarding',
    true,
    '{"nodes":[{"id":"t1","type":"trigger_lead_created","position":{"x":300,"y":60},"data":{"label":"Lead Created"}},{"id":"a1","type":"wait","position":{"x":300,"y":180},"data":{"label":"Wait 5 min","duration":5,"unit":"minutes"}},{"id":"a2","type":"send_whatsapp","position":{"x":300,"y":300},"data":{"label":"Send WhatsApp","template":"welcome_template"}},{"id":"a3","type":"wait","position":{"x":300,"y":420},"data":{"label":"Wait 1 day","duration":1,"unit":"days"}},{"id":"a4","type":"send_email","position":{"x":300,"y":540},"data":{"label":"Send Email","subject":"Welcome to Leadash!"}}],"edges":[{"id":"e1","source":"t1","target":"a1"},{"id":"e2","source":"a1","target":"a2"},{"id":"e3","source":"a2","target":"a3"},{"id":"e4","source":"a3","target":"a4"}]}'
  ),
  (
    'Trial Conversion',
    'When a workspace moves to trial, send a series of conversion-focused messages over 7 days.',
    'conversion',
    true,
    '{"nodes":[{"id":"t1","type":"trigger_subscription_trial","position":{"x":300,"y":60},"data":{"label":"Trial Started"}},{"id":"a1","type":"send_whatsapp","position":{"x":300,"y":180},"data":{"label":"Day 1 WhatsApp"}},{"id":"a2","type":"wait","position":{"x":300,"y":300},"data":{"label":"Wait 3 days","duration":3,"unit":"days"}},{"id":"a3","type":"send_email","position":{"x":300,"y":420},"data":{"label":"Day 3 Tips Email"}},{"id":"a4","type":"wait","position":{"x":300,"y":540},"data":{"label":"Wait 4 days","duration":4,"unit":"days"}},{"id":"a5","type":"send_whatsapp","position":{"x":300,"y":660},"data":{"label":"Day 7 Upgrade Nudge"}}],"edges":[{"id":"e1","source":"t1","target":"a1"},{"id":"e2","source":"a1","target":"a2"},{"id":"e3","source":"a2","target":"a3"},{"id":"e4","source":"a3","target":"a4"},{"id":"e5","source":"a4","target":"a5"}]}'
  ),
  (
    'Payment Failed Recovery',
    'When a payment fails, notify the workspace and retry follow-ups over 3 days.',
    'billing',
    true,
    '{"nodes":[{"id":"t1","type":"trigger_payment_failed","position":{"x":300,"y":60},"data":{"label":"Payment Failed"}},{"id":"a1","type":"send_email","position":{"x":300,"y":180},"data":{"label":"Payment Failed Email"}},{"id":"a2","type":"wait","position":{"x":300,"y":300},"data":{"label":"Wait 1 day","duration":1,"unit":"days"}},{"id":"a3","type":"send_whatsapp","position":{"x":300,"y":420},"data":{"label":"WhatsApp Reminder"}},{"id":"a4","type":"wait","position":{"x":300,"y":540},"data":{"label":"Wait 2 days","duration":2,"unit":"days"}},{"id":"a5","type":"send_email","position":{"x":300,"y":660},"data":{"label":"Final Warning Email"}}],"edges":[{"id":"e1","source":"t1","target":"a1"},{"id":"e2","source":"a1","target":"a2"},{"id":"e3","source":"a2","target":"a3"},{"id":"e4","source":"a3","target":"a4"},{"id":"e5","source":"a4","target":"a5"}]}'
  ),
  (
    'Re-engagement',
    'Reach out to contacts who have been inactive for 30+ days.',
    'retention',
    true,
    '{"nodes":[{"id":"t1","type":"trigger_contact_inactive","position":{"x":300,"y":60},"data":{"label":"Contact Inactive 30d","days":30}},{"id":"a1","type":"send_whatsapp","position":{"x":300,"y":180},"data":{"label":"Re-engagement WhatsApp"}},{"id":"a2","type":"wait","position":{"x":300,"y":300},"data":{"label":"Wait 3 days","duration":3,"unit":"days"}},{"id":"a3","type":"condition","position":{"x":300,"y":420},"data":{"label":"Opened WhatsApp?","field":"last_inbound_at","operator":"is_not_empty"}},{"id":"a4","type":"add_tag","position":{"x":160,"y":540},"data":{"label":"Tag: Re-engaged","tag":"re-engaged"}},{"id":"a5","type":"send_email","position":{"x":440,"y":540},"data":{"label":"Follow-up Email"}}],"edges":[{"id":"e1","source":"t1","target":"a1"},{"id":"e2","source":"a1","target":"a2"},{"id":"e3","source":"a2","target":"a3"},{"id":"e4","source":"a3","sourceHandle":"yes","target":"a4"},{"id":"e5","source":"a3","sourceHandle":"no","target":"a5"}]}'
  ),
  (
    'Funnel Purchase Follow-up',
    'After a funnel submission, enroll the contact in academy and send a thank-you WhatsApp.',
    'funnel',
    true,
    '{"nodes":[{"id":"t1","type":"trigger_funnel_submission","position":{"x":300,"y":60},"data":{"label":"Funnel Submission"}},{"id":"a1","type":"change_lifecycle","position":{"x":300,"y":180},"data":{"label":"Set as Customer","lifecycle":"customer"}},{"id":"a2","type":"grant_academy","position":{"x":300,"y":300},"data":{"label":"Grant Academy Access"}},{"id":"a3","type":"send_whatsapp","position":{"x":300,"y":420},"data":{"label":"Thank-you WhatsApp","template":"purchase_thankyou"}}],"edges":[{"id":"e1","source":"t1","target":"a1"},{"id":"e2","source":"a1","target":"a2"},{"id":"e3","source":"a2","target":"a3"}]}'
  )
ON CONFLICT DO NOTHING;

-- FK from automation_flows to templates (add after templates table exists)
ALTER TABLE automation_flows
  ADD CONSTRAINT IF NOT EXISTS automation_flows_template_id_fk
    FOREIGN KEY (template_id) REFERENCES automation_templates(id) ON DELETE SET NULL;
