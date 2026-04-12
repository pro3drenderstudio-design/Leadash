import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { runSendBatch } from "@/lib/outreach/send-runner";
import { runReplyPoll } from "@/lib/outreach/reply-runner";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  await req.json().catch(() => ({})); // consume body

  const [sends, replies] = await Promise.all([
    runSendBatch(workspaceId).catch(e => ({ sent: 0, failed: 0, error: String(e) })),
    runReplyPoll(workspaceId, 7).catch(e => ({ matched: 0, unmatched: 0, filtered: 0, inboxes: 0, details: [], error: String(e) })),
  ]);

  return NextResponse.json({ sends, replies });
}
