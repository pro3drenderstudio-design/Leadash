-- Allow per-offer control over whether affiliate commissions are generated.
-- Defaults to true (all existing offers continue to pay commission).
-- Subscription plans always pay commission regardless of this flag.
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS allows_referral_commission boolean NOT NULL DEFAULT true;
