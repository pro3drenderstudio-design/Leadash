-- ─── Finance — categorized ledger (revenue/cogs/opex/tax) ────────────────────
-- Transaction-level ledger powering the P&L, tax estimates, and accountant
-- audit workflow. Ported from mizark-partners' financial_transactions design,
-- minus its division concept (Leadash is a single business).
--
-- Auto-feed: paid billing_invoices / offer_purchases each produce a GROSS
-- revenue row plus (when fees_kobo > 0) a cogs/payment_fees row — proper
-- accounting: gross revenue and fee expense recorded separately, net profit
-- falls out of the rollups. The existing 075 finance_income sync is left
-- unchanged (Income tab keeps gross semantics).
--
-- Audit workflow: every auto row starts review_status='unreviewed'; the
-- accountant reviews/flags on their own cadence, adds adjusting entries
-- (adjusts_id), and signs off months in finance_periods. Closed months are
-- locked by trigger — late-arriving auto rows are re-dated into the earliest
-- open month with a "[late: …]" description prefix (standard late-posting).

-- ── 1. Ledger table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  type          text NOT NULL CHECK (type IN ('revenue','cogs','opex','tax')),
  category      text NOT NULL,
  amount_ngn    numeric(15,2) NOT NULL CHECK (amount_ngn >= 0),
  description   text,
  reference     text,
  is_auto       boolean NOT NULL DEFAULT false,
  source_type   text,
  source_id     text,
  kind          text,  -- 'gross' | 'fee' for auto rows; NULL for manual entries
  review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','reviewed','flagged')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_note   text,
  adjusts_id    uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tx_source_uniq UNIQUE (source_type, source_id, kind)
);

CREATE INDEX IF NOT EXISTS finance_tx_date_idx   ON finance_transactions (date);
CREATE INDEX IF NOT EXISTS finance_tx_type_idx   ON finance_transactions (type);
CREATE INDEX IF NOT EXISTS finance_tx_review_idx ON finance_transactions (review_status)
  WHERE review_status <> 'reviewed';

-- ── 2. Periods (monthly close/sign-off) + append-only audit log ─────────────
CREATE TABLE IF NOT EXISTS finance_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE,  -- always the first of the month
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by    uuid,
  closed_at    timestamptz,
  close_note   text,
  reopened_by  uuid,
  reopened_at  timestamptz,
  sync_status  text,        -- mizark-partners sync: null | 'synced' | 'failed' | 'retracted'
  synced_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       uuid NOT NULL,
  action      text NOT NULL,  -- 'review','flag','close_period','reopen_period','adjust','manual_entry','manual_edit','manual_delete','backfill','sync','retract'
  entity_type text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_audit_created_idx ON finance_audit_log (created_at DESC);

-- ── 3. updated_at maintenance (reuses 074's trigger fn) ─────────────────────
DROP TRIGGER IF EXISTS finance_tx_updated_at ON finance_transactions;
CREATE TRIGGER finance_tx_updated_at
  BEFORE UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_at();

-- ── 4. Period lock ───────────────────────────────────────────────────────────
-- Rejects writes into closed months, with two carve-outs:
--   a) review-only updates (review_status/reviewed_by/reviewed_at/review_note)
--      remain allowed so flags can be resolved after close;
--   b) INSERTs by the sync triggers re-date into the earliest open month with
--      a "[late: <original date>]" description prefix instead of failing —
--      Paystack events must never be dropped because a month was closed.
CREATE OR REPLACE FUNCTION finance_tx_period_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_date date;
  is_closed boolean;
  fallback_month date;
