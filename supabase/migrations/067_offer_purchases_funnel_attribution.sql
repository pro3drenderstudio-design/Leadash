-- Last-touch funnel attribution on purchases, so a Purchase pixel event
-- (Meta/Google/GTM) fired on the offer success page can be attributed to
-- the specific funnel that drove the buyer there.
ALTER TABLE offer_purchases
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES funnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offer_purchases_funnel ON offer_purchases(funnel_id);
