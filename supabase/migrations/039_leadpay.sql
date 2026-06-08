-- ── LeadPay: payment infrastructure for freelancers ─────────────────────────

-- Account (one per workspace, stores KYC + balances)
CREATE TABLE leadpay_accounts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  account_type            text        NOT NULL DEFAULT 'individual', -- individual | business
  status                  text        NOT NULL DEFAULT 'pending',    -- pending | active | suspended | rejected
  kyc_status              text        NOT NULL DEFAULT 'unverified', -- unverified | pending | verified | rejected | needs_more_info
  kyc_rejection_reason    text,
  kyc_submitted_at        timestamptz,
  kyc_reviewed_at         timestamptz,

  -- Personal info
  legal_first_name        text,
  legal_last_name         text,
  date_of_birth           date,
  phone                   text,
  profession              text,

  -- Business info (optional)
  business_name           text,
  rc_number               text,
  business_type           text,
  website                 text,

  -- Identity verification (stored as plain text — encrypt at app layer before insert)
  bvn                     text,
  nin                     text,

  -- Profile & invoice customisation
  display_name            text,
  logo_url                text,
  brand_color             text        DEFAULT '#f97316',
  invoice_footer          text,
  invoice_note_template   text,

  -- Balances (USD cents)
  usd_balance_cents       integer     NOT NULL DEFAULT 0,
  usd_pending_cents       integer     NOT NULL DEFAULT 0,

  -- Transaction PIN (bcrypt hash stored at app layer)
  pin_hash                text,

  -- Admin notes
  admin_note              text,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Bank accounts
