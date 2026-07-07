-- ─── Finance — Paystack sync ────────────────────────────────────────────────
-- Mirror successful Paystack payments (from `billing_invoices` and
-- `offer_purchases`) into `finance_income` so the finance manager reflects
-- real revenue automatically, without needing a webhook change in app code.
--
-- Idempotency: (source_type, source_id) is unique — the same billing_invoice
-- or offer_purchase can only produce one finance_income row. Triggers use
-- UPSERT so a row that transitions pending → paid produces one row; a paid
-- row edited stays as one row.
--
-- Refunds: on status change to 'refunded' the mirrored income row is flagged
-- is_test=true rather than deleted, preserving the audit trail while
-- excluding it from Overview / Reports totals.

-- ── 1. Provenance columns + unique key ──────────────────────────────────────
ALTER TABLE finance_income
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id   text;

-- Partial unique index — only when both are set (manual rows have both NULL).
CREATE UNIQUE INDEX IF NOT EXISTS finance_income_source_uniq
  ON finance_income (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_income_source_type_idx
  ON finance_income (source_type)
  WHERE source_type IS NOT NULL;

-- ── 2. Type mapping — billing_invoices.type → finance_income.type ───────────
CREATE OR REPLACE FUNCTION finance_map_billing_type(billing_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE billing_type
    WHEN 'plan_subscription'    THEN 'plan'
    WHEN 'plan_renewal'         THEN 'plan'
    WHEN 'credit_purchase'      THEN 'credits'
    WHEN 'academy_enrollment'   THEN 'academy'
    WHEN 'dedicated_ip'         THEN 'addon'
    WHEN 'dedicated_ip_renewal' THEN 'addon'
    WHEN 'inbox_billing'        THEN 'addon'
    WHEN 'domain_purchase'      THEN 'addon'
    ELSE 'addon'
  END;
$$;

-- ── 3. Sync trigger: billing_invoices → finance_income ──────────────────────
CREATE OR REPLACE FUNCTION finance_sync_billing_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws_name text;
  paid_date date;
  mapped_type text;
BEGIN
  -- Only mirror completed payments.
  IF NEW.status = 'paid' THEN
    mapped_type := finance_map_billing_type(NEW.type);
    paid_date   := COALESCE(NEW.paid_at::date, NEW.created_at::date, CURRENT_DATE);

    -- Prefer the workspace's name; fall back to the description; then the type.
    SELECT name INTO ws_name FROM workspaces WHERE id = NEW.workspace_id;
    IF ws_name IS NULL THEN
      ws_name := COALESCE(NULLIF(NEW.description, ''), 'Paystack ' || NEW.type);
    END IF;

    INSERT INTO finance_income (
      source_label, type, amount_ngn, date,
      is_test, is_manual, source_type, source_id
    )
    VALUES (
      ws_name, mapped_type, GREATEST(0, ROUND(COALESCE(NEW.amount_kobo, 0) / 100.0)),
      paid_date, false, false, 'billing_invoices', NEW.id::text
    )
    ON CONFLICT (source_type, source_id) DO UPDATE
      SET amount_ngn   = EXCLUDED.amount_ngn,
          date         = EXCLUDED.date,
          source_label = EXCLUDED.source_label,
          type         = EXCLUDED.type,
          is_test      = false,
          updated_at   = now();

  ELSIF NEW.status = 'refunded' THEN
    -- Preserve the row but exclude from totals.
    UPDATE finance_income
       SET is_test = true, updated_at = now()
     WHERE source_type = 'billing_invoices' AND source_id = NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_invoices_finance_sync ON billing_invoices;
CREATE TRIGGER billing_invoices_finance_sync
  AFTER INSERT OR UPDATE OF status, amount_kobo, paid_at, description, workspace_id, type
  ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION finance_sync_billing_row();

-- ── 4. Sync trigger: offer_purchases → finance_income ───────────────────────
CREATE OR REPLACE FUNCTION finance_sync_offer_row() RETURNS trigger
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

    INSERT INTO finance_income (
      source_label, type, amount_ngn, date,
      is_test, is_manual, source_type, source_id
    )
    VALUES (
      ws_name, 'offer', GREATEST(0, COALESCE(NEW.total_ngn, 0)),
      paid_date, false, false, 'offer_purchases', NEW.id::text
    )
    ON CONFLICT (source_type, source_id) DO UPDATE
      SET amount_ngn   = EXCLUDED.amount_ngn,
          date         = EXCLUDED.date,
          source_label = EXCLUDED.source_label,
          is_test      = false,
          updated_at   = now();

  ELSIF NEW.status = 'refunded' THEN
    UPDATE finance_income
       SET is_test = true, updated_at = now()
     WHERE source_type = 'offer_purchases' AND source_id = NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offer_purchases_finance_sync ON offer_purchases;
CREATE TRIGGER offer_purchases_finance_sync
  AFTER INSERT OR UPDATE OF status, total_ngn, granted_at, buyer_name, buyer_email, workspace_id
  ON offer_purchases
  FOR EACH ROW EXECUTE FUNCTION finance_sync_offer_row();

-- ── 5. One-time backfill ────────────────────────────────────────────────────
-- All historical paid rows get mirrored on first migration run. Re-runs are
-- safe: ON CONFLICT DO UPDATE just re-syncs the current source values.

INSERT INTO finance_income (
  source_label, type, amount_ngn, date, is_test, is_manual, source_type, source_id
)
SELECT
  COALESCE(w.name, NULLIF(bi.description, ''), 'Paystack ' || bi.type),
  finance_map_billing_type(bi.type),
  GREATEST(0, ROUND(COALESCE(bi.amount_kobo, 0) / 100.0)),
  COALESCE(bi.paid_at::date, bi.created_at::date, CURRENT_DATE),
  false, false, 'billing_invoices', bi.id::text
FROM billing_invoices bi
LEFT JOIN workspaces w ON w.id = bi.workspace_id
WHERE bi.status = 'paid'
ON CONFLICT (source_type, source_id) DO UPDATE
  SET amount_ngn   = EXCLUDED.amount_ngn,
      date         = EXCLUDED.date,
      source_label = EXCLUDED.source_label,
      type         = EXCLUDED.type,
      updated_at   = now();

-- Flag refunded billing rows as test.
UPDATE finance_income fi
   SET is_test = true, updated_at = now()
  FROM billing_invoices bi
 WHERE fi.source_type = 'billing_invoices'
   AND fi.source_id   = bi.id::text
   AND bi.status      = 'refunded';

INSERT INTO finance_income (
  source_label, type, amount_ngn, date, is_test, is_manual, source_type, source_id
)
SELECT
  COALESCE(w.name, NULLIF(op.buyer_name, ''), NULLIF(op.buyer_email, ''), 'Offer purchase'),
  'offer',
  GREATEST(0, COALESCE(op.total_ngn, 0)),
  COALESCE(op.granted_at::date, op.created_at::date, CURRENT_DATE),
  false, false, 'offer_purchases', op.id::text
FROM offer_purchases op
LEFT JOIN workspaces w ON w.id = op.workspace_id
WHERE op.status = 'paid'
ON CONFLICT (source_type, source_id) DO UPDATE
  SET amount_ngn   = EXCLUDED.amount_ngn,
      date         = EXCLUDED.date,
      source_label = EXCLUDED.source_label,
      updated_at   = now();

UPDATE finance_income fi
   SET is_test = true, updated_at = now()
  FROM offer_purchases op
 WHERE fi.source_type = 'offer_purchases'
   AND fi.source_id   = op.id::text
   AND op.status      = 'refunded';
