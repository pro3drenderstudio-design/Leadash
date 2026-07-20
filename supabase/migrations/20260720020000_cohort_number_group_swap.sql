-- Cohort numbering (1..52) + auto-swap of the "active challenge group" tracked
-- link when the scheduler opens a new cohort. The 52 group URLs + the active
-- link slug live in admin_settings.cohort_whatsapp_groups:
--   { "active_link_slug": "7-days-challenge", "groups": { "1": "<url>", ... } }

ALTER TABLE academy_cohorts ADD COLUMN IF NOT EXISTS cohort_number int;

-- Backfill existing cohorts: number by go-live order per product.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY product_id ORDER BY starts_at) AS rn
  FROM academy_cohorts
)
UPDATE academy_cohorts c SET cohort_number = r.rn FROM ranked r
WHERE c.id = r.id AND c.cohort_number IS NULL;

CREATE OR REPLACE FUNCTION run_cohort_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p              record;
  wk_monday_wat  timestamp;
  golive_utc     timestamptz;
  ends_utc       timestamptz;
  created        int := 0;
  winners        jsonb := '[]'::jsonb;
  c              record;
  win            record;
  new_num        int;
  grp_cfg        jsonb;
  grp_slug       text;
  grp_url        text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('academy_cohort_scheduler'));

  FOR p IN
    SELECT id, slug,
           COALESCE((challenge_config->'cohort_cadence'->>'golive_hour_wat')::int, 21) AS gh,
           COALESCE((challenge_config->>'duration_days')::int, 7) AS dur
    FROM academy_products
    WHERE product_type = 'challenge' AND COALESCE(is_active, true)
      AND challenge_config->>'start_mode' = 'cohort' AND challenge_config ? 'cohort_cadence'
  LOOP
    wk_monday_wat := date_trunc('week', (now() AT TIME ZONE 'Africa/Lagos'));
    golive_utc := ((wk_monday_wat + interval '7 days' + make_interval(hours => p.gh)) AT TIME ZONE 'Africa/Lagos');
    ends_utc   := ((wk_monday_wat + interval '7 days' + make_interval(hours => p.gh) + make_interval(days => p.dur)) AT TIME ZONE 'Africa/Lagos');

    IF NOT EXISTS (SELECT 1 FROM academy_cohorts WHERE product_id = p.id AND starts_at = golive_utc) THEN
      UPDATE academy_cohorts
        SET is_default = false,
            enrollment_closes_at = COALESCE(enrollment_closes_at, (wk_monday_wat AT TIME ZONE 'Africa/Lagos'))
        WHERE product_id = p.id AND is_default = true;

      SELECT COALESCE(max(cohort_number), 0) + 1 INTO new_num FROM academy_cohorts WHERE product_id = p.id;

      INSERT INTO academy_cohorts (product_id, name, starts_at, ends_at, status, is_default, cohort_number)
        VALUES (p.id, 'Cohort ' || new_num || ' — week of ' || to_char((wk_monday_wat)::date, 'Mon DD'),
                golive_utc, ends_utc, 'upcoming', true, new_num);
      created := created + 1;

      BEGIN
        SELECT value::jsonb INTO grp_cfg FROM admin_settings WHERE key = 'cohort_whatsapp_groups';
        IF grp_cfg IS NOT NULL THEN
          grp_slug := COALESCE(grp_cfg->>'active_link_slug', '7-days-challenge');
          grp_url  := grp_cfg->'groups'->>(new_num::text);
          IF grp_url IS NOT NULL AND grp_url <> '' THEN
            UPDATE tracked_links SET destination_url = grp_url, updated_at = now() WHERE slug = grp_slug;
          END IF;
        END IF;
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;

    UPDATE academy_cohorts SET status = 'active'
      WHERE product_id = p.id AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
        AND status IS DISTINCT FROM 'active' AND status IS DISTINCT FROM 'ended';

    FOR c IN
      SELECT id FROM academy_cohorts
      WHERE product_id = p.id AND ends_at IS NOT NULL AND ends_at <= now() AND status IS DISTINCT FROM 'ended'
    LOOP
      SELECT e.id AS enrollment_id, g.points AS points INTO win
      FROM academy_enrollments e JOIN academy_gamification g ON g.enrollment_id = e.id
      WHERE e.cohort_id = c.id ORDER BY g.points DESC, g.last_active_date ASC NULLS LAST LIMIT 1;

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
