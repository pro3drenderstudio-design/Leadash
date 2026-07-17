-- Annual billing (2 months free): each plan gets its own annual Paystack plan
-- code. The annual price is always monthly × 10 (computed at checkout), so no
-- separate price column is needed — only the Paystack plan code, created at
-- amount = price_ngn × 10 with a yearly interval.
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS paystack_plan_code_annual text;
