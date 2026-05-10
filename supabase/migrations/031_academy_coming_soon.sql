-- Seed academy coming-soon flag into admin_settings
-- value: { "enabled": true, "beta_workspaces": [] }
INSERT INTO admin_settings (key, value)
VALUES ('academy_coming_soon', '{"enabled": true, "beta_workspaces": []}')
ON CONFLICT (key) DO NOTHING;
