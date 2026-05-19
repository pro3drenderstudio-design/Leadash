-- Returns all unique lowercase emails from both outreach_leads and
-- lead_campaign_leads for a given workspace. Returned as a single text[]
-- so PostgREST's max_rows cap does not apply.
CREATE OR REPLACE FUNCTION get_workspace_lead_emails(p_workspace_id uuid)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT array_agg(DISTINCT lower(email))
  FROM (
    SELECT email FROM outreach_leads
      WHERE workspace_id = p_workspace_id AND email IS NOT NULL AND email <> ''
    UNION ALL
    SELECT email FROM lead_campaign_leads
      WHERE workspace_id = p_workspace_id AND email IS NOT NULL AND email <> ''
  ) t
$$;
