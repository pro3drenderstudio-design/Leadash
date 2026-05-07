import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

type Row = Record<string, unknown>;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  const { data: campaign } = await db
    .from("outreach_campaigns").select("id")
    .eq("id", campaignId).eq("workspace_id", workspaceId).single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: enrollments }, { data: sends }, { data: seqSteps }] = await Promise.all([
    db.from("outreach_enrollments").select("id,status,crm_status,lead_id").eq("campaign_id", campaignId),
    db.from("outreach_sends").select("id,status,opened_at,clicked_at,sent_at,subject,step_order,lead_id,enrollment_id").eq("campaign_id", campaignId),
    db.from("outreach_sequences").select("step_order,type,subject_template,subject_template_b").eq("campaign_id", campaignId).order("step_order"),
  ]);

  const enr = (enrollments ?? []) as Row[];
  const s   = (sends ?? []) as Row[];
  const steps = (seqSteps ?? []) as Row[];

  // Lead lookup
  const leadIds = [...new Set(s.map(x => x.lead_id as string).filter(Boolean))];
  const { data: leads } = leadIds.length ? await db.from("outreach_leads").select("id,first_name,last_name,email,company").in("id", leadIds) : { data: [] };
  const leadMap: Record<string, Row> = Object.fromEntries(((leads ?? []) as Row[]).map(l => [l.id as string, l]));

  // First reply per enrollment
  const enrollmentIds = [...new Set(s.map(x => x.enrollment_id as string).filter(Boolean))];
  const { data: replies } = enrollmentIds.length
    ? await db.from("outreach_replies").select("enrollment_id,received_at").in("enrollment_id", enrollmentIds).order("received_at")
    : { data: [] };
  const firstReply: Record<string, string> = {};
  for (const r of (replies ?? []) as Row[]) {
    const eid = r.enrollment_id as string;
    if (!firstReply[eid]) firstReply[eid] = r.received_at as string;
  }

  const total_sent         = s.length;
  const total_opened       = s.filter(x => x.opened_at).length;
  const total_clicked      = s.filter(x => x.clicked_at).length;
  const total_replied      = enr.filter(x => x.crm_status === "replied" || x.status === "replied").length;
  const total_bounced      = s.filter(x => x.status === "bounced").length;
  const total_unsubscribed = enr.filter(x => x.status === "unsubscribed").length;
  const total_enrolled     = enr.length;
  const total_completed    = enr.filter(x => x.status === "completed").length;
  const open_rate  = total_sent ? total_opened  / total_sent : 0;
  const reply_rate = total_sent ? total_replied / total_sent : 0;
  const click_rate = total_sent ? total_clicked / total_sent : 0;

  const per_step = steps
    .filter(st => st.type === "email")
    .map(st => {
      const ss = s.filter(x => x.step_order === st.step_order);
      return {
        type: st.type as string,
        subject_template:   (st.subject_template ?? "") as string,
        subject_template_b: st.subject_template_b as string | undefined,
        sent:      ss.length,
        open_rate: ss.length ? ss.filter(x => x.opened_at).length / ss.length : 0,
        reply_rate: 0,
        bounced:   ss.filter(x => x.status === "bounced").length,
      };
    });

  const ab_test = {
    enabled: steps.some(st => st.subject_template_b),
    a: { sent: 0, open_rate: 0, reply_rate: 0 },
    b: { sent: 0, open_rate: 0, reply_rate: 0 },
  };

  // Daily activity
  const dailyMap: Record<string, { sent: number; opened: number; replied: number }> = {};
  for (const send of s) {
    const day = (send.sent_at as string)?.slice(0, 10);
    if (!day) continue;
    if (!dailyMap[day]) dailyMap[day] = { sent: 0, opened: 0, replied: 0 };
    dailyMap[day].sent++;
    if (send.opened_at) dailyMap[day].opened++;
  }
  const daily_activity = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, v]) => ({ date, ...v }));

  // Recent activity
  const recent_activity = s
    .filter(x => x.sent_at)
    .sort((a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime())
    .slice(0, 50)
    .map(x => {
      const lead = leadMap[x.lead_id as string] ?? {};
      return {
        send_id:    x.id as string,
        status:     x.status as string,
        opened_at:  (x.opened_at ?? null) as string | null,
        replied_at: x.enrollment_id ? (firstReply[x.enrollment_id as string] ?? null) : null,
        sent_at:    x.sent_at as string,
        lead_name:  [(lead.first_name as string), (lead.last_name as string)].filter(Boolean).join(" ") || (lead.email as string) || "Unknown",
        lead_email: (lead.email as string) ?? "",
        company:    (lead.company as string) ?? null,
        subject:    (x.subject as string) ?? null,
        step_order: (x.step_order as number) ?? 0,
      };
    });

  // Upcoming queue
  const { data: queueRows } = await db
    .from("outreach_enrollments")
    .select("id,current_step,next_send_at,crm_status,lead_id")
    .eq("campaign_id", campaignId).eq("status", "active")
    .order("next_send_at").limit(50);
  const qRows = (queueRows ?? []) as Row[];
  const qLeadIds = [...new Set(qRows.map(x => x.lead_id as string).filter(Boolean))];
  const { data: qLeads } = qLeadIds.length ? await db.from("outreach_leads").select("id,first_name,last_name,email,company").in("id", qLeadIds) : { data: [] };
  const qLeadMap: Record<string, Row> = Object.fromEntries(((qLeads ?? []) as Row[]).map(l => [l.id as string, l]));
  const upcoming_queue = qRows.map(x => {
    const lead = qLeadMap[x.lead_id as string] ?? {};
    return {
      enrollment_id: x.id as string,
      lead_name:     [(lead.first_name as string), (lead.last_name as string)].filter(Boolean).join(" ") || (lead.email as string) || "Unknown",
      lead_email:    (lead.email as string) ?? "",
      company:       (lead.company as string) ?? null,
      current_step:  (x.current_step as number) ?? 0,
      next_send_at:  (x.next_send_at as string) ?? null,
      crm_status:    (x.crm_status as string) ?? null,
    };
  });

  return NextResponse.json({
    stats: { total_enrolled, total_sent, total_opened, total_clicked, total_replied, total_bounced, total_unsubscribed, open_rate, reply_rate, click_rate },
    funnel: { enrolled: total_enrolled, sent: total_sent, opened: total_opened, replied: total_replied, completed: total_completed, bounced: total_bounced, unsubscribed: total_unsubscribed },
    per_step, ab_test, daily_activity, recent_activity, upcoming_queue,
  });
}
