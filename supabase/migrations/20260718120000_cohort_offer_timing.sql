-- Cohort automation + offer-timing correction.
--   1. offer_targets.starts_at: a targeted offer can now be dormant until a
--      scheduled start (the sponsored bundle unlocks at cohort go-live, not at
--      signup confirmation). NULL = active immediately.
--   2. academy_cohorts lifecycle/winner columns: enrollment close time + the
--      single per-cohort winner (10k academy grant + N50k cash, manual payout).

ALTER TABLE offer_targets ADD COLUMN IF NOT EXISTS starts_at timestamptz;  -- NULL = active immediately

-- Widen the workspace lookup index to cover the new start-gate predicate.
DROP INDEX IF EXISTS offer_targets_ws_idx;
CREATE INDEX IF NOT EXISTS offer_targets_ws_idx ON offer_targets (workspace_id, starts_at, expires_at);

ALTER TABLE academy_cohorts ADD COLUMN IF NOT EXISTS enrollment_closes_at   timestamptz;
ALTER TABLE academy_cohorts ADD COLUMN IF NOT EXISTS winner_enrollment_id   uuid REFERENCES academy_enrollments(id) ON DELETE SET NULL;
ALTER TABLE academy_cohorts ADD COLUMN IF NOT EXISTS winner_awarded_at      timestamptz;
ALTER TABLE academy_cohorts ADD COLUMN IF NOT EXISTS cash_prize_status      text;  -- NULL | 'pending' | 'paid'

-- Weekly cohort scheduler. Idempotent — safe to run hourly.
--   * Ensures the currently-ENROLLING cohort exists: opens Mon 00:00 WAT, goes
--     live (Day 1) the FOLLOWING Mon at golive_hour WAT (default 21:00). Marks it
--     is_default (what the confirm flow grants) and rolls is_default off the prior.
--   * Transitions cohort.status upcoming → active → ended by wall clock.
--   * On a cohort ending, stamps a PROVISIONAL winner (top gamification.points) +
--     cash_prize_status='pending'. Prizes are granted only after admin confirms.
CREATE OR REPLACE FUNCTION run_cohort_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p              record;
  wk_monday_wat  timestamp;     -- this week's Monday 00:00 WAT (local, no tz)
  golive_utc     timestamptz;
  ends_utc       timestamptz;
  created        int := 0;
  winners        jsonb := '[]'::jsonb;
  c              record;
  win            record;
BEGIN
  -- Serialize concurrent runs (hourly cron + self-heal calls from confirms).
  PERFORM pg_advisory_xact_lock(hashtext('academy_cohort_scheduler'));

  FOR p IN
    SELECT id, slug,
           COALESCE((challenge_config->'cohort_cadence'->>'golive_hour_wat')::int, 21) AS gh,
           COALESCE((challenge_config->>'duration_days')::int, 7) AS dur
    FROM academy_products
    WHERE product_type = 'challenge'
      AND COALESCE(is_active, true)
      AND challenge_config->>'start_mode' = 'cohort'
      AND challenge_config ? 'cohort_cadence'
  LOOP
    wk_monday_wat := date_trunc('week', (now() AT TIME ZONE 'Africa/Lagos'));
    golive_utc := ((wk_monday_wat + interval '7 days' + make_interval(hours => p.gh)) AT TIME ZONE 'Africa/Lagos');
    ends_utc   := ((wk_monday_wat + interval '7 days' + make_interval(hours => p.gh) + make_interval(days => p.dur)) AT TIME ZONE 'Africa/Lagos');

    IF NOT EXISTS (SELECT 1 FROM academy_cohorts WHERE product_id = p.id AND starts_at = golive_utc) THEN
      UPDATE academy_cohorts
        SET is_default = false,
            enrollment_closes_at = COALESCE(enrollment_closes_at, (wk_monday_wat AT TIME ZONE 'Africa/Lagos'))
        WHERE product_id = p.id AND is_default = true;
      INSERT INTO academy_cohorts (product_id, name, starts_at, ends_at, status, is_default)
        VALUES (p.id,
                'Cohort — week of ' || to_char((wk_monday_wat)::date, 'Mon DD'),
                golive_utc, ends_utc, 'upcoming', true);
      created := created + 1;
    END IF;

    -- upcoming → active
    UPDATE academy_cohorts SET status = 'active'
      WHERE product_id = p.id
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
        AND status IS DISTINCT FROM 'active'
        AND status IS DISTINCT FROM 'ended';

    -- → ended (+ provisional winner)
    FOR c IN
      SELECT id FROM academy_cohorts
      WHERE product_id = p.id AND ends_at IS NOT NULL AND ends_at <= now()
        AND status IS DISTINCT FROM 'ended'
    LOOP
      SELECT e.id AS enrollment_id, g.points AS points INTO win
      FROM academy_enrollments e
      JOIN academy_gamification g ON g.enrollment_id = e.id
      WHERE e.cohort_id = c.id
      ORDER BY g.points DESC, g.last_active_date ASC NULLS LAST
      LIMIT 1;

      UPDATE academy_cohorts
        SET status = 'ended',
            winner_enrollment_id = COALESCE(winner_enrollment_id, win.enrollment_id),
            winner_awarded_at    = CASE WHEN winner_enrollment_id IS NULL AND win.enrollment_id IS NOT NULL THEN now() ELSE winner_awarded_at END,
            cash_prize_status    = CASE WHEN winner_enrollment_id IS NULL AND win.enrollment_id IS NOT NULL THEN 'pending' ELSE cash_prize_status END
        WHERE id = c.id;

      IF win.enrollment_id IS NOT NULL THEN
        winners := winners || jsonb_build_object('cohort_id', c.id, 'enrollment_id', win.enrollment_id, 'points', win.points);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'winners', winners);
END;
$$;
