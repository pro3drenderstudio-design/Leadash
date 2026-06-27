-- ── 063: Track downsell acceptance separately from upsell ──────────────────────
ALTER TABLE offer_purchases
  ADD COLUMN IF NOT EXISTS downsell_status text CHECK (downsell_status IN ('offered','accepted','declined'));

NOTIFY pgrst, 'reload schema';
