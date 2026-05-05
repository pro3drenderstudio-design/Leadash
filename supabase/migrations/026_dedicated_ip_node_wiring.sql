-- ── Dedicated IP node wiring ───────────────────────────────────────────────────
-- 1. Raise max_inboxes default from 50 → 100 (dedicated nodes handle up to 100)
-- 2. postal_node_id already added to dedicated_ip_subscriptions in 025_postal_nodes.sql

ALTER TABLE dedicated_ip_subscriptions ALTER COLUMN max_inboxes SET DEFAULT 100;
