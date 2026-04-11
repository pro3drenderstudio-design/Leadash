-- ─── Domain registrant contact info ──────────────────────────────────────────
-- Stored per-workspace in workspace_settings.
-- Used as the WHOIS registrant when purchasing domains via Namecheap API.

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS registrant_first_name text,
  ADD COLUMN IF NOT EXISTS registrant_last_name  text,
  ADD COLUMN IF NOT EXISTS registrant_address    text,
  ADD COLUMN IF NOT EXISTS registrant_city       text,
  ADD COLUMN IF NOT EXISTS registrant_state      text,
  ADD COLUMN IF NOT EXISTS registrant_zip        text,
  ADD COLUMN IF NOT EXISTS registrant_country    text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS registrant_phone      text,
  ADD COLUMN IF NOT EXISTS registrant_email      text;
