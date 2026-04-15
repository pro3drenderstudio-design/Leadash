-- ─── Platform-wide admin settings ─────────────────────────────────────────────
-- Key/value store for global configuration controlled by admins.

CREATE TABLE IF NOT EXISTS admin_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users ON DELETE SET NULL
);

-- Seed defaults
INSERT INTO admin_settings (key, value) VALUES
  ('maintenance_mode',       'false'),
  ('announcement_banner',    '{"active": false, "text": "", "color": "blue"}'),
  ('signup_enabled',         'true'),
  ('trial_days',             '14'),
  ('default_plan',           '"free"'),
  ('lead_credits_on_signup', '25'),
  ('support_email',          '"support@leadash.io"')
ON CONFLICT (key) DO NOTHING;
