import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Fetch this workspace's inbox IDs so we can find warmup emails received
  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id, label, email_address")
    .eq("workspace_id", workspaceId);

  const inboxIds = (inboxes ?? []).map((i: { id: string }) => i.id);

  if (!inboxIds.length) return NextResponse.json([]);

  // Query warmup sends where one of our inboxes was the recipient.
  // This captures all warmup traffic regardless of transport (Gmail/SMTP/Postal).
  const { data, error } = await db
    .from("outreach_warmup_sends")
    .select("*, to_inbox:outreach_inboxes!to_inbox_id(id, label, email_address), from_inbox:outreach_inboxes!from_inbox_id(id, label, email_address, workspace_id)")
    .in("to_inbox_id", inboxIds)
    .order("sent_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Shape into a format the client can render: sender info, received inbox, timing
  const inboxMap = Object.fromEntries((inboxes ?? []).map((i: { id: string; label: string | null; email_address: string }) => [i.id, i]));
  const rows = (data ?? []).map((ws: Record<string, unknown>) => ({
    id:           ws.id,
    sent_at:      ws.sent_at,
    replied_at:   ws.replied_at,
    subject:      ws.subject,
    to_inbox:     inboxMap[(ws.to_inbox_id as string)] ?? ws.to_inbox,
    from_inbox:   ws.from_inbox,
    workspace_id: workspaceId,
  }));

  return NextResponse.json(rows);
}
