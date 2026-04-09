import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runReplyPoll } from "@/lib/outreach/reply-runner";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: workspaces } = await db
    .from("outreach_inboxes")
    .select("workspace_id")
    .eq("status", "active");

  const uniqueIds = [...new Set((workspaces ?? []).map(r => r.workspace_id))];
  if (!uniqueIds.length) return NextResponse.json({ workspaces: 0 });

  const results = await Promise.all(
    uniqueIds.map(id => runReplyPoll(id, 7).catch(e => ({ workspace_id: id, error: String(e) })))
  );

  return NextResponse.json({ workspaces: uniqueIds.length, results });
}
