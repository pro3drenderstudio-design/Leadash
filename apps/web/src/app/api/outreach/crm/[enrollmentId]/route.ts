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
      .select("id, subject, body, status, sent_at, opened_at, clicked_at, to_email")
      .eq("enrollment_id", enrollmentId)
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: true }),
    db.from("outreach_replies")
      .select("id, from_email, from_name, subject, body_text, received_at, ai_category, ai_confidence, attachments, is_filtered")
      .eq("enrollment_id", enrollmentId)
      .eq("workspace_id", workspaceId)
      .eq("is_filtered", false)
      .order("received_at", { ascending: true }),
    db.from("crm_notes")
      .select("id, lead_id, body, created_at")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: true }),
  ]);

  const sends = (sendsRes.data ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    type: "send" as const,
    timestamp: (s.sent_at as string) ?? new Date().toISOString(),
  }));

  const replies = (repliesRes.data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    type: "reply" as const,
    timestamp: r.received_at as string,
  }));

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

  const { crm_status } = await req.json();
  const { data, error } = await db
    .from("outreach_enrollments")
    .update({ crm_status })
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
