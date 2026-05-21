-- Seed default credit rates into admin_settings
INSERT INTO admin_settings (key, value) VALUES
  ('credit_rate_verify',     '1'),
  ('credit_rate_discover',   '0.5'),
  ('credit_rate_first_line', '1'),
  ('credit_rate_scrape',     '1')
ON CONFLICT (key) DO NOTHING;
