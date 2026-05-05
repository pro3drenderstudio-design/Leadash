-- ── Monthly range partitioning for high-volume outreach tables ────────────────
-- At 500K sends/day, outreach_sends alone would grow to 180M rows/year.
-- Partitioning by month enables:
--   • Partition pruning (queries with a date range only scan relevant months)
--   • Cheap DROP of old data (drop a partition instead of DELETE)
--   • Per-partition VACUUM/ANALYZE on recently active months only
--
-- Tables partitioned:
--   outreach_sends        — by created_at
--   outreach_warmup_sends — by sent_at
--   outreach_replies      — by created_at
--
-- FK trade-offs:
--   • outreach_tracked_links.send_id → outreach_sends(id)  : DROPPED
--   • outreach_replies.send_id       → outreach_sends(id)  : DROPPED
--   Postgres requires unique/PK constraints on partitioned tables to include
--   the partition key, so FKs referencing only the id column cannot be used.
--   Application-level referential integrity is maintained instead.
--
-- UNIQUE(message_id) on outreach_replies becomes a regular index.
-- App-level SELECT-before-INSERT dedup (already in place) handles uniqueness.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- PART 1: outreach_sends  (partition by created_at)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE outreach_tracked_links DROP CONSTRAINT outreach_tracked_links_send_id_fkey;
ALTER TABLE outreach_replies       DROP CONSTRAINT outreach_replies_send_id_fkey;

ALTER TABLE outreach_sends RENAME TO outreach_sends_old;

