-- Paystack recurring inbox billing columns
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS paystack_inbox_monthly_kobo bigint,
  ADD COLUMN IF NOT EXISTS inbox_next_billing_date     timestamptz,
  ADD COLUMN IF NOT EXISTS paystack_billing_email      text;
