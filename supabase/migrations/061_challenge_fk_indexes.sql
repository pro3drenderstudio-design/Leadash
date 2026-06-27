-- ── 061: Cover challenge-table foreign keys with indexes (perf advisor) ────────
CREATE INDEX IF NOT EXISTS idx_challenge_completions_task_id ON academy_challenge_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_challenge_tasks_lesson_id ON academy_challenge_tasks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_challenge_tasks_live_session_id ON academy_challenge_tasks(live_session_id);
