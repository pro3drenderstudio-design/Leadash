import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const limit = parseInt(new URL(req.url).searchParams.get("limit") ?? "100");

  const { data: sends, error } = await db
    .from("outreach_warmup_sends")
    .select("id, sent_at, replied_at, rescued_from_spam, subject, from_inbox_id, to_inbox_id")
    .eq("workspace_id", workspaceId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sends || sends.length === 0) return NextResponse.json([]);

  // Resolve inbox details separately to avoid ambiguous FK join issues
  const inboxIds = [...new Set([...sends.map((s: { from_inbox_id: string }) => s.from_inbox_id), ...sends.map((s: { to_inbox_id: string }) => s.to_inbox_id)])];
  const { data: inboxRows } = await db
    .from("outreach_inboxes")
    .select("id, label, email_address")
    .in("id", inboxIds);

  const inboxMap = new Map((inboxRows ?? []).map((i: { id: string; label: string; email_address: string }) => [i.id, i]));

  const result = sends.map((s: { id: string; sent_at: string; replied_at: string | null; rescued_from_spam: boolean; subject: string | null; from_inbox_id: string; to_inbox_id: string }) => ({
    id:               s.id,
    sent_at:          s.sent_at,
    replied_at:       s.replied_at,
    rescued_from_spam: s.rescued_from_spam,
    subject:          s.subject,
    from_inbox:       inboxMap.get(s.from_inbox_id) ?? null,
    to_inbox:         inboxMap.get(s.to_inbox_id)   ?? null,
  }));

  return NextResponse.json(result);
}