BEGIN
  target_date := COALESCE(NEW.date, OLD.date);

  SELECT (status = 'closed') INTO is_closed
    FROM finance_periods
   WHERE period_month = date_trunc('month', target_date)::date;
  IF NOT COALESCE(is_closed, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Allow review-field-only updates on rows in closed months.
    IF NEW.date IS NOT DISTINCT FROM OLD.date
       AND NEW.type IS NOT DISTINCT FROM OLD.type
       AND NEW.category IS NOT DISTINCT FROM OLD.category
       AND NEW.amount_ngn IS NOT DISTINCT FROM OLD.amount_ngn
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.reference IS NOT DISTINCT FROM OLD.reference
       AND NEW.kind IS NOT DISTINCT FROM OLD.kind THEN
      RETURN NEW;
    END IF;
    -- Sync triggers updating auto rows in a closed month: silently keep old values.
    IF NEW.is_auto THEN
      RETURN NULL; -- BEFORE trigger returning NULL skips the update
    END IF;
    RAISE EXCEPTION 'finance period % is closed — record an adjusting entry in the open period instead',
      to_char(target_date, 'YYYY-MM');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finance period % is closed — rows cannot be deleted from closed books',
      to_char(target_date, 'YYYY-MM');
  END IF;

  -- INSERT into a closed month
  IF NEW.is_auto THEN
    SELECT COALESCE(
      (SELECT MIN(period_month) FROM finance_periods
        WHERE status = 'open' AND period_month > date_trunc('month', target_date)::date),
      date_trunc('month', CURRENT_DATE)::date
    ) INTO fallback_month;
    NEW.description := '[late: ' || to_char(NEW.date, 'YYYY-MM-DD') || '] ' || COALESCE(NEW.description, '');
    NEW.date := fallback_month;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'finance period % is closed — date the entry in the open period instead',
    to_char(target_date, 'YYYY-MM');
END;
$$;

DROP TRIGGER IF EXISTS finance_tx_period_lock ON finance_transactions;
CREATE TRIGGER finance_tx_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION finance_tx_period_guard();

-- ── 5. Category mapping billing type → ledger revenue category ──────────────
CREATE OR REPLACE FUNCTION finance_tx_map_billing_category(billing_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'revenue.' || finance_map_billing_type(billing_type);
$$;

-- ── 6. Sync trigger: billing_invoices → finance_transactions ────────────────
CREATE OR REPLACE FUNCTION finance_tx_sync_billing_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
    SELECT name INTO ws_name FROM workspaces WHERE id = NEW.workspace_id;
    IF ws_name IS NULL THEN
      ws_name := COALESCE(NULLIF(NEW.description, ''), 'Paystack ' || NEW.type);
    END IF;

    -- Gross revenue row
    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind
    ) VALUES (
      paid_date, 'revenue', finance_tx_map_billing_category(NEW.type),
      GREATEST(0, ROUND(COALESCE(NEW.amount_kobo, 0) / 100.0)),
      ws_name || ' — ' || COALESCE(NULLIF(NEW.description, ''), NEW.type),
      NEW.paystack_reference,
      true, 'billing_invoices', NEW.id::text, 'gross'
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          category   = EXCLUDED.category,
          reference  = EXCLUDED.reference,
          updated_at = now();

    -- Paystack fee row (only when a fee is known and non-zero)
    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (
        date, type, category, amount_ngn, description, reference,
        is_auto, source_type, source_id, kind
      ) VALUES (
        paid_date, 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2),
        'Paystack fee — ' || ws_name,
        NEW.paystack_reference,
        true, 'billing_invoices', NEW.id::text, 'fee'
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn,
            reference  = EXCLUDED.reference,
            updated_at = now();
    END IF;

  ELSIF NEW.status = 'refunded' THEN
    -- Zero out (preserves the audit trail; excluded from totals by amount)
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

DROP TRIGGER IF EXISTS billing_invoices_finance_tx_sync ON billing_invoices;
CREATE TRIGGER billing_invoices_finance_tx_sync
  AFTER INSERT OR UPDATE OF status, amount_kobo, fees_kobo
  ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION finance_tx_sync_billing_row();

-- ── 7. Sync trigger: offer_purchases → finance_transactions ─────────────────
CREATE OR REPLACE FUNCTION finance_tx_sync_offer_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
BEGIN
  IF NEW.status = 'paid' THEN
    paid_date := COALESCE(NEW.granted_at::date, NEW.created_at::date, CURRENT_DATE);
    SELECT name INTO ws_name FROM workspaces WHERE id = NEW.workspace_id;
    IF ws_name IS NULL THEN
      ws_name := COALESCE(NULLIF(NEW.buyer_name, ''), NULLIF(NEW.buyer_email, ''), 'Offer purchase');
    END IF;

    INSERT INTO finance_transactions (
      date, type, category, amount_ngn, description, reference,
      is_auto, source_type, source_id, kind
    ) VALUES (
      paid_date, 'revenue', 'revenue.offer',
      GREATEST(0, COALESCE(NEW.total_ngn, 0)),
      ws_name || ' — offer purchase',
      NEW.paystack_reference,
      true, 'offer_purchases', NEW.id::text, 'gross'
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE
      SET amount_ngn = EXCLUDED.amount_ngn,
          reference  = EXCLUDED.reference,
          updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (
        date, type, category, amount_ngn, description, reference,
        is_auto, source_type, source_id, kind
      ) VALUES (
        paid_date, 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2),
        'Paystack fee — ' || ws_name,
        NEW.paystack_reference,
        true, 'offer_purchases', NEW.id::text, 'fee'
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE
        SET amount_ngn = EXCLUDED.amount_ngn,
            reference  = EXCLUDED.reference,
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

DROP TRIGGER IF EXISTS offer_purchases_finance_tx_sync ON offer_purchases;
CREATE TRIGGER offer_purchases_finance_tx_sync
  AFTER INSERT OR UPDATE OF status, total_ngn, fees_kobo
  ON offer_purchases
  FOR EACH ROW EXECUTE FUNCTION finance_tx_sync_offer_row();

-- ── 8. Tax/VAT settings ──────────────────────────────────────────────────────
ALTER TABLE finance_settings
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_pricing_mode text NOT NULL DEFAULT 'inclusive'
    CHECK (vat_pricing_mode IN ('inclusive','exclusive')),
  ADD COLUMN IF NOT EXISTS firs_tin text;

-- ── 9. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_transactions_admin_all ON finance_transactions;
CREATE POLICY finance_transactions_admin_all
  ON finance_transactions FOR ALL
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

DROP POLICY IF EXISTS finance_periods_admin_all ON finance_periods;
CREATE POLICY finance_periods_admin_all
  ON finance_periods FOR ALL
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

DROP POLICY IF EXISTS finance_audit_log_admin_all ON finance_audit_log;
CREATE POLICY finance_audit_log_admin_all
  ON finance_audit_log FOR ALL
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

-- ── 10. One-time backfill from historical paid rows ─────────────────────────
INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description, reference,
  is_auto, source_type, source_id, kind
)
SELECT
  COALESCE(bi.created_at::date, CURRENT_DATE),
  'revenue', finance_tx_map_billing_category(bi.type),
  GREATEST(0, ROUND(COALESCE(bi.amount_kobo, 0) / 100.0)),
  COALESCE(w.name, NULLIF(bi.description, ''), 'Paystack ' || bi.type) || ' — ' || COALESCE(NULLIF(bi.description, ''), bi.type),
  bi.paystack_reference,
  true, 'billing_invoices', bi.id::text, 'gross'
FROM billing_invoices bi
LEFT JOIN workspaces w ON w.id = bi.workspace_id
WHERE bi.status = 'paid'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;

INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description, reference,
  is_auto, source_type, source_id, kind
)
SELECT
  COALESCE(bi.created_at::date, CURRENT_DATE),
  'cogs', 'cogs.payment_fees',
  ROUND(bi.fees_kobo / 100.0, 2),
  'Paystack fee — ' || COALESCE(w.name, NULLIF(bi.description, ''), bi.type),
  bi.paystack_reference,
  true, 'billing_invoices', bi.id::text, 'fee'
FROM billing_invoices bi
LEFT JOIN workspaces w ON w.id = bi.workspace_id
WHERE bi.status = 'paid' AND COALESCE(bi.fees_kobo, 0) > 0
ON CONFLICT (source_type, source_id, kind) DO NOTHING;

INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description, reference,
  is_auto, source_type, source_id, kind
)
SELECT
  COALESCE(op.granted_at::date, op.created_at::date, CURRENT_DATE),
  'revenue', 'revenue.offer',
  GREATEST(0, COALESCE(op.total_ngn, 0)),
  COALESCE(w.name, NULLIF(op.buyer_name, ''), NULLIF(op.buyer_email, ''), 'Offer purchase') || ' — offer purchase',
  op.paystack_reference,
  true, 'offer_purchases', op.id::text, 'gross'
FROM offer_purchases op
LEFT JOIN workspaces w ON w.id = op.workspace_id
WHERE op.status = 'paid'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;

INSERT INTO finance_transactions (
  date, type, category, amount_ngn, description, reference,
  is_auto, source_type, source_id, kind
)
SELECT
  COALESCE(op.granted_at::date, op.created_at::date, CURRENT_DATE),
  'cogs', 'cogs.payment_fees',
  ROUND(op.fees_kobo / 100.0, 2),
  'Paystack fee — ' || COALESCE(w.name, NULLIF(op.buyer_name, ''), NULLIF(op.buyer_email, ''), 'Offer purchase'),
  op.paystack_reference,
  true, 'offer_purchases', op.id::text, 'fee'
FROM offer_purchases op
LEFT JOIN workspaces w ON w.id = op.workspace_id
WHERE op.status = 'paid' AND COALESCE(op.fees_kobo, 0) > 0
ON CONFLICT (source_type, source_id, kind) DO NOTHING;
