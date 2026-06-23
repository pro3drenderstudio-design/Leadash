-- ── Migration 052: WhatsApp template name keys ──────────────────────────────
-- Adds admin_settings entries for each WhatsApp template used by automations.
-- All default to empty string — admin fills in approved template names after
-- Meta approval. Automation builder nodes reference these keys at runtime so
-- template names can be changed without rebuilding flows.

INSERT INTO admin_settings (key, value) VALUES

  -- Sent on opt-in (user.opted_in event) — outside 24hr window
  ('wa_template_welcome',            '""'),

  -- Sent 1 hour after opt-in — reminder to watch the free training
  ('wa_template_training_reminder',  '""'),

  -- Sent after challenge purchase confirmation
  ('wa_template_challenge_enrolled', '""'),

  -- Day 1 complete — unlock Day 2 reminder
  ('wa_template_day1_complete',      '""'),

  -- Bundle upsell reminder (inside 30-day window, outside 24hr WA window)
  ('wa_template_bundle_offer',       '""'),

  -- Sent after bundle purchase
  ('wa_template_bundle_purchased',   '""'),

  -- 7-day bundle expiry warning
  ('wa_template_bundle_expiring',    '""'),

  -- Bundle renewed confirmation
  ('wa_template_bundle_renewed',     '""')

ON CONFLICT (key) DO NOTHING;
