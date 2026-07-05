-- Add recurring-billing fields to offer_purchases.
-- authorization_code: Paystack card authorization for future charges.
-- paystack_customer_code: Paystack customer tied to this purchase.
-- next_renewal_at: when the next recurring charge is due (set after first payment for recurring offers).

ALTER TABLE offer_purchases
  ADD COLUMN IF NOT EXISTS authorization_code     text,
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS next_renewal_at        timestamptz;
