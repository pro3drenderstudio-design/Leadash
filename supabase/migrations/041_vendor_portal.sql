-- Vendor invoices: auto-generated daily per provisioning batch
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   text UNIQUE NOT NULL,          -- LDV-YYYYMMDD[-N]
  invoice_date     date NOT NULL DEFAULT CURRENT_DATE,
  inbox_ids        uuid[] NOT NULL DEFAULT '{}',
  inbox_count      integer NOT NULL DEFAULT 0,
  cost_per_inbox_usd numeric(10,2) NOT NULL DEFAULT 2.00,
  total_usd        numeric(10,2) NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','paid','void')),
  paypal_payment_id   text,
  paypal_payment_url  text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_invoices_date_idx ON vendor_invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS vendor_invoices_status_idx ON vendor_invoices (status);

-- Vendor config in admin_settings
INSERT INTO admin_settings (key, value) VALUES
  ('vendor_cost_per_inbox_usd', '2.00'),
  ('vendor_email',              '"vendor@example.com"'),
  ('vendor_portal_enabled',     'true')
ON CONFLICT (key) DO NOTHING;

-- Track per-inbox vendor lifecycle
ALTER TABLE outreach_inboxes
  ADD COLUMN IF NOT EXISTS vendor_invoice_id uuid REFERENCES vendor_invoices(id),
  ADD COLUMN IF NOT EXISTS vendor_cancelled_at timestamptz;
