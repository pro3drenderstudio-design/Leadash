-- Widen lead-credit balance/ledger columns from integer to numeric(12,1).
--
-- Verification charges are billed per-lead at a rate that can be fractional
-- (e.g. 0.5 credits/lead). workspaces.lead_credits_balance and
-- lead_credit_transactions.amount were still integer, so any odd lead count
-- at a 0.5 rate produced a fractional charge (e.g. 1000.5) that failed to
-- insert. lead_verification_jobs.credits_used/credits_deducted/refunded were
-- already numeric — this brings the other two credit columns in line.
-- Widening integer -> numeric is lossless for all existing whole-number data.

ALTER TABLE workspaces
  ALTER COLUMN lead_credits_balance TYPE numeric(12,1) USING lead_credits_balance::numeric(12,1);

ALTER TABLE lead_credit_transactions
  ALTER COLUMN amount TYPE numeric(12,1) USING amount::numeric(12,1);
