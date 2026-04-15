-- Ticket conversation thread.
-- Each row is a single message from either the user or admin.
-- The legacy support_tickets.admin_reply + admin_replied_at columns are kept
-- for backward compatibility but new code reads from this table.

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'admin')),
  user_id     uuid REFERENCES auth.users ON DELETE SET NULL,  -- populated for user messages
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages(ticket_id, created_at);

-- RLS: workspace members can see/insert messages on their own tickets
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can view own ticket messages"
  ON ticket_messages FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "workspace members can insert user messages on own tickets"
  ON ticket_messages FOR INSERT
  WITH CHECK (
    sender_type = 'user'
    AND ticket_id IN (
      SELECT id FROM support_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );
