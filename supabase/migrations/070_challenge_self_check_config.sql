ALTER TABLE academy_challenge_tasks
  ADD COLUMN IF NOT EXISTS self_check_config jsonb;
