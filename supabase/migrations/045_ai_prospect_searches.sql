-- AI Prospect Search: stores Claude-generated lead lists + per-row enrichment state
-- Phase 1 (Vercel): Claude generates structured list → rows inserted, BullMQ job enqueued
-- Phase 2 (Worker): Discover VPS DB lookup + Reoon verification per row

CREATE TABLE ai_prospect_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  query           jsonb NOT NULL,         -- {industry, role, geography, company_size, count, model}
  model           text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','generating','enriching','done','failed')),
  error_message   text,
  total_generated integer NOT NULL DEFAULT 0,
  total_enriched  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_prospect_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id           uuid NOT NULL REFERENCES ai_prospect_searches(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL,
  -- Identity (from Claude)
  person_name         text,
  title               text,
  company_name        text,
  domain              text,
  linkedin_url        text,
  notes               text,
  -- Email sources
  ai_email            text,
  ai_email_confidence integer,            -- 0-100 (Claude's self-reported confidence)
  discover_email      text,               -- matched from VPS discover_people by domain+title
  best_email          text,               -- discover_email if found, else ai_email
  best_email_source   text CHECK (best_email_source IN ('discover','ai')),
  -- Enrichment + verification state
  enrichment_status   text NOT NULL DEFAULT 'pending'
                      CHECK (enrichment_status IN ('pending','done','failed')),
  verification_status text,
  -- Export tracking (set when user exports to a list/campaign)
  exported_at         timestamptz,
  lead_id             uuid REFERENCES outreach_leads(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ai_prospect_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prospect_results  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members" ON ai_prospect_searches
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "workspace members" ON ai_prospect_results
  FOR ALL USING (is_workspace_member(workspace_id));

-- Indexes
CREATE INDEX ON ai_prospect_searches (workspace_id, created_at DESC);
CREATE INDEX ON ai_prospect_results  (search_id);
CREATE INDEX ON ai_prospect_results  (workspace_id, exported_at) WHERE exported_at IS NULL;
