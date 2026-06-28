-- ── 064: Fix funnel_sessions.session_id missing unique constraint ──────────
-- Applied 2026-06-28 via Supabase MCP
--
-- funnel_sessions.session_id had no unique constraint, so the app's
-- upsert(..., { onConflict: "session_id" }) in /api/funnels/track failed on
-- every call (no matching unique/exclusion constraint for ON CONFLICT).
-- funnel_page_events.session_id and funnel_submissions.session_id were uuid
-- FKs to funnel_sessions.id, but the app always sends the client-generated
-- text token (the same value as funnel_sessions.session_id), not the row id.
-- Both tables were empty (zero rows ever written), so this is a lossless
-- schema correction to match what the app already does end-to-end.

ALTER TABLE funnel_sessions ADD CONSTRAINT funnel_sessions_session_id_key UNIQUE (session_id);

ALTER TABLE funnel_page_events DROP CONSTRAINT funnel_page_events_session_id_fkey;
ALTER TABLE funnel_page_events ALTER COLUMN session_id TYPE text;
ALTER TABLE funnel_page_events ADD CONSTRAINT funnel_page_events_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES funnel_sessions(session_id);

ALTER TABLE funnel_submissions DROP CONSTRAINT funnel_submissions_session_id_fkey;
ALTER TABLE funnel_submissions ALTER COLUMN session_id TYPE text;
ALTER TABLE funnel_submissions ADD CONSTRAINT funnel_submissions_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES funnel_sessions(session_id);
