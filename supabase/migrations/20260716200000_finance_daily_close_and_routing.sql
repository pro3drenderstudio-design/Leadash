-- ─── Finance: source-based routing + daily close + is_test on ledger ──────
-- Follow-up to mig 20260716120000. Fixes three concrete issues:
--
--  1. Challenge sales never reached finance_income (the mirror path only
--     existed for finance_income → finance_transactions, not the other
--     direction), so the Income tab was blind to them. This migration keeps
--     Layer A only for backward compat; the app now reads the ledger for
--     revenue. An "only reviewed revenue counts" rule is enforced upstream:
--     Ledger tab is the review gate, Income shows what passed.
--
--  2. Closing books was monthly only. We add finance_daily_reviews so the
--     accountant can tick off each day. Monthly close is unchanged and
--     retains the investor-sync semantics; daily close is a lightweight
--     checkpoint on top.
--
--  3. Every auto-sync trigger stamped bank_account_id from
--     finance_settings.default_bank_account_id. That meant Paystack revenue,
--     challenge revenue, and manual entries all had to share one account.
--     finance_source_routing lets each source type route to its own account
--     (e.g. Paystack → payout account, Challenge → ops account).

-- ── 1. Source routing map ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_source_routing (
  source_type      text PRIMARY KEY,
  bank_account_id  uuid REFERENCES finance_bank_accounts(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

-- Known routable sources. 'paystack' covers both billing_invoices and
-- offer_purchases — Paystack settles them into the same account regardless
-- of which product produced the payment. 'manual' is the default account
-- for hand-entered ledger rows via the Add Entry flow.
INSERT INTO finance_source_routing (source_type, bank_account_id)
SELECT s, (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
  FROM (VALUES ('paystack'), ('challenge_signups'), ('manual')) AS t(s)
ON CONFLICT (source_type) DO NOTHING;

ALTER TABLE finance_source_routing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_source_routing_admin_all ON finance_source_routing;
CREATE POLICY finance_source_routing_admin_all ON finance_source_routing
  FOR ALL USING (is_finance_admin()) WITH CHECK (is_finance_admin());

CREATE OR REPLACE FUNCTION finance_route_account(src text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT bank_account_id FROM finance_source_routing WHERE source_type = src),
    (SELECT default_bank_account_id FROM finance_settings WHERE id = 1),
    (SELECT id FROM finance_bank_accounts WHERE is_default LIMIT 1)
  );
$$;

-- ── 2. Daily close ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_daily_reviews (
  day         date PRIMARY KEY,
  closed_by   uuid,
  closed_at   timestamptz NOT NULL DEFAULT now(),
  close_note  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_daily_reviews_day_idx ON finance_daily_reviews(day DESC);

ALTER TABLE finance_daily_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_daily_reviews_admin_all ON finance_daily_reviews;
CREATE POLICY finance_daily_reviews_admin_all ON finance_daily_reviews
  FOR ALL USING (is_finance_admin()) WITH CHECK (is_finance_admin());

-- ── 3. Update all three sync triggers to use routing ──────────────────────
CREATE OR REPLACE FUNCTION finance_tx_sync_billing_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  target_account uuid;
  orig_amount numeric;
  orig_account uuid;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
    target_account := finance_route_account('paystack');
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
      true, 'billing_invoices', NEW.id::text, 'gross', target_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          category   = EXCLUDED.category,
          reference  = EXCLUDED.reference,
          -- Only fill bank_account_id if it's currently NULL; do NOT overwrite
          -- an existing tag (accountant may have manually re-routed a row).
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
        true, 'billing_invoices', NEW.id::text, 'fee', target_account
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
    IF orig_amount IS NULL THEN
      orig_amount := GREATEST(0, ROUND(COALESCE(NEW.amount_kobo, 0) / 100.0));
    END IF;
    IF orig_account IS NULL THEN
      orig_account := finance_route_account('paystack');
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds', orig_amount,
      'Refund — ' || COALESCE(NULLIF(NEW.description, ''), NEW.type),
      NEW.paystack_reference,
      true, 'billing_invoices', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn, reference = EXCLUDED.reference, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance_tx_sync_offer_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  target_account uuid;
  orig_amount numeric;
  orig_account uuid;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.granted_at::date, NEW.created_at::date, CURRENT_DATE);
    target_account := finance_route_account('paystack');
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
      true, 'offer_purchases', NEW.id::text, 'gross', target_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn, reference = EXCLUDED.reference,
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
        true, 'offer_purchases', NEW.id::text, 'fee', target_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn, reference = EXCLUDED.reference,
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
      orig_account := finance_route_account('paystack');
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind, bank_account_id
    ) VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds', orig_amount,
      'Refund — offer purchase', NEW.paystack_reference,
      true, 'offer_purchases', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn, reference = EXCLUDED.reference, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance_tx_sync_challenge_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_account uuid;
  orig_amount numeric;
  orig_account uuid;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    target_account := finance_route_account('challenge_signups');

    INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
    VALUES (
      COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'revenue', 'revenue.challenge',
      GREATEST(0, COALESCE(NEW.amount_ngn, 10000)),
      NEW.full_name || ' — 7-Day Challenge', true, 'challenge_signups', NEW.id::text, 'gross', target_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
          updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
      VALUES (
        COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2), 'Paystack fee — ' || NEW.full_name, true, 'challenge_signups', NEW.id::text, 'fee', target_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn,
            bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
            updated_at = now();
    END IF;

  ELSIF NEW.status = 'rejected' THEN
    SELECT amount_ngn, bank_account_id INTO orig_amount, orig_account
      FROM finance_transactions
     WHERE source_type = 'challenge_signups' AND source_id = NEW.id::text AND kind = 'gross';
    IF orig_amount IS NULL OR orig_amount = 0 THEN
      RETURN NEW;
    END IF;

    INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
    VALUES (
      CURRENT_DATE, 'cogs', 'cogs.refunds', orig_amount,
      'Refund — ' || NEW.full_name || ' (7-Day Challenge)', true, 'challenge_signups', NEW.id::text, 'refund', orig_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Update mirror triggers (from mig 080) to use routing['manual'] ─────
CREATE OR REPLACE FUNCTION finance_mirror_income_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_account uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_manual THEN
      DELETE FROM finance_transactions
       WHERE source_type = 'finance_income' AND source_id = OLD.id::text AND kind = 'mirror';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT NEW.is_manual THEN RETURN NEW; END IF;
  target_account := finance_route_account('manual');

  -- Manual entries are admin-initiated; born already reviewed so they show
  -- in Income tab immediately (the tab filters for reviewed revenue).
  INSERT INTO finance_transactions (
    date, type, category, amount_ngn, description,
    is_auto, source_type, source_id, kind, is_test, bank_account_id, review_status
  ) VALUES (
    NEW.date, 'revenue', finance_map_income_type_to_category(NEW.type),
    NEW.amount_ngn, NEW.source_label,
    false, 'finance_income', NEW.id::text, 'mirror', NEW.is_test, target_account, 'reviewed'
  )
  ON CONFLICT (source_type, source_id, kind) DO UPDATE
    SET amount_ngn = EXCLUDED.amount_ngn, date = EXCLUDED.date,
        category = EXCLUDED.category, description = EXCLUDED.description,
        is_test = EXCLUDED.is_test,
        bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
        updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance_mirror_expense_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_account uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM finance_transactions
     WHERE source_type = 'finance_expenses' AND source_id = OLD.id::text AND kind = 'mirror';
    RETURN OLD;
  END IF;

  IF NEW.kind <> 'oneoff' THEN
    DELETE FROM finance_transactions
     WHERE source_type = 'finance_expenses' AND source_id = NEW.id::text AND kind = 'mirror';
    RETURN NEW;
  END IF;

  target_account := finance_route_account('manual');

  INSERT INTO finance_transactions (
    date, type, category, amount_ngn, description,
    is_auto, source_type, source_id, kind, bank_account_id, review_status
  ) VALUES (
    NEW.since,
    finance_expense_tx_type(NEW.category),
    finance_expense_tx_category(NEW.category),
    NEW.amount_ngn, NEW.name,
    false, 'finance_expenses', NEW.id::text, 'mirror', target_account, 'reviewed'
  )
  ON CONFLICT (source_type, source_id, kind) DO UPDATE
    SET amount_ngn = EXCLUDED.amount_ngn, date = EXCLUDED.date,
        type = EXCLUDED.type, category = EXCLUDED.category,
        description = EXCLUDED.description,
        bank_account_id = COALESCE(finance_transactions.bank_account_id, EXCLUDED.bank_account_id),
        updated_at = now();

  RETURN NEW;
END;
$$;

-- ── 5. Backfill historical rows to their routed account ───────────────────
-- Only rewrites rows still tagged to the default account (i.e. never manually
-- re-tagged by an accountant). Rows already pointed elsewhere are preserved.
UPDATE finance_transactions ft
   SET bank_account_id = finance_route_account('paystack'),
       updated_at = now()
 WHERE ft.source_type IN ('billing_invoices', 'offer_purchases')
   AND ft.bank_account_id = (SELECT default_bank_account_id FROM finance_settings WHERE id = 1)
   AND finance_route_account('paystack') <> ft.bank_account_id;

UPDATE finance_transactions ft
   SET bank_account_id = finance_route_account('challenge_signups'),
       updated_at = now()
 WHERE ft.source_type = 'challenge_signups'
   AND ft.bank_account_id = (SELECT default_bank_account_id FROM finance_settings WHERE id = 1)
   AND finance_route_account('challenge_signups') <> ft.bank_account_id;
