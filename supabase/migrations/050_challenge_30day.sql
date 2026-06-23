-- ── 050: 30-Day Challenge Academy Product ─────────────────────────────────────
-- Seeds the new 30-day challenge product (separate from the existing 5-day
-- challenge). Creates 30 daily lesson placeholders — all unpublished until
-- admin uploads video content and flips is_published to true.

-- ── 1. Product ────────────────────────────────────────────────────────────────
INSERT INTO academy_products (
  id, name, description, price_ngn, credits_grant, leadash_months,
  slug, pricing_type, certificate_enabled, completion_threshold_pct,
  is_published, is_active
)
VALUES (
  'challenge-30',
  '30-Day Outreach Challenge',
  'A 30-day sprint to build your complete outreach system using Leadash — in partnership with Learn By Mizark.',
  10000,
  0,
  0,
  '30-day-challenge',
  'one_time',
  true,
  80,
  false,  -- not published yet; admin publishes when ready
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Default section ────────────────────────────────────────────────────────
INSERT INTO academy_sections (id, product_id, title, description, position, is_published)
VALUES (
  'a0000000-0000-0000-0000-000000000030',
  'challenge-30',
  'The 30-Day Sprint',
  'Build your complete outreach stack, one day at a time.',
  0,
  true
)
ON CONFLICT DO NOTHING;

-- ── 3. 30 lesson placeholders ─────────────────────────────────────────────────
-- All unpublished. is_free_preview = true for Day 1 only.
-- drip_type = days_after_enrollment so Day 1 unlocks immediately,
-- Day 2 at +1 day, Day 3 at +2 days, etc.
INSERT INTO academy_lessons (
  section_id, product_id, title, description, lesson_type,
  position, drip_type, drip_value, is_free_preview, is_published
)
SELECT
  'a0000000-0000-0000-0000-000000000030',
  'challenge-30',
  'Day ' || day || ' — Coming Soon',
  'Content for Day ' || day || ' will be published shortly.',
  'video',
  day - 1,                              -- position 0–29
  'days_after_enrollment',
  day - 1,                              -- drip_value: 0 = immediate, 1 = day 2, etc.
  day = 1,                              -- only Day 1 is free preview
  false                                 -- all unpublished until admin uploads content
FROM generate_series(1, 30) AS day
ON CONFLICT DO NOTHING;
