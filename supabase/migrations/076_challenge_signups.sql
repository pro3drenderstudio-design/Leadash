-- Migration 076: challenge_signups (bank transfer payment queue)
-- Stores signups that need manual payment confirmation before enrollment.

CREATE TABLE IF NOT EXISTS challenge_signups (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text        NOT NULL,
  email               text        NOT NULL,
  phone               text        NOT NULL,
  bank_account_name   text        NOT NULL,
  payment_method      text        NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'paystack')),
  paystack_reference  text,
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  user_id             uuid        REFERENCES auth.users(id),
  workspace_id        uuid        REFERENCES workspaces(id),
  confirmed_at        timestamptz,
  confirmed_by        uuid        REFERENCES auth.users(id),
  rejection_reason    text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_signups_status_idx ON challenge_signups (status, created_at DESC);
CREATE INDEX IF NOT EXISTS challenge_signups_email_idx  ON challenge_signups (email);

ALTER TABLE challenge_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenge_signups_admin" ON challenge_signups FOR ALL   USING (is_admin());
CREATE POLICY "challenge_signups_own"   ON challenge_signups FOR SELECT USING (user_id = auth.uid());

-- Migration 077: link tracking
-- (applied via execute_sql — schema already exists in DB, this file documents it)
-- Tables: tracked_links, tracked_link_clicks (see 20260708205936_link_tracking.sql)

-- 7-day challenge product seeded via execute_sql (slug: challenge-7day)
