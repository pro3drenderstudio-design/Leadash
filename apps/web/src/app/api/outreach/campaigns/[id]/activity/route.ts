import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  const { data: campaign } = await db
    .from("outreach_campaigns").select("id")
    .eq("id", campaignId).eq("workspace_id", workspaceId).single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p      = new URL(req.url).searchParams;
  const page   = Math.max(1, parseInt(p.get("page")  || "1"));
  const limit  = Math.min(100, Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT))));
  const status = p.get("status") || "all";
  const offset = (page - 1) * limit;

  // For "replied" filter, resolve replied enrollment_ids first
  let repliedEnrollmentIds: string[] | null = null;
  if (status === "replied") {
    const { data: enrollmentRows } = await db
      .from("outreach_enrollments").select("id").eq("campaign_id", campaignId);
    const eids = (enrollmentRows ?? []).map((r: { id: string }) => r.id);
    if (!eids.length) return NextResponse.json({ rows: [], total: 0, page, limit });
    const { data: replyRows } = await db
      .from("outreach_replies").select("enrollment_id").in("enrollment_id", eids);
    repliedEnrollmentIds = [...new Set((replyRows ?? []).map((r: { enrollment_id: string }) => r.enrollment_id))];
    if (!repliedEnrollmentIds.length) return NextResponse.json({ rows: [], total: 0, page, limit });
  }

  // Count query
  let countQ = db.from("outreach_sends")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .not("sent_at", "is", null);
  if (status === "bounced") countQ = countQ.eq("status", "bounced");
  else if (status === "opened") countQ = countQ.not("opened_at", "is", null);
  else if (status === "sent") countQ = countQ.in("status", ["sent", "queued"]).is("opened_at", null);
  else if (status === "replied" && repliedEnrollmentIds) countQ = countQ.in("enrollment_id", repliedEnrollmentIds);

  // Data query
  let dataQ = db.from("outreach_sends")
    .select("id,status,opened_at,clicked_at,sent_at,subject,step_order,lead_id,enrollment_id")
    .eq("campaign_id", campaignId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status === "bounced") dataQ = dataQ.eq("status", "bounced");
  else if (status === "opened") dataQ = dataQ.not("opened_at", "is", null);
  else if (status === "sent") dataQ = dataQ.in("status", ["sent", "queued"]).is("opened_at", null);
  else if (status === "replied" && repliedEnrollmentIds) dataQ = dataQ.in("enrollment_id", repliedEnrollmentIds);

  const [{ count: total }, { data: sends }] = await Promise.all([countQ, dataQ]);

  type Row = Record<string, unknown>;
  const rows = (sends ?? []) as Row[];

  // Batch-load leads
  const leadIds = [...new Set(rows.map(r => r.lead_id as string).filter(Boolean))];
  const { data: leads } = leadIds.length
    ? await db.from("outreach_leads").select("id,first_name,last_name,email,company").in("id", leadIds)
    : { data: [] };
  const leadMap: Record<string, Row> = Object.fromEntries(((leads ?? []) as Row[]).map(l => [l.id as string, l]));

  // Batch-load first replies per enrollment
  const enrollmentIds = [...new Set(rows.map(r => r.enrollment_id as string).filter(Boolean))];
  const { data: replyRows } = enrollmentIds.length
    ? await db.from("outreach_replies").select("enrollment_id,received_at").in("enrollment_id", enrollmentIds).order("received_at")
    : { data: [] };
  const firstReply: Record<string, string> = {};
  for (const r of (replyRows ?? []) as Row[]) {
    const eid = r.enrollment_id as string;
    if (!firstReply[eid]) firstReply[eid] = r.received_at as string;
  }

  const result = rows.map(r => {
    const lead = leadMap[r.lead_id as string] ?? {};
    return {
      send_id:    r.id as string,
      status:     r.status as string,
      opened_at:  (r.opened_at  ?? null) as string | null,
      replied_at: r.enrollment_id ? (firstReply[r.enrollment_id as string] ?? null) : null,
      sent_at:    r.sent_at as string,
      step_order: (r.step_order as number) ?? 0,
      subject:    (r.subject as string) ?? null,
      lead_name:  [(lead.first_name as string), (lead.last_name as string)].filter(Boolean).join(" ") || (lead.email as string) || "Unknown",
      lead_email: (lead.email as string) ?? "",
      company:    (lead.company as string) ?? null,
    };
  });

  return NextResponse.json({ rows: result, total: total ?? 0, page, limit });
}