CREATE TABLE leadpay_bank_accounts (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_number  text  NOT NULL,
  account_name    text  NOT NULL,
  bank_name       text  NOT NULL,
  bank_code       text  NOT NULL,
  is_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- Clients directory
CREATE TABLE leadpay_clients (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name    text  NOT NULL,
  last_name     text,
  company       text,
  email         text  NOT NULL,
  country       text,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Invoices
CREATE TABLE leadpay_invoices (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id       uuid    REFERENCES leadpay_clients(id) ON DELETE SET NULL,
  invoice_number  text    NOT NULL,
  status          text    NOT NULL DEFAULT 'draft',
  -- draft | sent | viewed | paid | overdue | cancelled

  -- Line items: [{ description, quantity, unit_price_cents, total_cents }]
  line_items      jsonb   NOT NULL DEFAULT '[]',

  -- Amounts (USD cents)
  subtotal_cents  integer NOT NULL DEFAULT 0,
  tax_rate        decimal(5,2)     DEFAULT 0,
  tax_cents       integer NOT NULL DEFAULT 0,
  total_cents     integer NOT NULL DEFAULT 0,

  issue_date      date    NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  paid_at         timestamptz,

  -- Public payment URL token
  payment_token   text    UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),

  -- Snapshot of client email at send time
  client_email    text,
  client_name     text,
  last_sent_at    timestamptz,
  viewed_at       timestamptz,

  -- Post-payment FX snapshot
  fx_rate         decimal(12,6),
  platform_fee_cents integer DEFAULT 0,
  net_usd_cents   integer DEFAULT 0,

  notes           text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE (workspace_id, invoice_number)
);

-- Invoice activity log
CREATE TABLE leadpay_invoice_events (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid  NOT NULL REFERENCES leadpay_invoices(id) ON DELETE CASCADE,
  -- created | sent | viewed | payment_attempted | paid | reminded | cancelled
  event       text  NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- Payouts (USD → NGN bank transfer)
CREATE TABLE leadpay_payouts (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bank_account_id     uuid    REFERENCES leadpay_bank_accounts(id) ON DELETE SET NULL,

  usd_amount_cents    integer NOT NULL,
  fx_rate             decimal(12,6) NOT NULL DEFAULT 1,
  fx_fee_cents        integer NOT NULL DEFAULT 0,
  ngn_amount_kobo     bigint  NOT NULL DEFAULT 0,

  -- pending | processing | completed | failed
  status              text    NOT NULL DEFAULT 'pending',
  failure_reason      text,

  -- External provider reference (Flutterwave transfer ID)
  provider_ref        text,

  -- Admin
  approved_by         text,
  approved_at         timestamptz,
  rejection_reason    text,

  reference           text    UNIQUE DEFAULT 'LP-' || upper(encode(extensions.gen_random_bytes(6), 'hex')),

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Virtual cards
CREATE TABLE leadpay_cards (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label                 text    NOT NULL,

  -- Provider card details (from Sudo Africa)
  provider_card_id      text,
  last_four             text,
  expiry_month          text,
  expiry_year           text,
  masked_pan            text,

  -- active | frozen | terminated
  status                text    NOT NULL DEFAULT 'active',

  -- Balance & limits (USD cents)
  balance_cents         integer NOT NULL DEFAULT 0,
  monthly_limit_cents   integer,

  -- Fees paid at creation
  creation_fee_cents    integer DEFAULT 0,

  -- Admin approval for card creation
  approved_at           timestamptz,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Card transactions
CREATE TABLE leadpay_card_transactions (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           uuid    NOT NULL REFERENCES leadpay_cards(id) ON DELETE CASCADE,
  workspace_id      uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  merchant          text,
  merchant_category text,
  amount_cents      integer NOT NULL,
  currency          text    NOT NULL DEFAULT 'USD',
  -- approved | declined | reversed | refunded
  status            text    NOT NULL DEFAULT 'approved',
  decline_reason    text,

  provider_ref      text,
  created_at        timestamptz DEFAULT now()
);

-- Unified transaction ledger
CREATE TABLE leadpay_transactions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- invoice_payment | payout | card_spend | card_funding | fee | refund | adjustment
  type          text    NOT NULL,

  -- Related entities (optional)
  invoice_id    uuid    REFERENCES leadpay_invoices(id) ON DELETE SET NULL,
  payout_id     uuid    REFERENCES leadpay_payouts(id)  ON DELETE SET NULL,
  card_id       uuid    REFERENCES leadpay_cards(id)    ON DELETE SET NULL,

  description   text    NOT NULL,

  -- Positive = credit, negative = debit (USD cents)
  usd_amount_cents  integer,
  -- For NGN movements
  ngn_amount_kobo   bigint,

  -- completed | pending | failed | reversed
  status        text    NOT NULL DEFAULT 'completed',

  reference     text    UNIQUE DEFAULT 'TX-' || upper(encode(extensions.gen_random_bytes(8), 'hex')),

  created_at    timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_lp_accounts_workspace       ON leadpay_accounts(workspace_id);
CREATE INDEX idx_lp_invoices_workspace       ON leadpay_invoices(workspace_id);
CREATE INDEX idx_lp_invoices_status          ON leadpay_invoices(status);
CREATE INDEX idx_lp_invoices_token           ON leadpay_invoices(payment_token);
CREATE INDEX idx_lp_invoices_due             ON leadpay_invoices(due_date) WHERE status NOT IN ('paid','cancelled');
CREATE INDEX idx_lp_clients_workspace        ON leadpay_clients(workspace_id);
CREATE INDEX idx_lp_bank_accounts_workspace  ON leadpay_bank_accounts(workspace_id);
CREATE INDEX idx_lp_payouts_workspace        ON leadpay_payouts(workspace_id);
CREATE INDEX idx_lp_payouts_status           ON leadpay_payouts(status);
CREATE INDEX idx_lp_cards_workspace          ON leadpay_cards(workspace_id);
CREATE INDEX idx_lp_card_txns_card           ON leadpay_card_transactions(card_id);
CREATE INDEX idx_lp_card_txns_workspace      ON leadpay_card_transactions(workspace_id);
CREATE INDEX idx_lp_transactions_workspace   ON leadpay_transactions(workspace_id);
CREATE INDEX idx_lp_transactions_created     ON leadpay_transactions(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE leadpay_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_bank_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_invoice_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_payouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_cards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadpay_transactions      ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all app queries use service role key
-- (same pattern as the rest of the Leadash schema)

-- ── Admin settings seeds ─────────────────────────────────────────────────────
INSERT INTO admin_settings (key, value) VALUES
  ('leadpay_platform_fee_pct',         '2.5'),
  ('leadpay_fx_spread_pct',            '1.5'),
  ('leadpay_min_fee_cents',            '100'),
  ('leadpay_card_creation_fee_cents',  '500'),
  ('leadpay_card_monthly_fee_cents',   '0'),
  ('leadpay_min_payout_ngn',          '5000'),
  ('leadpay_auto_approve_payout_ngn', '500000'),
  ('leadpay_max_invoice_usd',         '50000'),
  ('leadpay_card_max_per_user',       '5'),
  ('leadpay_enabled',                 'true')
ON CONFLICT (key) DO NOTHING;
