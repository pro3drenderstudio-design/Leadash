-- ── 053: Funnels — Flexible Page Builder System ─────────────────────────────
-- Applied 2026-06-24 via Supabase MCP

-- Core funnel
CREATE TABLE IF NOT EXISTS funnels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  custom_domain  text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  global_styles  jsonb DEFAULT '{}',
  settings       jsonb DEFAULT '{}',
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Pages within a funnel
CREATE TABLE IF NOT EXISTS funnel_pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id    uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  step_order   int NOT NULL DEFAULT 0,
  page_type    text NOT NULL DEFAULT 'landing'
    CHECK (page_type IN ('landing','optin','sales','order','oto','downsell','thankyou','webinar','survey')),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  blocks       jsonb DEFAULT '[]',
  settings     jsonb DEFAULT '{}',
  connection   jsonb DEFAULT '{}',
  published_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (funnel_id, slug)
);

-- Page version history (saved snapshots)
CREATE TABLE IF NOT EXISTS funnel_page_versions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id  uuid NOT NULL REFERENCES funnel_pages(id) ON DELETE CASCADE,
  version  int NOT NULL,
  blocks   jsonb DEFAULT '[]',
  settings jsonb DEFAULT '{}',
  saved_by uuid REFERENCES auth.users(id),
  saved_at timestamptz DEFAULT now(),
  UNIQUE (page_id, version)
);

-- A/B tests
CREATE TABLE IF NOT EXISTS funnel_ab_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  control_page_id uuid REFERENCES funnel_pages(id),
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed')),
  goal_metric     text NOT NULL DEFAULT 'conversion'
    CHECK (goal_metric IN ('conversion','revenue','time_on_page','scroll_depth')),
  auto_winner     boolean DEFAULT false,
  winner_page_id  uuid REFERENCES funnel_pages(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- A/B test variants
CREATE TABLE IF NOT EXISTS funnel_ab_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id      uuid NOT NULL REFERENCES funnel_ab_tests(id) ON DELETE CASCADE,
  page_id      uuid NOT NULL REFERENCES funnel_pages(id),
  traffic_pct  int NOT NULL DEFAULT 50 CHECK (traffic_pct BETWEEN 0 AND 100),
  visitors     int NOT NULL DEFAULT 0,
  conversions  int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- Visitor sessions
CREATE TABLE IF NOT EXISTS funnel_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id  uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  contact_id uuid REFERENCES crm_contacts(id),
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  utm_content text,
  utm_term    text,
  referrer    text,
  device      text CHECK (device IN ('mobile','desktop','tablet')),
  country     text,
  created_at  timestamptz DEFAULT now()
);

-- Page events
CREATE TABLE IF NOT EXISTS funnel_page_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES funnel_pages(id) ON DELETE CASCADE,
  session_id uuid REFERENCES funnel_sessions(id),
  contact_id uuid REFERENCES crm_contacts(id),
  event_type text NOT NULL
    CHECK (event_type IN ('view','conversion','button_click','form_submit','exit','scroll_50','scroll_80')),
  metadata   jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Form submissions
CREATE TABLE IF NOT EXISTS funnel_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES funnel_pages(id) ON DELETE CASCADE,
  session_id uuid REFERENCES funnel_sessions(id),
  contact_id uuid REFERENCES crm_contacts(id),
  data       jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS funnel_pages_funnel_id_idx       ON funnel_pages(funnel_id);
CREATE INDEX IF NOT EXISTS funnel_sessions_funnel_id_idx    ON funnel_sessions(funnel_id);
CREATE INDEX IF NOT EXISTS funnel_page_events_page_id_idx   ON funnel_page_events(page_id);
CREATE INDEX IF NOT EXISTS funnel_submissions_page_id_idx   ON funnel_submissions(page_id);

-- RLS
ALTER TABLE funnels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_ab_tests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_ab_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_page_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_submissions   ENABLE ROW LEVEL SECURITY;

-- Admin-only write; public can read published pages
CREATE POLICY "funnels_admin" ON funnels FOR ALL USING (is_admin());
CREATE POLICY "funnel_pages_admin" ON funnel_pages FOR ALL USING (is_admin());
CREATE POLICY "funnel_pages_public_read" ON funnel_pages FOR SELECT USING (status = 'published');
CREATE POLICY "funnel_page_versions_admin" ON funnel_page_versions FOR ALL USING (is_admin());
CREATE POLICY "funnel_ab_tests_admin" ON funnel_ab_tests FOR ALL USING (is_admin());
CREATE POLICY "funnel_ab_variants_admin" ON funnel_ab_variants FOR ALL USING (is_admin());
CREATE POLICY "funnel_sessions_admin" ON funnel_sessions FOR ALL USING (is_admin());
CREATE POLICY "funnel_page_events_admin" ON funnel_page_events FOR ALL USING (is_admin());
CREATE POLICY "funnel_submissions_admin" ON funnel_submissions FOR ALL USING (is_admin());
