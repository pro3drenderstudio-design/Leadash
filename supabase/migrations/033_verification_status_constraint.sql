-- Fix outreach_leads.verification_status check constraint to include all Reoon statuses.
-- Original constraint only had: pending, valid, invalid, catch_all, disposable, unknown
-- Missing: safe, risky, dangerous, verified_external

ALTER TABLE outreach_leads
  DROP CONSTRAINT IF EXISTS outreach_leads_verification_status_check;

ALTER TABLE outreach_leads
  ADD CONSTRAINT outreach_leads_verification_status_check
  CHECK (verification_status IN (
    'pending',
    'safe',
    'valid',
    'verified_external',
    'catch_all',
    'unknown',
    'risky',
    'invalid',
    'dangerous',
    'disposable'
  ));
