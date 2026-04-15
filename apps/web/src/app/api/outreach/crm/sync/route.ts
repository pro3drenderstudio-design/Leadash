import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { runReplyPoll } from "@/lib/outreach/reply-runner";

export const maxDuration = 45;

// POST /api/outreach/crm/sync
// Triggers an IMAP reply poll for the current workspace and returns new reply count.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  try {
    const result = await runReplyPoll(workspaceId, 5);
    return NextResponse.json(result ?? { new_replies: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
