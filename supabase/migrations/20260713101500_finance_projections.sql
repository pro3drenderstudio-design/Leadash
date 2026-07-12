-- Budgets and long-range projections are the same underlying thing: a
-- planned transaction with an amount, category, and recurrence. A
-- recurrence='monthly' row IS a budget (e.g. "₦500k/month marketing");
-- recurrence='once' rows spaced across years are a long-range model (e.g.
-- "Series A ₦50M in Q3 2027"). One table serves both — see
-- lib/finance/projections.ts for the expansion logic that turns recurring
-- rows into per-period instances comparable against actuals.
CREATE TABLE IF NOT EXISTS finance_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('revenue','cogs','opex','tax','equity')),
  category text NOT NULL,
  amount_ngn numeric(15,2) NOT NULL CHECK (amount_ngn >= 0),
  label text,
  recurrence text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','monthly','quarterly','yearly')),
  start_date date NOT NULL,
  end_date date,                  -- NULL = indefinite (for recurring)
  bank_account_id uuid REFERENCES finance_bank_accounts(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_projections_dates_idx ON finance_projections (start_date, end_date);

ALTER TABLE finance_projections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_projections_admin_all ON finance_projections;
CREATE POLICY finance_projections_admin_all ON finance_projections FOR ALL USING (is_finance_admin()) WITH CHECK (is_finance_admin());

DROP TRIGGER IF EXISTS finance_projections_updated_at ON finance_projections;
CREATE TRIGGER finance_projections_updated_at
  BEFORE UPDATE ON finance_projections
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_at();
