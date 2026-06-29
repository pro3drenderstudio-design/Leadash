-- ─── Internal-only plan tiers for the 30-Day Challenge stack offers ──────────
-- These back the 3 standalone "stack" Offers (Starter/Growth/Enterprise +
-- inboxes) sold on Day 1 of the challenge. Deliberately separate rows from
-- the live self-serve starter/growth/scale/enterprise tiers (which have real
-- paying customers) — is_active=false hides them from the public pricing
-- page (getActivePlans()) while getPlanById() still resolves them by id for
-- Offer grant fulfillment.

INSERT INTO plan_configs (
  plan_id, name, sort_order,
  price_ngn, price_usd, paystack_plan_code, stripe_price_id,
  max_inboxes, max_monthly_sends, max_seats, max_leads_pool,
  included_credits, trial_days, inbox_monthly_price_ngn,
  can_scrape_leads, can_run_campaigns,
  feat_warmup, feat_preview_leads, feat_ai_personalization,
  feat_ai_classification, feat_api_access, is_active
) VALUES
  ('challenge-starter',    'Challenge — Starter Stack',    100,  35000,  23, null, null, 10, -1,      3,   1000,   2000, 0, 2500, true, true, true, true, true, true, false, false),
  ('challenge-growth',     'Challenge — Growth Stack',      101,  85000,  57, null, null, 20, -1,     10,  10000,  20000, 0, 2500, true, true, true, true, true, true, true,  false),
  ('challenge-enterprise', 'Challenge — Enterprise Stack',  102, 195000, 130, null, null, 50, -1, 999999, 150000, 300000, 0, 2500, true, true, true, true, true, true, true,  false)
ON CONFLICT (plan_id) DO NOTHING;
