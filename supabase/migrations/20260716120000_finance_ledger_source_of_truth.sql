-- ─── Finance: ledger becomes the single source of truth ────────────────────
-- Before this migration the finance surface had three parallel stores:
--   Layer A: finance_expenses + finance_income (Overview / Expenses / Income tabs)
--   Layer B: finance_transactions           (Ledger / Bank / Tax / Audit tabs)
--   Auto sync: billing_invoices/offer_purchases/challenge_signups wrote BOTH.
-- Manual entries in one layer never showed up in the other, so Overview
-- totals disagreed with Ledger totals disagreed with bank balances.
--
-- This migration installs mirror triggers so that:
--   * manual finance_income rows → finance_transactions (source_type='finance_income', kind='mirror')
--   * one-off finance_expenses rows → finance_transactions (source_type='finance_expenses', kind='mirror')
-- Recurring expenses stay in finance_expenses only — their monthly accrual
-- across a window is walked by finance_expense_history and Overview
-- aggregates from both surfaces (ledger for actuals, expenses for recurring
-- baseline).
--
-- It also:
--   * adds is_test to finance_transactions and syncs it from finance_income
--   * backfills every existing manual row into the ledger
--   * backfills bank_account_id on ledger rows that were NULL
--   * rewrites the three refund handlers to INSERT an inverse cogs.refunds
--     row instead of zeroing the original — preserving the fee we already
--     paid and reflecting real cash outflow. Historical zeroed rows are
--     restored and their refund inverses backfilled.

-- ── 1. Extend finance_transactions ─────────────────────────────────────────
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS finance_transactions_is_test_idx
  ON finance_transactions(is_test) WHERE is_test = true;

