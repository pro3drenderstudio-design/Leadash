-- Mark CRM messages that originated from the AI suggest-mode agent, so the
-- admin inbox can show an "AI" indicator on those outbound replies.
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS ai_suggested boolean NOT NULL DEFAULT false;
