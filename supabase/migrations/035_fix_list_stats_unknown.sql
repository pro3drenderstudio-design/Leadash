-- Redefine get_list_stats so "unknown" (checked but inconclusive) is separated
-- from "pending" (never checked).
--
-- verified_count : deliverable  — valid, safe, verified_external, catch_all
-- pending_count  : never run    — verified_at IS NULL
-- invalid_count  : bad address  — invalid, dangerous, disposable, risky
-- unknown_count  : checked but inconclusive — verification ran, status = 'unknown'

CREATE OR REPLACE FUNCTION get_list_stats(
  p_workspace_id uuid,
  p_list_ids     uuid[]
)
RETURNS TABLE (
  list_id       uuid,
  lead_count    bigint,
  verified_count bigint,
  pending_count  bigint,
  invalid_count  bigint,
  unknown_count  bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    list_id,
    COUNT(*)                                                                       AS lead_count,
    COUNT(*) FILTER (WHERE verification_status IN ('valid','safe','verified_external','catch_all')) AS verified_count,
    COUNT(*) FILTER (WHERE verified_at IS NULL)                                    AS pending_count,
    COUNT(*) FILTER (WHERE verification_status IN ('invalid','dangerous','disposable','risky'))     AS invalid_count,
    COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND verification_status = 'unknown')             AS unknown_count
  FROM outreach_leads
  WHERE workspace_id = p_workspace_id
    AND list_id = ANY(p_list_ids)
  GROUP BY list_id;
$$;
