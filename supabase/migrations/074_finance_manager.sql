-- ─── Finance Manager ─────────────────────────────────────────────────────────
-- Backing storage for the admin finance manager: manual expense + income line
-- items with categorised buckets and effective-dated amount history on
-- recurring expenses. All access is gated to platform admins via the `admins`
-- table (see 013b_admins.sql). Service role bypasses RLS.
--
-- Design source: docs export "Leadash Finance.html" — pattern A journal entries
-- with a singleton settings row for reserves.

-- ── Helper: is-admin predicate reused across every policy ────────────────────
CREATE OR REPLACE FUNCTION is_finance_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

-- ── Expenses (recurring + one-off) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('recurring','oneoff')),
  name        text NOT NULL,
  category    text NOT NULL CHECK (category IN ('infra','salaries','fees','marketing','software','oneoff','refunds')),
  -- Current monthly amount for recurring; final amount for one-off.
  amount_ngn  bigint NOT NULL CHECK (amount_ngn >= 0),
  -- Recurring: start-of-billing date. One-off: date the spend happened.
  since       date NOT NULL,
  -- Recurring only. One-off rows keep 'active' but the field is ignored.
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS finance_expenses_kind_status_idx ON finance_expenses(kind, status);
CREATE INDEX IF NOT EXISTS finance_expenses_since_idx      ON finance_expenses(since DESC);

-- ── Effective-dated history for recurring expenses ───────────────────────────
-- A new row is inserted every time a recurring expense's amount changes. Used
-- to compute historical totals correctly (e.g. "cloud servers went from 120k
-- to 180k on Nov 2025" — Oct's total uses 120k, Nov onwards uses 180k).
CREATE TABLE IF NOT EXISTS finance_expense_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id     uuid NOT NULL REFERENCES finance_expenses(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  amount_ngn     bigint NOT NULL CHECK (amount_ngn >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (expense_id, effective_from)
);

CREATE INDEX IF NOT EXISTS finance_expense_history_expense_idx
  ON finance_expense_history(expense_id, effective_from DESC);

-- ── Income (manual + synced) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_income (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Free-text label — workspace name or an external source.
  source_label  text NOT NULL,
  type          text NOT NULL CHECK (type IN ('plan','academy','offer','credits','addon','external','partner','consulting','grant')),
  amount_ngn    bigint NOT NULL CHECK (amount_ngn >= 0),
  date          date NOT NULL,
  is_test       boolean NOT NULL DEFAULT false,
  -- Distinguishes hand-entered rows from paystack-synced ones (future).
  is_manual     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS finance_income_date_idx        ON finance_income(date DESC);
CREATE INDEX IF NOT EXISTS finance_income_type_idx        ON finance_income(type);
CREATE INDEX IF NOT EXISTS finance_income_is_test_idx     ON finance_income(is_test) WHERE is_test = true;

-- ── Global settings (singleton) ─────────────────────────────────────────────
-- One row only, id fixed at 1. Used for reserves (drives the runway
-- calculation on the Overview tab) plus any future business-wide dials.
CREATE TABLE IF NOT EXISTS finance_settings (
  id            int PRIMARY KEY CHECK (id = 1),
  reserves_ngn  bigint NOT NULL DEFAULT 0 CHECK (reserves_ngn >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO finance_settings (id, reserves_ngn) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

-- ── updated_at triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_finance_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS finance_expenses_updated_at ON finance_expenses;
CREATE TRIGGER finance_expenses_updated_at
  BEFORE UPDATE ON finance_expenses
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_at();

DROP TRIGGER IF EXISTS finance_income_updated_at ON finance_income;
CREATE TRIGGER finance_income_updated_at
  BEFORE UPDATE ON finance_income
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_at();

DROP TRIGGER IF EXISTS finance_settings_updated_at ON finance_settings;
CREATE TRIGGER finance_settings_updated_at
  BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_at();

-- ── Seed the initial history row on every new recurring expense ─────────────
-- Guarantees rec_amount_at() always finds a row and simplifies the API PATCH
-- path (only insert a history row when the amount actually changes).
CREATE OR REPLACE FUNCTION finance_seed_expense_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'recurring' THEN
    INSERT INTO finance_expense_history (expense_id, effective_from, amount_ngn, created_by)
    VALUES (NEW.id, NEW.since, NEW.amount_ngn, NEW.created_by)
    ON CONFLICT (expense_id, effective_from) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_expenses_seed_history ON finance_expenses;
CREATE TRIGGER finance_expenses_seed_history
  AFTER INSERT ON finance_expenses
  FOR EACH ROW EXECUTE FUNCTION finance_seed_expense_history();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE finance_expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expense_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_income           ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings         ENABLE ROW LEVEL SECURITY;

-- One policy per table gated on is_finance_admin(). Service role bypasses RLS
-- entirely, so worker/API routes using the admin client continue to work.
DROP POLICY IF EXISTS finance_expenses_admin_all         ON finance_expenses;
DROP POLICY IF EXISTS finance_expense_history_admin_all  ON finance_expense_history;
DROP POLICY IF EXISTS finance_income_admin_all           ON finance_income;
DROP POLICY IF EXISTS finance_settings_admin_all         ON finance_settings;

CREATE POLICY finance_expenses_admin_all
  ON finance_expenses         FOR ALL TO authenticated
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

CREATE POLICY finance_expense_history_admin_all
  ON finance_expense_history  FOR ALL TO authenticated
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

CREATE POLICY finance_income_admin_all
  ON finance_income           FOR ALL TO authenticated
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());

CREATE POLICY finance_settings_admin_all
  ON finance_settings         FOR ALL TO authenticated
  USING (is_finance_admin()) WITH CHECK (is_finance_admin());
