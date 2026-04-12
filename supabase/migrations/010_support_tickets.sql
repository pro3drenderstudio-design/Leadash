-- Support ticket system
CREATE TABLE IF NOT EXISTS support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  ticket_number   serial,
  subject         text NOT NULL,
  message         text NOT NULL,
  category        text NOT NULL DEFAULT 'general'
                    CHECK (category IN ('billing','technical','general','feature_request','bug')),
  priority        text NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high','urgent')),
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','waiting_on_you','resolved','closed')),
  admin_reply     text,
  admin_replied_at timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_workspace_idx ON support_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage own tickets"
  ON support_tickets FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
