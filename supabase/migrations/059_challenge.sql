-- ── 059: Challenge product type + tasks + completions + gamification extensions

-- 1. product_type column on academy_products
ALTER TABLE academy_products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'course'
    CHECK (product_type IN ('course', 'challenge'));

-- challenge_config JSONB (nullable for courses)
-- Shape: { cadence, duration_days, start_mode, grace_days, catchup_enabled,
--          leaderboard_enabled, points_board_enabled, earnings_board_enabled,
--          earnings_require_proof, earnings_reset,
--          auto_advance_offer: { enabled, trigger, window_hours, target_product_id, discount_type, discount_value },
--          reminders: { email, whatsapp, daily_unlock_time, timezone, nudge_missed },
--          tagline }
ALTER TABLE academy_products
  ADD COLUMN IF NOT EXISTS challenge_config jsonb;

-- challenge winner tracking
ALTER TABLE academy_products
  ADD COLUMN IF NOT EXISTS challenge_winners jsonb;  -- [{rank, enrollment_id, awarded_at}]

-- 2. Challenge tasks table (tasks within a challenge day)
CREATE TABLE IF NOT EXISTS academy_challenge_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       text NOT NULL REFERENCES academy_products(id) ON DELETE CASCADE,
  day              integer NOT NULL,        -- 1-based day number
  position         integer NOT NULL DEFAULT 0,
  task_type        text NOT NULL CHECK (task_type IN ('lesson','proof','self_check','metric','live','quiz')),
  title            text NOT NULL DEFAULT '',
  points           integer NOT NULL DEFAULT 0,
  lesson_id        uuid REFERENCES academy_lessons(id) ON DELETE SET NULL,
  proof_config     jsonb,   -- { accepts: string[], prompt: string }
  metric_config    jsonb,   -- { source: 'leadash_outbox'|'manual', metric: string, target: int }
  live_session_id  uuid REFERENCES academy_live_sessions(id) ON DELETE SET NULL,
  quiz_config      jsonb,
  is_published     boolean NOT NULL DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE academy_challenge_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenge_tasks_admin_only" ON academy_challenge_tasks FOR ALL USING (false);
CREATE INDEX IF NOT EXISTS idx_challenge_tasks_product_day ON academy_challenge_tasks(product_id, day, position);

-- 3. Challenge task completions
CREATE TABLE IF NOT EXISTS academy_challenge_completions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES academy_challenge_tasks(id) ON DELETE CASCADE,
  product_id      text NOT NULL,
  day             integer NOT NULL,
  status          text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','skipped')),
  proof_files     jsonb,     -- array of { url, name, type }
  proof_text      text,
  metric_value    integer,
  points_awarded  integer NOT NULL DEFAULT 0,
  completed_at    timestamptz DEFAULT now(),
  UNIQUE(enrollment_id, task_id)
);

ALTER TABLE academy_challenge_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenge_completions_own" ON academy_challenge_completions
  FOR ALL USING (
    enrollment_id IN (
      SELECT id FROM academy_enrollments WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );
CREATE INDEX IF NOT EXISTS idx_challenge_completions_enrollment ON academy_challenge_completions(enrollment_id, day);
CREATE INDEX IF NOT EXISTS idx_challenge_completions_product ON academy_challenge_completions(product_id, day);

-- 4. Reported earnings on gamification
ALTER TABLE academy_gamification
  ADD COLUMN IF NOT EXISTS reported_earnings_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings_proof_url text,
  ADD COLUMN IF NOT EXISTS earnings_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_days_used integer NOT NULL DEFAULT 0;

-- 5. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
