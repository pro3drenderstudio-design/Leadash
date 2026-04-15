-- ─── Paystack subscription tracking on workspaces ────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_sub_code       text,
  ADD COLUMN IF NOT EXISTS paystack_auth_code      text;

-- ─── Authorization code on domain records (for recurring inbox billing) ───────
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS paystack_auth_code text;
