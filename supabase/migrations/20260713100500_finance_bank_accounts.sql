-- Bank accounts + opening/closing balance tracking. Cash tracking is
-- integrated into finance_transactions (nullable bank_account_id) rather
-- than a parallel cash ledger — this business is effectively cash-basis at
-- its current stage, and a second parallel ledger would double data entry
-- with no accountant yet hired to maintain accrual/cash reconciliation.
CREATE TABLE IF NOT EXISTS finance_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text,
  account_number_masked text,     -- e.g. "•••• 4821" — never store full numbers
  currency text NOT NULL DEFAULT 'NGN',
  opening_balance_ngn numeric(15,2) NOT NULL DEFAULT 0,
  opening_balance_date date NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_bank_accounts_one_default ON finance_bank_accounts (is_default) WHERE is_default;

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES finance_bank_accounts(id);
ALTER TABLE finance_settings ADD COLUMN IF NOT EXISTS default_bank_account_id uuid REFERENCES finance_bank_accounts(id);

ALTER TABLE finance_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_bank_accounts_admin_all ON finance_bank_accounts;
CREATE POLICY finance_bank_accounts_admin_all ON finance_bank_accounts FOR ALL USING (is_finance_admin()) WITH CHECK (is_finance_admin());

-- Seed a default "Primary Operating Account" and backfill every existing
-- transaction to it, so balances are meaningful immediately.
INSERT INTO finance_bank_accounts (name, opening_balance_ngn, opening_balance_date, is_default)
SELECT 'Primary Operating Account', 0, (SELECT COALESCE(MIN(date), CURRENT_DATE) FROM finance_transactions), true
WHERE NOT EXISTS (SELECT 1 FROM finance_bank_accounts WHERE is_default);

UPDATE finance_transactions SET bank_account_id = (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
WHERE bank_account_id IS NULL;

UPDATE finance_settings SET default_bank_account_id = (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1) WHERE id = 1;

-- Sync triggers now stamp bank_account_id from finance_settings.default_bank_account_id
-- on new auto rows (and preserve any manual re-tag via COALESCE on conflict).
CREATE OR REPLACE FUNCTION finance_tx_sync_billing_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  default_account uuid;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
    SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;
    SELECT name INTO ws_name FROM workspaces WHERE id = NEW.workspace_id;
    IF ws_name IS NULL THEN
      ws_name := COALESCE(NULLIF(NEW.description, ''), 'Paystack ' || NEW.type);
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      paid_date, 'revenue', finance_tx_map_billing_category(NEW.type),
      GREATEST(0, ROUND(COALESCE(NEW.amount_kobo, 0) / 100.0)),
      ws_name || ' — ' || COALESCE(NULLIF(NEW.description, ''), NEW.type),
      NEW.paystack_reference,
      true, 'billing_invoices', NEW.id::text, 'gross', default_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          category   = EXCLUDED.category,
          reference  = EXCLUDED.reference,
          bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
          updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (
        date, type, category, amount_ngn, description, reference,
        is_auto, source_type, source_id, kind, bank_account_id
      ) VALUES (
        paid_date, 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2),
        'Paystack fee — ' || ws_name,
        NEW.paystack_reference,
        true, 'billing_invoices', NEW.id::text, 'fee', default_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn,
            reference  = EXCLUDED.reference,
            bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
            updated_at = now();
    END IF;

  ELSIF NEW.status = 'refunded' THEN
    UPDATE finance_transactions
       SET amount_ngn = 0,
           description = '[refunded] ' || COALESCE(description, ''),
           updated_at = now()
     WHERE source_type = 'billing_invoices' AND source_id = NEW.id::text
       AND amount_ngn <> 0;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance_tx_sync_offer_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  default_account uuid;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.granted_at::date, NEW.created_at::date, CURRENT_DATE);
    SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;
    SELECT name INTO ws_name FROM workspaces WHERE id = NEW.workspace_id;
    IF ws_name IS NULL THEN
      ws_name := COALESCE(NULLIF(NEW.buyer_name, ''), NULLIF(NEW.buyer_email, ''), 'Offer purchase');
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      paid_date, 'revenue', 'revenue.offer',
      GREATEST(0, COALESCE(NEW.total_ngn, 0)),
      ws_name || ' — offer purchase',
      NEW.paystack_reference,
      true, 'offer_purchases', NEW.id::text, 'gross', default_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          reference  = EXCLUDED.reference,
          bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
          updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (
        date, type, category, amount_ngn, description, reference,
        is_auto, source_type, source_id, kind, bank_account_id
      ) VALUES (
        paid_date, 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2),
        'Paystack fee — ' || ws_name,
        NEW.paystack_reference,
        true, 'offer_purchases', NEW.id::text, 'fee', default_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn,
            reference  = EXCLUDED.reference,
            bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
            updated_at = now();
    END IF;

  ELSIF NEW.status = 'refunded' THEN
    UPDATE finance_transactions
       SET amount_ngn = 0,
           description = '[refunded] ' || COALESCE(description, ''),
           updated_at = now()
     WHERE source_type = 'offer_purchases' AND source_id = NEW.id::text
       AND amount_ngn <> 0;
  END IF;

  RETURN NEW;
END;
$$;
