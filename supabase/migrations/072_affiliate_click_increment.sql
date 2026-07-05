-- Atomic counter increments for affiliate referral tracking.
-- Uses UPDATE ... SET col = col + 1 to avoid read-modify-write race conditions.
CREATE OR REPLACE FUNCTION increment_affiliate_clicks(aff_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE affiliates SET clicks = COALESCE(clicks, 0) + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION increment_affiliate_signups(aff_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE affiliates SET signups = COALESCE(signups, 0) + 1 WHERE id = aff_id;
$$;
