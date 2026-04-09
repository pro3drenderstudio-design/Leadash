import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const limit = parseInt(new URL(req.url).searchParams.get("limit") ?? "100");

  const { data, error } = await db
    .from("outreach_warmup_sends")
    .select("id, sent_at, replied_at, rescued_from_spam, subject, from_inbox:outreach_inboxes!from_inbox_id(id, label, email_address), to_inbox:outreach_inboxes!to_inbox_id(id, label, email_address)")
    .eq("workspace_id", workspaceId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