-- ── 2. Category mappers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_map_income_type_to_category(income_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE income_type
    WHEN 'plan'       THEN 'revenue.plan'
    WHEN 'academy'    THEN 'revenue.academy'
    WHEN 'offer'      THEN 'revenue.offer'
    WHEN 'credits'    THEN 'revenue.credits'
    WHEN 'addon'      THEN 'revenue.addon'
    WHEN 'external'   THEN 'revenue.external'
    WHEN 'partner'    THEN 'revenue.external'
    WHEN 'consulting' THEN 'revenue.external'
    WHEN 'grant'      THEN 'revenue.other'
    ELSE 'revenue.other'
  END;
$$;

CREATE OR REPLACE FUNCTION finance_expense_tx_type(exp_cat text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE exp_cat
    WHEN 'infra'     THEN 'cogs'
    WHEN 'salaries'  THEN 'opex'
    WHEN 'fees'      THEN 'cogs'
    WHEN 'marketing' THEN 'cogs'
    WHEN 'software'  THEN 'opex'
    WHEN 'oneoff'    THEN 'opex'
    WHEN 'refunds'   THEN 'cogs'
    ELSE 'opex'
  END;
$$;

CREATE OR REPLACE FUNCTION finance_expense_tx_category(exp_cat text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE exp_cat
    WHEN 'infra'     THEN 'cogs.infrastructure'
    WHEN 'salaries'  THEN 'opex.salary'
    WHEN 'fees'      THEN 'cogs.payment_fees'
    WHEN 'marketing' THEN 'cogs.ad_spend'
    WHEN 'software'  THEN 'opex.tools'
    WHEN 'oneoff'    THEN 'opex.other'
    WHEN 'refunds'   THEN 'cogs.refunds'
    ELSE 'opex.other'
  END;
$$;

-- ── 3. Mirror: finance_income → finance_transactions (manual rows only) ────
-- Auto (Paystack) rows already have their own tx sync trigger; only mirror
-- is_manual=true rows to avoid a double-insert on the source_type='finance_income'
-- path. kind='mirror' is required because the unique constraint
-- (source_type, source_id, kind) treats NULL kind as distinct.
CREATE OR REPLACE FUNCTION finance_mirror_income_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE default_account uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_manual THEN
      DELETE FROM finance_transactions
       WHERE source_type = 'finance_income' AND source_id = OLD.id::text AND kind = 'mirror';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT NEW.is_manual THEN RETURN NEW; END IF;

  SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;

  INSERT INTO finance_transactions (
    date, type, category, amount_ngn, description,
    is_auto, source_type, source_id, kind, is_test, bank_account_id
  ) VALUES (
    NEW.date, 'revenue', finance_map_income_type_to_category(NEW.type),
    NEW.amount_ngn, NEW.source_label,
    false, 'finance_income', NEW.id::text, 'mirror', NEW.is_test, default_account
  )
  ON CONFLICT (source_type, source_id, kind) DO UPDATE
    SET amount_ngn  = EXCLUDED.amount_ngn,
        date        = EXCLUDED.date,
        category    = EXCLUDED.category,
        description = EXCLUDED.description,
        is_test     = EXCLUDED.is_test,
        bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
        updated_at  = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_income_mirror ON finance_income;
CREATE TRIGGER finance_income_mirror
  AFTER INSERT OR UPDATE OR DELETE ON finance_income
  FOR EACH ROW EXECUTE FUNCTION finance_mirror_income_row();

-- ── 4. Mirror: finance_expenses (oneoff only) → finance_transactions ───────
-- Recurring expenses live in finance_expenses because their per-month accrual
-- across a window uses finance_expense_history; mirroring them as single
-- rows would misrepresent monthly totals. Overview aggregates recurring
-- from Layer A separately from ledger actuals.
CREATE OR REPLACE FUNCTION finance_mirror_expense_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE default_account uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM finance_transactions
     WHERE source_type = 'finance_expenses' AND source_id = OLD.id::text AND kind = 'mirror';
    RETURN OLD;
  END IF;

  IF NEW.kind <> 'oneoff' THEN
    -- Recurring: no mirror. But if this row USED to be oneoff (unlikely path,
    -- but harmless to cover), clean up any stale mirror row.
    DELETE FROM finance_transactions
     WHERE source_type = 'finance_expenses' AND source_id = NEW.id::text AND kind = 'mirror';
    RETURN NEW;
  END IF;

  SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;

  INSERT INTO finance_transactions (
    date, type, category, amount_ngn, description,
    is_auto, source_type, source_id, kind, bank_account_id
  ) VALUES (
    NEW.since,
    finance_expense_tx_type(NEW.category),
    finance_expense_tx_category(NEW.category),
    NEW.amount_ngn, NEW.name,
    false, 'finance_expenses', NEW.id::text, 'mirror', default_account
  )
  ON CONFLICT (source_type, source_id, kind) DO UPDATE
    SET amount_ngn  = EXCLUDED.amount_ngn,
        date        = EXCLUDED.date,
        type        = EXCLUDED.type,
        category    = EXCLUDED.category,
        description = EXCLUDED.description,
        bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
        updated_at  = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_expenses_mirror ON finance_expenses;
CREATE TRIGGER finance_expenses_mirror
  AFTER INSERT OR UPDATE OR DELETE ON finance_expenses
  FOR EACH ROW EXECUTE FUNCTION finance_mirror_expense_row();

-- ── 5. Backfill: existing manual rows into the ledger ──────────────────────
INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description,
  is_auto, source_type, source_id, kind, is_test, bank_account_id
)
SELECT
  fi.date, 'revenue', finance_map_income_type_to_category(fi.type),
  fi.amount_ngn, fi.source_label,
  false, 'finance_income', fi.id::text, 'mirror', fi.is_test,
  (SELECT default_bank_account_id FROM finance_settings WHERE id = 1)
FROM finance_income fi
WHERE fi.is_manual = true
ON CONFLICT (source_type, source_id, kind) DO UPDATE
  SET amount_ngn  = EXCLUDED.amount_ngn,
      date        = EXCLUDED.date,
      category    = EXCLUDED.category,
      description = EXCLUDED.description,
      is_test     = EXCLUDED.is_test,
      updated_at  = now();

INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description,
  is_auto, source_type, source_id, kind, bank_account_id
)
SELECT
  fe.since,
  finance_expense_tx_type(fe.category),
  finance_expense_tx_category(fe.category),
  fe.amount_ngn, fe.name,
  false, 'finance_expenses', fe.id::text, 'mirror',
  (SELECT default_bank_account_id FROM finance_settings WHERE id = 1)
FROM finance_expenses fe
WHERE fe.kind = 'oneoff'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;

-- ── 6. Backfill null bank_account_id ───────────────────────────────────────
UPDATE finance_transactions
   SET bank_account_id = (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
 WHERE bank_account_id IS NULL;

-- ── 7. Refund handlers: inverse row instead of zeroing ─────────────────────
-- The three auto-sync triggers previously did `SET amount_ngn = 0` on
-- refund. That understated cash outflow (the refund is a real cash-out
-- event) and hid the Paystack fee we already paid (Paystack does not refund
-- fees). Now: leave the gross + fee rows intact and INSERT a positive
-- cogs.refunds row (kind='refund') for the outflow.

CREATE OR REPLACE FUNCTION finance_tx_sync_billing_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  default_account uuid;
  orig_amount numeric;
  orig_account uuid;
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
    SELECT amount_ngn, bank_account_id INTO orig_amount, orig_account
      FROM finance_transactions
     WHERE source_type = 'billing_invoices' AND source_id = NEW.id::text AND kind = 'gross';
    -- If for any reason the gross row is missing, fall back to invoice amount.
    IF orig_amount IS NULL THEN
      orig_amount := GREATEST(0, ROUND(COALESCE(NEW.amount_kobo, 0) / 100.0));
    END IF;
    IF orig_account IS NULL THEN
      SELECT default_bank_account_id INTO orig_account FROM finance_settings WHERE id = 1;
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds',
      orig_amount,
      'Refund — ' || COALESCE(NULLIF(NEW.description, ''), NEW.type),
      NEW.paystack_reference,
      true, 'billing_invoices', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          reference  = EXCLUDED.reference,
          updated_at = now();
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
  orig_amount numeric;
  orig_account uuid;
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
    SELECT amount_ngn, bank_account_id INTO orig_amount, orig_account
      FROM finance_transactions
     WHERE source_type = 'offer_purchases' AND source_id = NEW.id::text AND kind = 'gross';
    IF orig_amount IS NULL THEN
      orig_amount := GREATEST(0, COALESCE(NEW.total_ngn, 0));
    END IF;
    IF orig_account IS NULL THEN
      SELECT default_bank_account_id INTO orig_account FROM finance_settings WHERE id = 1;
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds',
      orig_amount,
      'Refund — offer purchase',
      NEW.paystack_reference,
      true, 'offer_purchases', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          reference  = EXCLUDED.reference,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance_tx_sync_challenge_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  default_account uuid;
  orig_amount numeric;
  orig_account uuid;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;

    INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
    VALUES (
      COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'revenue', 'revenue.challenge',
      GREATEST(0, COALESCE(NEW.amount_ngn, 10000)),
      NEW.full_name || ' — 7-Day Challenge', true, 'challenge_signups', NEW.id::text, 'gross', default_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
      VALUES (
        COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2), 'Paystack fee — ' || NEW.full_name, true, 'challenge_signups', NEW.id::text, 'fee', default_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();
    END IF;

  ELSIF NEW.status = 'rejected' THEN
    SELECT amount_ngn, bank_account_id INTO orig_amount, orig_account
      FROM finance_transactions
     WHERE source_type = 'challenge_signups' AND source_id = NEW.id::text AND kind = 'gross';
    IF orig_amount IS NULL OR orig_amount = 0 THEN
      RETURN NEW; -- nothing to refund
    END IF;

    INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
    VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds',
      orig_amount,
      'Refund — ' || NEW.full_name || ' (7-Day Challenge)', true, 'challenge_signups', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- ── 8. Historical fixup: restore zero'd refunded rows + emit their inverses ─
-- Rows previously flagged as `[refunded]` had their gross amount set to 0.
-- Restore the amount from the source table and insert the cogs.refunds
-- inverse. Fee rows that were similarly zeroed are also restored (Paystack
-- kept the fee; that's a real cost).

-- Restore gross rows
UPDATE finance_transactions ft
   SET amount_ngn = GREATEST(0, ROUND(COALESCE(bi.amount_kobo, 0) / 100.0)),
       description = REGEXP_REPLACE(COALESCE(ft.description, ''), '^\[refunded\] ', ''),
       updated_at = now()
  FROM billing_invoices bi
 WHERE ft.source_type = 'billing_invoices' AND ft.source_id = bi.id::text AND ft.kind = 'gross'
   AND bi.status = 'refunded' AND ft.amount_ngn = 0;

UPDATE finance_transactions ft
   SET amount_ngn = GREATEST(0, COALESCE(op.total_ngn, 0)),
       description = REGEXP_REPLACE(COALESCE(ft.description, ''), '^\[refunded\] ', ''),
       updated_at = now()
  FROM offer_purchases op
 WHERE ft.source_type = 'offer_purchases' AND ft.source_id = op.id::text AND ft.kind = 'gross'
   AND op.status = 'refunded' AND ft.amount_ngn = 0;

-- Restore fee rows
UPDATE finance_transactions ft
   SET amount_ngn = ROUND(bi.fees_kobo / 100.0, 2), updated_at = now()
  FROM billing_invoices bi
 WHERE ft.source_type = 'billing_invoices' AND ft.source_id = bi.id::text AND ft.kind = 'fee'
   AND bi.status = 'refunded' AND ft.amount_ngn = 0 AND COALESCE(bi.fees_kobo, 0) > 0;

UPDATE finance_transactions ft
   SET amount_ngn = ROUND(op.fees_kobo / 100.0, 2), updated_at = now()
  FROM offer_purchases op
 WHERE ft.source_type = 'offer_purchases' AND ft.source_id = op.id::text AND ft.kind = 'fee'
   AND op.status = 'refunded' AND ft.amount_ngn = 0 AND COALESCE(op.fees_kobo, 0) > 0;

-- Emit refund inverse rows for historical refunds that never had one.
INSERT INTO finance_transactions (date, type, category, amount_ngn, description, reference, is_auto, source_type, source_id, kind, bank_account_id)
SELECT
  COALESCE(bi.created_at::date, CURRENT_DATE), 'cogs', 'cogs.refunds',
  GREATEST(0, ROUND(COALESCE(bi.amount_kobo, 0) / 100.0)),
  'Refund — ' || COALESCE(NULLIF(bi.description, ''), bi.type),
  bi.paystack_reference,
  true, 'billing_invoices', bi.id::text, 'refund',
  (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
FROM billing_invoices bi
WHERE bi.status = 'refunded'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;

INSERT INTO finance_transactions (date, type, category, amount_ngn, description, reference, is_auto, source_type, source_id, kind, bank_account_id)
SELECT
  COALESCE(op.granted_at::date, op.created_at::date, CURRENT_DATE), 'cogs', 'cogs.refunds',
  GREATEST(0, COALESCE(op.total_ngn, 0)),
  'Refund — offer purchase',
  op.paystack_reference,
  true, 'offer_purchases', op.id::text, 'refund',
  (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
FROM offer_purchases op
WHERE op.status = 'refunded'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;
