import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/outreach/crm/[enrollmentId]
// Returns the full conversation: all sends + replies merged chronologically, plus notes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { enrollmentId } = await params;

  const [sendsRes, repliesRes, notesRes] = await Promise.all([
    db.from("outreach_sends")
      .select("id, subject, body, status, sent_at, opened_at, clicked_at, bounced_at, to_email, inbox:outreach_inboxes!inbox_id(email_address, label)")
      .eq("enrollment_id", enrollmentId)
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: true }),
    db.from("outreach_replies")
      .select("id, from_email, from_name, subject, body_text, received_at, ai_category, ai_confidence, attachments, is_filtered, inbox:outreach_inboxes!inbox_id(email_address, label)")
      .eq("enrollment_id", enrollmentId)
      .eq("workspace_id", workspaceId)
      .not("body_text", "is", null)
      // intentionally no is_filtered filter — OOO/auto-replies must show in the conversation thread
      .order("received_at", { ascending: true }),
    db.from("crm_notes")
      .select("id, lead_id, body, created_at")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: true }),
  ]);

  type InboxSnippet = { email_address?: string; label?: string } | null;

  const sends = (sendsRes.data ?? []).map((s: Record<string, unknown>) => {
    const inbox = s.inbox as InboxSnippet;
    return {
      ...s,
      type: "send" as const,
      timestamp: (s.sent_at as string) ?? new Date().toISOString(),
      inbox_email: inbox?.email_address ?? null,
      inbox_label: inbox?.label ?? null,
    };
  });

  const replies = (repliesRes.data ?? []).map((r: Record<string, unknown>) => {
    const inbox = r.inbox as InboxSnippet;
    return {
      ...r,
      type: "reply" as const,
      timestamp: r.received_at as string,
      inbox_email: inbox?.email_address ?? null,
      inbox_label: inbox?.label ?? null,
    };
  });

  const messages = [...sends, ...replies].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return NextResponse.json({ messages, notes: notesRes.data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { enrollmentId } = await params;

  const body = await req.json() as { crm_status?: string; is_starred?: boolean; remind_at?: string | null; scheduled_reply_at?: string | null; scheduled_reply_body?: string | null };
  const patch: Record<string, unknown> = {};
  if (body.crm_status          !== undefined) patch.crm_status          = body.crm_status;
  if (body.is_starred          !== undefined) patch.is_starred          = body.is_starred;
  if (body.remind_at           !== undefined) patch.remind_at           = body.remind_at;
  if (body.scheduled_reply_at  !== undefined) patch.scheduled_reply_at  = body.scheduled_reply_at;
  if (body.scheduled_reply_body !== undefined) patch.scheduled_reply_body = body.scheduled_reply_body;

  const { data, error } = await db
    .from("outreach_enrollments")
    .update(patch)
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
