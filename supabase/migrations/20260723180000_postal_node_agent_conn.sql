-- Per-node postal-agent connection so provisioning can route to a specific
-- Postal node (separate VPS + IP) instead of always the default env agent.
-- NULL columns fall back to the default env (node 1) — fully backward compatible.
ALTER TABLE postal_nodes
  ADD COLUMN IF NOT EXISTS agent_url    text,
  ADD COLUMN IF NOT EXISTS agent_secret text,
  ADD COLUMN IF NOT EXISTS smtp_host    text;

COMMENT ON COLUMN postal_nodes.agent_url IS 'Per-node postal-agent base URL; NULL = use default env POSTAL_AGENT_URL (node 1)';
COMMENT ON COLUMN postal_nodes.agent_secret IS 'Per-node postal-agent shared secret; NULL = use default env POSTAL_AGENT_SECRET';
COMMENT ON COLUMN postal_nodes.smtp_host IS 'Per-node SMTP/mail hostname stored on inboxes + used for MX; NULL = default env POSTAL_SMTP_HOST';
