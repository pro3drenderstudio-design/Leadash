-- Paystack sends its transaction fee (data.fees, kobo) on every charge.success
-- webhook and verify-transaction response — until now we discarded it, so the
-- books only ever saw gross amounts (a ₦15,000 charge that pays out ₦14,675
-- looked like ₦15,000 of revenue). Capture the fee and derive the net payout.
ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS fees_kobo bigint,
  ADD COLUMN IF NOT EXISTS net_kobo bigint
    GENERATED ALWAYS AS (amount_kobo - COALESCE(fees_kobo, 0)) STORED;

ALTER TABLE offer_purchases
  ADD COLUMN IF NOT EXISTS fees_kobo bigint;

COMMENT ON COLUMN billing_invoices.fees_kobo IS 'Paystack transaction fee in kobo, from data.fees on webhook/verify; null = not yet captured/backfilled';
COMMENT ON COLUMN billing_invoices.net_kobo IS 'Net payout amount (gross - Paystack fee)';
COMMENT ON COLUMN offer_purchases.fees_kobo IS 'Paystack transaction fee in kobo';
