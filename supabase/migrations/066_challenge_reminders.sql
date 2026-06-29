-- Idempotency tracker for the challenge-reminders cron, mirroring the
-- billing_reminders_sent jsonb pattern used elsewhere (key per reminder, e.g. "daily_3", "missed_3").
alter table academy_enrollments add column if not exists reminders_sent jsonb not null default '{}'::jsonb;
