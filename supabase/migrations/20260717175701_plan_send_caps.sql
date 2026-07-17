-- Monthly send caps per plan (excluding warmup — warmup lives in a separate
-- table and is never counted toward the cap). Enforcement already exists in
-- apps/web/src/lib/outreach/send-runner.ts (live-counts outreach_sends this
-- UTC month vs workspaces.max_monthly_sends and pauses campaigns when hit);
-- all paid plans were previously -1 (unlimited). This just sets finite caps.

UPDATE plan_configs SET max_monthly_sends = 5000,   updated_at = now() WHERE plan_id = 'starter';
UPDATE plan_configs SET max_monthly_sends = 30000,  updated_at = now() WHERE plan_id = 'growth';
UPDATE plan_configs SET max_monthly_sends = 100000, updated_at = now() WHERE plan_id = 'scale';
UPDATE plan_configs SET max_monthly_sends = 400000, updated_at = now() WHERE plan_id = 'enterprise';

-- Backfill existing active/past_due paid workspaces to their plan's new cap so
-- there are no grandfathered "unlimited" accounts (the limit is stamped onto
-- the workspace row at subscribe/grant time, so existing subscribers keep the
-- old -1 until this backfill).
UPDATE workspaces w
SET max_monthly_sends = p.max_monthly_sends, updated_at = now()
FROM plan_configs p
WHERE p.plan_id = w.plan_id
  AND w.plan_id <> 'free'
  AND w.plan_status IN ('active', 'past_due');
