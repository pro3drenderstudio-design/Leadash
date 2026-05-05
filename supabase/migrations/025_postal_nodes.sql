-- ── Postal infrastructure nodes ───────────────────────────────────────────────
-- Tracks every physical VPS in the Postal sending pool.
-- Shared nodes: 150-inbox platform threshold.
-- Dedicated nodes: 100-inbox per-workspace threshold.

CREATE TABLE postal_nodes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label            TEXT        NOT NULL,
  ip_address       TEXT        NOT NULL UNIQUE,
  postal_server_id INTEGER,
  postal_pool_id   INTEGER,
  status           TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'provisioning', 'offline', 'retired')),
  is_shared        BOOLEAN     NOT NULL DEFAULT true,
  workspace_id     UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  inbox_limit      INTEGER     NOT NULL DEFAULT 150,
  notes            TEXT,
  provisioned_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON postal_nodes (status);
CREATE INDEX ON postal_nodes (workspace_id);

ALTER TABLE postal_nodes ENABLE ROW LEVEL SECURITY;
-- No public access — admin only via service role
CREATE POLICY "no public access" ON postal_nodes USING (false);

-- ── Link inboxes + dedicated subscriptions to nodes ───────────────────────────
ALTER TABLE outreach_inboxes
  ADD COLUMN IF NOT EXISTS postal_node_id UUID
    REFERENCES postal_nodes(id) ON DELETE SET NULL;

CREATE INDEX ON outreach_inboxes (postal_node_id);

ALTER TABLE dedicated_ip_subscriptions
  ADD COLUMN IF NOT EXISTS postal_node_id UUID
    REFERENCES postal_nodes(id) ON DELETE SET NULL;

ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS postal_node_id UUID
    REFERENCES postal_nodes(id) ON DELETE SET NULL;

-- ── Seed the existing shared node ─────────────────────────────────────────────
INSERT INTO postal_nodes (label, ip_address, status, is_shared, inbox_limit, notes, provisioned_at)
VALUES (
  'Node 1 — Shared Pool',
  '209.145.55.138',
  'active',
  true,
  150,
  'Original Contabo VPS',
  now()
);

-- Assign all existing Postal-provisioned inboxes to Node 1
UPDATE outreach_inboxes
SET postal_node_id = (SELECT id FROM postal_nodes WHERE ip_address = '209.145.55.138')
WHERE provider = 'postal';
