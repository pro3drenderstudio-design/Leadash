-- Default verifier_provider setting (reoon = existing behaviour, no change needed for existing installs)
INSERT INTO admin_settings (key, value)
VALUES ('verifier_provider', '"reoon"')
ON CONFLICT (key) DO NOTHING;
