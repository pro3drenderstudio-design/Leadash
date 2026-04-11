-- ─── Managed sending domains ──────────────────────────────────────────────────
-- Tracks domains purchased through Leadash's domain-purchase wizard.
-- Each domain can have up to 5 inboxes, which warm up for 21 days before use.

CREATE TABLE outreach_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','purchasing','dns_pending','verifying','active','failed')),
  mailgun_domain      text,
  stripe_session_id   text,
  paystack_reference  text,
  payment_provider    text NOT NULL DEFAULT 'stripe'
                        CHECK (payment_provider IN ('stripe','paystack')),
  mailbox_count       int  NOT NULL DEFAULT 1
                        CHECK (mailbox_count BETWEEN 1 AND 5),
  mailbox_prefix      text NOT NULL DEFAULT 'outreach',
  first_name          text,
  last_name           text,
  daily_send_limit    int  NOT NULL DEFAULT 15,
  warmup_ends_at      timestamptz,
  error_message       text,
  dns_records         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outreach_domains_workspace_id_idx ON outreach_domains(workspace_id);

-- Link inboxes back to their provisioned domain (optional FK, nullable so
-- manually-added inboxes are unaffected)
ALTER TABLE outreach_inboxes
  ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES outreach_domains(id) ON DELETE SET NULL;