CREATE TABLE outreach_sends (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL,
  enrollment_id    uuid        NOT NULL,
  sequence_step_id uuid,
  inbox_id         uuid,
  to_email         text        NOT NULL,
  subject          text        NOT NULL,
  body             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','opened','bounced','failed')),
  sent_at          timestamptz,
  opened_at        timestamptz,
  clicked_at       timestamptz,
  replied_at       timestamptz,
  bounced_at       timestamptz,
  open_count       int         NOT NULL DEFAULT 0,
  click_count      int         NOT NULL DEFAULT 0,
  message_id       text,
  thread_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE outreach_sends ADD CONSTRAINT outreach_sends_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE outreach_sends ADD CONSTRAINT outreach_sends_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES outreach_enrollments(id) ON DELETE CASCADE;
ALTER TABLE outreach_sends ADD CONSTRAINT outreach_sends_sequence_step_id_fkey
  FOREIGN KEY (sequence_step_id) REFERENCES outreach_sequences(id) ON DELETE SET NULL;
ALTER TABLE outreach_sends ADD CONSTRAINT outreach_sends_inbox_id_fkey
  FOREIGN KEY (inbox_id) REFERENCES outreach_inboxes(id) ON DELETE SET NULL;

DO $$
DECLARE yr int; mo int; s text; e text;
BEGIN
  FOR yr IN 2024..2028 LOOP
    FOR mo IN 1..12 LOOP
      s := to_char(make_date(yr, mo, 1), 'YYYY-MM-DD');
      e := to_char(make_date(yr, mo, 1) + interval '1 month', 'YYYY-MM-DD');
      EXECUTE format(
        'CREATE TABLE outreach_sends_%s_%s PARTITION OF outreach_sends FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
        yr, lpad(mo::text, 2, '0'), s, e
      );
    END LOOP;
  END LOOP;
END $$;
CREATE TABLE outreach_sends_default PARTITION OF outreach_sends DEFAULT;

INSERT INTO outreach_sends SELECT * FROM outreach_sends_old;
DROP TABLE outreach_sends_old;

CREATE INDEX idx_sends_id         ON outreach_sends (id);
CREATE INDEX idx_sends_ws         ON outreach_sends (workspace_id, status, sent_at DESC);
CREATE INDEX idx_sends_enrollment ON outreach_sends (enrollment_id);
CREATE INDEX idx_sends_message_id ON outreach_sends (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE outreach_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_all_outreach_sends" ON outreach_sends
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- ════════════════════════════════════════════════════════════════
-- PART 2: outreach_warmup_sends  (partition by sent_at)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE outreach_warmup_sends RENAME TO outreach_warmup_sends_old;

CREATE TABLE outreach_warmup_sends (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL,
  from_inbox_id     uuid        NOT NULL,
  to_inbox_id       uuid        NOT NULL,
  message_id        text,
  thread_id         text,
  subject           text,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  replied_at        timestamptz,
  rescued_from_spam boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (id, sent_at)
) PARTITION BY RANGE (sent_at);

ALTER TABLE outreach_warmup_sends ADD CONSTRAINT outreach_warmup_sends_workspace_id_fkey
  FOREIGN KEY (workspace_id)  REFERENCES workspaces(id)       ON DELETE CASCADE;
ALTER TABLE outreach_warmup_sends ADD CONSTRAINT outreach_warmup_sends_from_inbox_id_fkey
  FOREIGN KEY (from_inbox_id) REFERENCES outreach_inboxes(id) ON DELETE CASCADE;
ALTER TABLE outreach_warmup_sends ADD CONSTRAINT outreach_warmup_sends_to_inbox_id_fkey
  FOREIGN KEY (to_inbox_id)   REFERENCES outreach_inboxes(id) ON DELETE CASCADE;

DO $$
DECLARE yr int; mo int; s text; e text;
BEGIN
  FOR yr IN 2024..2028 LOOP
    FOR mo IN 1..12 LOOP
      s := to_char(make_date(yr, mo, 1), 'YYYY-MM-DD');
      e := to_char(make_date(yr, mo, 1) + interval '1 month', 'YYYY-MM-DD');
      EXECUTE format(
        'CREATE TABLE outreach_warmup_sends_%s_%s PARTITION OF outreach_warmup_sends FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
        yr, lpad(mo::text, 2, '0'), s, e
      );
    END LOOP;
  END LOOP;
END $$;
CREATE TABLE outreach_warmup_sends_default PARTITION OF outreach_warmup_sends DEFAULT;

INSERT INTO outreach_warmup_sends SELECT * FROM outreach_warmup_sends_old;
DROP TABLE outreach_warmup_sends_old;

CREATE INDEX idx_warmup_id         ON outreach_warmup_sends (id);
CREATE INDEX idx_warmup_ws         ON outreach_warmup_sends (workspace_id, sent_at DESC);
CREATE INDEX idx_warmup_from_inbox ON outreach_warmup_sends (from_inbox_id);
CREATE INDEX idx_warmup_message_id ON outreach_warmup_sends (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE outreach_warmup_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_all_outreach_warmup_sends" ON outreach_warmup_sends
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- ════════════════════════════════════════════════════════════════
-- PART 3: outreach_replies  (partition by created_at)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE outreach_replies RENAME TO outreach_replies_old;

CREATE TABLE outreach_replies (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL,
  inbox_id      uuid,
  send_id       uuid,
  enrollment_id uuid,
  from_email    text        NOT NULL,
  from_name     text,
  subject       text,
  body_text     text,
  message_id    text,
  in_reply_to   text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  ai_category   text,
  ai_confidence real,
  is_filtered   boolean     NOT NULL DEFAULT false,
  filter_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  attachments   jsonb       NOT NULL DEFAULT '[]',
  is_warmup     boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE outreach_replies ADD CONSTRAINT outreach_replies_workspace_id_fkey
  FOREIGN KEY (workspace_id)  REFERENCES workspaces(id)           ON DELETE CASCADE;
ALTER TABLE outreach_replies ADD CONSTRAINT outreach_replies_inbox_id_fkey
  FOREIGN KEY (inbox_id)      REFERENCES outreach_inboxes(id)     ON DELETE SET NULL;
ALTER TABLE outreach_replies ADD CONSTRAINT outreach_replies_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES outreach_enrollments(id) ON DELETE SET NULL;
-- send_id → outreach_sends omitted: both tables are now partitioned.
-- Postgres does not support FK from a partitioned table to another partitioned
-- table when the referenced column is not the partition key.

DO $$
DECLARE yr int; mo int; s text; e text;
BEGIN
  FOR yr IN 2024..2028 LOOP
    FOR mo IN 1..12 LOOP
      s := to_char(make_date(yr, mo, 1), 'YYYY-MM-DD');
      e := to_char(make_date(yr, mo, 1) + interval '1 month', 'YYYY-MM-DD');
      EXECUTE format(
        'CREATE TABLE outreach_replies_%s_%s PARTITION OF outreach_replies FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
        yr, lpad(mo::text, 2, '0'), s, e
      );
    END LOOP;
  END LOOP;
END $$;
CREATE TABLE outreach_replies_default PARTITION OF outreach_replies DEFAULT;

INSERT INTO outreach_replies SELECT * FROM outreach_replies_old;
DROP TABLE outreach_replies_old;

CREATE INDEX idx_replies_id         ON outreach_replies (id);
CREATE INDEX idx_replies_ws         ON outreach_replies (workspace_id, received_at DESC);
CREATE INDEX idx_replies_enrollment ON outreach_replies (enrollment_id);
CREATE INDEX idx_replies_message_id ON outreach_replies (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_replies_is_warmup  ON outreach_replies (workspace_id, is_warmup, received_at DESC)
  WHERE is_warmup = true;

ALTER TABLE outreach_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_all_outreach_replies" ON outreach_replies
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

COMMIT;
