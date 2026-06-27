-- ── 060: Upgrade the existing "challenge-30" product to the generic challenge engine
-- Promotes the legacy hardcoded 30-Day Challenge (academy/challenge-30/page.tsx,
-- now removed) onto the new product_type='challenge' + academy_challenge_tasks model.
-- The funnel_states/bundle-offer plumbing (checkout-challenge, checkout-bundle,
-- complete-day1) is untouched and continues to work against academy_enrollments.

-- ── 1. Promote the product + set challenge_config ──────────────────────────────
UPDATE academy_products
SET
  product_type = 'challenge',
  challenge_config = jsonb_build_object(
    'tagline',              'Go from $0 to $2,500 in 30 days',
    'duration_days',        30,
    'cadence',              'daily',
    'start_mode',           'enrollment',
    'grace_days',           2,
    'catchup_enabled',      true,
    'leaderboard_enabled',  true,
    'points_board_enabled', true,
    'earnings_board_enabled', true,
    'earnings_require_proof', true,
    'earnings_reset',       'all_time',
    'auto_advance_offer', jsonb_build_object(
      'enabled',       true,
      'trigger',       'day_complete',
      'window_hours',  72,
      'discount_type', 'fixed_ngn',
      'discount_value', 50000
    ),
    'reminders', jsonb_build_object(
      'email',             true,
      'whatsapp',          true,
      'daily_unlock_time', '08:00',
      'timezone',          'Africa/Lagos',
      'nudge_missed',      true
    )
  )
WHERE id = 'challenge-30';

-- ── 2. Seed challenge tasks from the seed schedule, one task per day ───────────
-- Day's "lesson" task links to the existing academy_lessons placeholder row
-- (matched by position = day-1) so admin-uploaded video content keeps working.
-- task_type/points/title mirror the design handoff's seed schedule.
WITH seed(day, task_type, points, title) AS (
  VALUES
    (1,  'lesson',     30,  'Set up your offer & ICP'),
    (2,  'lesson',     40,  'Build your first lead list of 50'),
    (3,  'lesson',     40,  'Write your outreach script'),
    (4,  'metric',     50,  'Send your first 20 messages'),
    (5,  'live',       30,  'Live: Outreach teardown with Mizark'),
    (6,  'lesson',     35,  'Handle objections & follow-ups'),
    (7,  'proof',      50,  'Week 1 review & submit results'),
    (8,  'lesson',     40,  'Double your daily volume'),
    (9,  'lesson',     40,  'Personalize at scale'),
    (10, 'metric',     60,  'Book your first call'),
    (11, 'live',       30,  'Reply-rate clinic'),
    (12, 'lesson',     40,  'Refine your offer from feedback'),
    (13, 'metric',     50,  'Send 40 messages today'),
    (14, 'proof',      50,  'Week 2 review & submit results'),
    (15, 'lesson',     35,  'Discovery-call framework'),
    (16, 'proof',      60,  'Run a live discovery call'),
    (17, 'lesson',     40,  'Pricing & proposals'),
    (18, 'metric',     70,  'Send 3 proposals'),
    (19, 'live',       30,  'Live: Closing role-play'),
    (20, 'lesson',     50,  'Follow up to close'),
    (21, 'proof',      50,  'Week 3 review & submit results'),
    (22, 'lesson',     40,  'Systemize your pipeline'),
    (23, 'lesson',     40,  'Raise your rates'),
    (24, 'metric',     80,  'Land client #2'),
    (25, 'lesson',     40,  'Retainers & repeat work'),
    (26, 'live',       30,  'Live: Scale Q&A'),
    (27, 'metric',     90,  'Push to $2,500 booked'),
    (28, 'proof',      40,  'Build your testimonial'),
    (29, 'lesson',     40,  'Plan your next 30 days'),
    (30, 'proof',      100, 'Final results & graduation')
),
-- academy_lessons has duplicate rows per position from a prior re-run of the
-- 050 seed migration (no unique constraint on product_id+position) — dedupe
-- deterministically so each day links to exactly one lesson.
lessons AS (
  SELECT DISTINCT ON (position) id, position
  FROM academy_lessons
  WHERE product_id = 'challenge-30'
  ORDER BY position, id
)
INSERT INTO academy_challenge_tasks (product_id, day, position, task_type, title, points, lesson_id, is_published)
SELECT
  'challenge-30',
  seed.day,
  0,
  seed.task_type,
  seed.title,
  seed.points,
  CASE WHEN seed.task_type = 'lesson' THEN lessons.id ELSE NULL END,
  true
FROM seed
LEFT JOIN lessons ON lessons.position = seed.day - 1
WHERE NOT EXISTS (
  SELECT 1 FROM academy_challenge_tasks t WHERE t.product_id = 'challenge-30' AND t.day = seed.day
);

NOTIFY pgrst, 'reload schema';
