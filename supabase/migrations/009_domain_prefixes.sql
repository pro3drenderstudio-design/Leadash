-- Store explicit mailbox local-parts (e.g. ["john","j.smith","john.smith"])
-- When set, provision uses these directly instead of the prefix+count pattern.
ALTER TABLE outreach_domains
  ADD COLUMN IF NOT EXISTS mailbox_prefixes jsonb; -- string[]
