-- Migration 076: Link tracking (URL shortener + click analytics)
-- Admin creates named slugs (e.g. "whatsapp-challenge-group") that redirect to any URL.
-- Click events tracked with device/country/referrer for Bitly-style metrics.

CREATE TABLE IF NOT EXISTS tracked_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,
  title           text        NOT NULL,
  destination_url text        NOT NULL,
  description     text,
  total_clicks    bigint      NOT NULL DEFAULT 0,
  unique_clicks   bigint      NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracked_link_clicks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      uuid        NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  clicked_at   timestamptz NOT NULL DEFAULT now(),
  ip_hash      text,
  country      text,
  city         text,
  device_type  text,
  browser      text,
  os           text,
  referrer     text,
  visitor_id   text
);

CREATE INDEX IF NOT EXISTS tracked_link_clicks_link_id_idx ON tracked_link_clicks (link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS tracked_link_clicks_visitor_idx ON tracked_link_clicks (link_id, visitor_id);

ALTER TABLE tracked_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked_links_admin"       ON tracked_links       FOR ALL USING (is_admin());
CREATE POLICY "tracked_link_clicks_admin" ON tracked_link_clicks FOR ALL USING (is_admin());
