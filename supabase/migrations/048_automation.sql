-- ── 048: Visual Automation Builder ───────────────────────────────────────────
-- Stores flow definitions, version history, execution records, and per-step
-- audit logs for the admin-facing automation builder.

-- ── 1. automation_flows ───────────────────────────────────────────────────────
-- Each row is one automation flow. flow_definition stores the React Flow
-- node + edge graph as JSON. Inactive flows are never executed.
CREATE TABLE IF NOT EXISTS automation_flows (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  description      text,
  trigger_event    text        NOT NULL,  -- e.g. 'user.opted_in'
  trigger_filters  jsonb       NOT NULL DEFAULT '{}',

  -- What happens when the same user triggers this flow while already in it:
  --   deduplicate → block second execution (default)
  --   parallel    → both run simultaneously
  --   restart     → cancel current, start fresh
  duplicate_policy text        NOT NULL DEFAULT 'deduplicate'
                   CHECK (duplicate_policy IN ('deduplicate', 'parallel', 'restart')),

  -- React Flow compatible JSON (nodes + edges array)
  flow_definition  jsonb       NOT NULL DEFAULT '{}',

  is_active        boolean     NOT NULL DEFAULT false,
  version          int         NOT NULL DEFAULT 1,
  last_published_at timestamptz,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_flows_trigger_idx
  ON automation_flows (trigger_event, is_active);

ALTER TABLE automation_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_flows_admin"
  ON automation_flows
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 2. automation_flow_versions ───────────────────────────────────────────────
-- Immutable snapshot of each published version. In-progress executions
-- reference their original version so editing a live flow doesn't break them.
CREATE TABLE IF NOT EXISTS automation_flow_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         uuid        NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  version         int         NOT NULL,
  flow_definition jsonb       NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS flow_versions_flow_idx
  ON automation_flow_versions (flow_id, version DESC);

ALTER TABLE automation_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_versions_admin"
  ON automation_flow_versions
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 3. automation_executions ──────────────────────────────────────────────────
-- One record per user per flow run. Pinned to the flow_version that was active
-- when the execution started.
CREATE TABLE IF NOT EXISTS automation_executions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         uuid        NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  -- Version this execution runs against (pinned at start)
  flow_version    int         NOT NULL,
  trigger_event   text        NOT NULL,
  -- Full event payload that triggered this execution
  trigger_data    jsonb       NOT NULL DEFAULT '{}',
  workspace_id    uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','paused','cancelled')),
  -- Which node the execution is currently waiting at (for wait/delay nodes)
  current_node_id text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  error_message   text
);

CREATE INDEX IF NOT EXISTS executions_flow_status_idx
  ON automation_executions (flow_id, status);

CREATE INDEX IF NOT EXISTS executions_user_flow_idx
  ON automation_executions (user_id, flow_id)
  WHERE status IN ('running', 'paused');

CREATE INDEX IF NOT EXISTS executions_workspace_idx
  ON automation_executions (workspace_id);

ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "executions_admin"
  ON automation_executions
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ── 4. automation_execution_steps ────────────────────────────────────────────
-- Per-node audit trail for each execution. Never deleted — full history.
CREATE TABLE IF NOT EXISTS automation_execution_steps (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  uuid        NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  node_id       text        NOT NULL,
  node_type     text        NOT NULL,
  -- pending → running → completed | failed | skipped
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','skipped')),
  -- Input data passed to this node
  input         jsonb       NOT NULL DEFAULT '{}',
  -- Output / result from this node
  output        jsonb       NOT NULL DEFAULT '{}',
  started_at    timestamptz,
  completed_at  timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS steps_execution_idx
  ON automation_execution_steps (execution_id);

ALTER TABLE automation_execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_steps_admin"
  ON automation_execution_steps
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
