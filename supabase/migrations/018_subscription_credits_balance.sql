-- Track subscription-granted credits separately from purchased credits.
-- At each billing cycle renewal, unused subscription credits expire;
-- only purchased credits carry over.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS subscription_credits_balance integer NOT NULL DEFAULT 0;
