-- Capital isn't income. A principal investment (e.g. ₦1,000,000 from an
-- investor) has nowhere correct to live in a revenue/cogs/opex/tax-only
-- ledger — recording it as revenue would wrongly inflate taxable revenue and
-- the VAT-registration-threshold estimate. Add an 'equity' transaction type
-- (excluded from P&L/tax rollups — see lib/finance/tax.ts) plus a lightweight
-- principals/investors registry for per-person running totals.
ALTER TABLE finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_type_check,
  ADD CONSTRAINT finance_transactions_type_check CHECK (type IN ('revenue','cogs','opex','tax','equity'));

CREATE TABLE IF NOT EXISTS finance_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','entity')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS principal_id uuid REFERENCES finance_principals(id);

ALTER TABLE finance_principals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_principals_admin_all ON finance_principals;
CREATE POLICY finance_principals_admin_all ON finance_principals FOR ALL USING (is_finance_admin()) WITH CHECK (is_finance_admin());
