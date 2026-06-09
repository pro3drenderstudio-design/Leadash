import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const url    = new URL(req.url);
  const status = url.searchParams.get("status");
  const page   = parseInt(url.searchParams.get("page") ?? "0");
  const limit  = parseInt(url.searchParams.get("limit") ?? "50");

  // Step 1: Find enrollment IDs that have at least one actual reply, sorted by most recent reply
  const { data: replyRows } = await db
    .from("outreach_replies")
    .select("enrollment_id")
    .eq("workspace_id", workspaceId)
    .not("enrollment_id", "is", null)
    .not("body_text", "is", null)
    .order("received_at", { ascending: false })
    .limit(500);

  // Deduped — first occurrence is the most recent reply per enrollment
  const replyEnrollmentIds = [...new Set((replyRows ?? []).map((r: { enrollment_id: string }) => r.enrollment_id))];

  // Step 2: Find enrollment IDs with non-neutral CRM status (may have no reply yet)
  const { data: managedRows } = await db
    .from("outreach_enrollments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .neq("crm_status", "neutral");

  const managedIds = (managedRows ?? []).map((r: { id: string }) => r.id);

  // replied enrollments first (sorted by reply time), then managed-only ones
  const repliedSet = new Set(replyEnrollmentIds);
  const managedOnlyIds = managedIds.filter((id: string) => !repliedSet.has(id));
  const allIds = [...replyEnrollmentIds, ...managedOnlyIds];

  if (allIds.length === 0) {
    return NextResponse.json({ threads: [], total: 0 });
  }

  // Paginate directly from allIds (preserves reply-time order)
  const pageIds = allIds.slice(page * limit, page * limit + limit);
  if (pageIds.length === 0) {
    return NextResponse.json({ threads: [], total: allIds.length });
  }

  let query = db
    .from("outreach_enrollments")
    .select(`
      id,
      crm_status,
      crm_labels,
      status,
      is_starred,
      remind_at,
      scheduled_reply_at,
      scheduled_reply_body,
      enrolled_at,
      lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title),
      campaign:outreach_campaigns!campaign_id(id, name),
      latest_send:outreach_sends(id, subject, body, status, sent_at, opened_at, replied_at, to_email)
    `)
    .eq("workspace_id", workspaceId)
    .in("id", pageIds);

  if (status) query = query.eq("crm_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For each enrollment, get the latest reply
  const threads = await Promise.all((data ?? []).map(async (row: Record<string, unknown>) => {
    const sends = (row.latest_send as { id: string }[]) ?? [];
    const latestSend = sends[0] ?? null;

    const { data: reply } = await db
      .from("outreach_replies")
      .select("id, from_email, from_name, subject, body_text, received_at, ai_category, ai_confidence, is_filtered")
      .eq("enrollment_id", row.id as string)
      .not("body_text", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: notes } = await db
      .from("crm_notes")
      .select("id, lead_id, body, created_at")
      .eq("enrollment_id", row.id as string)
      .order("created_at", { ascending: true });

    return {
      enrollment_id:        row.id,
      crm_status:           row.crm_status,
      crm_labels:           (row.crm_labels as string[] | null) ?? [],
      is_starred:           row.is_starred ?? false,
      remind_at:            row.remind_at ?? null,
      scheduled_reply_at:   row.scheduled_reply_at ?? null,
      scheduled_reply_body: row.scheduled_reply_body ?? null,
      enrolled_at:          row.enrolled_at as string,
      lead:                 row.lead,
      campaign:             row.campaign,
      latest_send:          latestSend,
      latest_reply:         reply ?? null,
      replied_at:           (reply as { received_at?: string } | null)?.received_at ?? null,
      notes:                notes ?? [],
    };
  }));

  // Sort by most recent activity: reply time → last send time → enrollment time
  threads.sort((a, b) => {
    const aTime = a.replied_at ?? (a.latest_send as Record<string, string> | null)?.sent_at ?? a.enrolled_at;
    const bTime = b.replied_at ?? (b.latest_send as Record<string, string> | null)?.sent_at ?? b.enrolled_at;
    return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
  });

  return NextResponse.json({ threads, total: allIds.length });
}
