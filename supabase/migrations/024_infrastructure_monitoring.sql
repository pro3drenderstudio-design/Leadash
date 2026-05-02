-- ── system_health_snapshots ───────────────────────────────────────────────────
-- Written by the worker every 5 minutes. Powers the admin infrastructure dashboard.
CREATE TABLE IF NOT EXISTS system_health_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at  timestamptz NOT NULL DEFAULT now(),
  redis        jsonb,   -- { memory_used_mb, memory_max_mb, memory_pct, connected_clients, evicted_keys }
  queues       jsonb,   -- [{ name, label, waiting, active, failed, delayed }]
  server       jsonb,   -- { cpu_load_1m/5m/15m, cpu_cores, ram_used_mb, ram_total_mb, ram_pct, disk_used_gb, disk_total_gb, disk_pct }
  postal       jsonb,   -- { queued, held, failed, delivered_today }
  db_stats     jsonb    -- { total_inboxes, active_inboxes, error_inboxes, warming_inboxes, active_campaigns, active_workspaces, sends_today }
);
CREATE INDEX IF NOT EXISTS idx_system_health_snapshots_captured_at
  ON system_health_snapshots (captured_at DESC);

-- ── notifications ─────────────────────────────────────────────────────────────
-- Deduped incident-style notifications. One row per open incident.
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  type         text        NOT NULL,   -- 'infra' | 'queue' | 'postal' | 'inbox_limit' | 'trial' | 'warmup'
  severity     text        NOT NULL,   -- 'info' | 'warning' | 'critical'
  title        text        NOT NULL,
  body         text,
  metadata     jsonb,
  workspace_id uuid        REFERENCES workspaces(id) ON DELETE CASCADE,
  dedup_key    text        NOT NULL,
  resolved_at  timestamptz,            -- null = still active
  read_at      timestamptz,            -- null = unread
  email_sent_at timestamptz            -- null = email not yet sent
);
-- Only one active notification per dedup_key at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_active
  ON notifications (dedup_key)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications (workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_severity     ON notifications (severity, resolved_at);

-- ── notification_settings ─────────────────────────────────────────────────────
-- Single-row config table for admin alert preferences.
CREATE TABLE IF NOT EXISTS notification_settings (
  id                uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  email_recipients  text[]    NOT NULL DEFAULT '{}',
  email_on_warning  boolean   NOT NULL DEFAULT false,
  email_on_critical boolean   NOT NULL DEFAULT true,
  quiet_hours_start time,                            -- e.g. 23:00
  quiet_hours_end   time,                            -- e.g. 07:00
  slack_webhook_url text,
  thresholds        jsonb     NOT NULL DEFAULT '{}'  -- override defaults per metric
);
-- Ensure exactly one settings row exists
INSERT INTO notification_settings (id)
  VALUES (gen_random_uuid())
  ON CONFLICT DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE system_health_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings    ENABLE ROW LEVEL SECURITY;

-- Service role has full access; no public/anon access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_health_snapshots' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON system_health_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON notifications
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notification_settings' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON notification_settings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
