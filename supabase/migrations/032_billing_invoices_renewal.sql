-- Ensure billing_invoices table exists (may have been created manually outside migrations)
-- and extend the type CHECK to include plan_renewal and inbox_billing.

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  type                text        NOT NULL,
  description         text,
  amount_kobo         bigint      NOT NULL DEFAULT 0,
  paystack_reference  text        UNIQUE,
  status              text        NOT NULL DEFAULT 'paid'
                                  CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Drop and recreate the type constraint to include new values.
-- We do it via a new constraint (the original may be named differently or absent).
ALTER TABLE billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_type_check;

ALTER TABLE billing_invoices
  ADD CONSTRAINT billing_invoices_type_check
  CHECK (type IN (
    'plan_subscription',
    'plan_renewal',
    'credit_purchase',
    'dedicated_ip',
    'dedicated_ip_renewal',
    'inbox_billing',
    'academy_enrollment',
    'domain_purchase'
  ));

-- Index for admin revenue queries (month-bucketed aggregations)
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created  ON billing_invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_ws       ON billing_invoices (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status   ON billing_invoices (status, created_at DESC);
