-- Intelligent challenge: a points ledger for arbitrary product actions (send,
-- reply, offer/ICP/sequence create, lesson watch, etc.) with per-day anti-gaming
-- caps, feeding the existing academy_gamification.points aggregate (the single
-- leaderboard source). Weights + caps live in academy_products.challenge_config.points_rules.

CREATE TABLE IF NOT EXISTS academy_points_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  workspace_id  uuid,
  product_id    text NOT NULL,
  cohort_id     uuid,
  action        text NOT NULL,
  points        int  NOT NULL DEFAULT 0,
  wat_day       date NOT NULL,
  ref           text,               -- dedup key (e.g. send_id, 'active:<day>:<bucket>')
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Idempotency: a given (enrollment, ref) is scored at most once. Partial index so
-- NULL refs (actions we don't dedup) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS academy_points_events_ref_uidx
  ON academy_points_events (enrollment_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS academy_points_events_cap_idx
  ON academy_points_events (enrollment_id, wat_day, action);
CREATE INDEX IF NOT EXISTS academy_points_events_cohort_idx
  ON academy_points_events (cohort_id);

ALTER TABLE academy_points_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academy_points_events_own ON academy_points_events;
CREATE POLICY academy_points_events_own ON academy_points_events FOR SELECT
  USING (user_id = auth.uid());

-- Award points for a product action to the caller's active, live-cohort challenge
-- enrollment. No-op (returns 0) if the user isn't in a live challenge, the action
-- isn't configured, the ref was already scored, or the daily cap is reached.
-- Callable from web + worker via the service role. Never raises — scoring must
-- never block a product action.
CREATE OR REPLACE FUNCTION award_challenge_points(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_action       text,
  p_ref          text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enr          record;
  rule         jsonb;
  rule_points  int;
  daily_cap    int;
  today        date;
  today_points int;
  award        int;
BEGIN
  -- Resolve the caller's active challenge enrollment whose cohort is live (started, not ended).
  SELECT e.id AS enrollment_id, e.user_id, e.workspace_id, e.product_id, e.cohort_id,
         pr.challenge_config AS cfg
  INTO enr
  FROM academy_enrollments e
  JOIN academy_products pr ON pr.id = e.product_id
  JOIN academy_cohorts  c  ON c.id = e.cohort_id
  WHERE e.status = 'active'
    AND pr.product_type = 'challenge'
    AND c.starts_at <= now()
    AND (c.ends_at IS NULL OR c.ends_at > now())
    AND ( (p_user_id IS NOT NULL AND e.user_id = p_user_id)
       OR (p_workspace_id IS NOT NULL AND e.workspace_id = p_workspace_id) )
  ORDER BY e.enrolled_at DESC
  LIMIT 1;

  IF enr.enrollment_id IS NULL THEN
    RETURN 0;
  END IF;

  rule := enr.cfg -> 'points_rules' -> p_action;
  IF rule IS NULL THEN
    RETURN 0;
  END IF;
  rule_points := COALESCE((rule->>'points')::int, 0);
  daily_cap   := COALESCE((rule->>'daily_cap')::int, 2147483647);
  IF rule_points <= 0 THEN
    RETURN 0;
  END IF;

  -- Dedup by ref.
  IF p_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM academy_points_events
    WHERE enrollment_id = enr.enrollment_id AND ref = p_ref
  ) THEN
    RETURN 0;
  END IF;

  today := (now() AT TIME ZONE 'Africa/Lagos')::date;

  SELECT COALESCE(SUM(points), 0) INTO today_points
  FROM academy_points_events
  WHERE enrollment_id = enr.enrollment_id AND action = p_action AND wat_day = today;

  award := LEAST(rule_points, daily_cap - today_points);
  IF award <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO academy_points_events (enrollment_id, user_id, workspace_id, product_id, cohort_id, action, points, wat_day, ref)
  VALUES (enr.enrollment_id, enr.user_id, enr.workspace_id, enr.product_id, enr.cohort_id, p_action, award, today, p_ref)
  ON CONFLICT (enrollment_id, ref) WHERE ref IS NOT NULL DO NOTHING;

  IF NOT FOUND THEN
    RETURN 0;  -- lost a race on the dedup key
  END IF;

  -- Fold into the leaderboard aggregate (create the row lazily; leave streak/
  -- last_active_date alone — those are owned by challenge-day completion logic).
  INSERT INTO academy_gamification (enrollment_id, user_id, product_id, points)
  VALUES (enr.enrollment_id, enr.user_id, enr.product_id, award)
  ON CONFLICT (enrollment_id) DO UPDATE
    SET points = academy_gamification.points + EXCLUDED.points;

  RETURN award;
END;
$$;
