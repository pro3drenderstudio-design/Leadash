-- Add attachments column to outreach_replies
-- Each element: { name, mimeType, size, path, url }
ALTER TABLE outreach_replies
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Supabase Storage bucket for reply attachments (run once via dashboard or CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('reply-attachments', 'reply-attachments', false)
-- ON CONFLICT (id) DO NOTHING;
