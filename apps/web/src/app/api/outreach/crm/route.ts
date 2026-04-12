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

  let query = db
    .from("outreach_enrollments")
    .select(`
      id,
      crm_status,
      status,
      enrolled_at,
      lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title),
      campaign:outreach_campaigns!campaign_id(id, name),
      latest_send:outreach_sends(id, subject, body, status, sent_at, opened_at, replied_at, to_email)
    `, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .not("status", "eq", "active")
    .order("enrolled_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (status) query = query.eq("crm_status", status);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For each enrollment, get the latest reply
  const threads = await Promise.all((data ?? []).map(async (row: Record<string, unknown>) => {
    const sends = (row.latest_send as { id: string }[]) ?? [];
    const latestSend = sends[0] ?? null;

    const { data: reply } = await db
      .from("outreach_replies")
      .select("id, from_email, from_name, subject, body_text, received_at, ai_category, ai_confidence, is_filtered")
      .eq("enrollment_id", row.id as string)
      .eq("is_filtered", false)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: notes } = await db
      .from("crm_notes")
      .select("id, lead_id, body, created_at")
      .eq("enrollment_id", row.id as string)
      .order("created_at", { ascending: true });

    return {
      enrollment_id: row.id,
      crm_status:    row.crm_status,
      lead:          row.lead,
      campaign:      row.campaign,
      latest_send:   latestSend,
      latest_reply:  reply ?? null,
      replied_at:    (reply as { received_at?: string } | null)?.received_at ?? null,
      notes:         notes ?? [],
    };
  }));

  return NextResponse.json({ threads, total: count ?? 0 });
}
