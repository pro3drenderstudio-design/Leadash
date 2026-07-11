/**
 * Workspace dashboard stats aggregation.
 *
 * Extracted verbatim from app/(app)/dashboard/page.tsx so it can serve both
 * the web dashboard (server component) and the mobile app's
 * GET /api/mobile/dashboard endpoint. Reads with the admin client — callers
 * are responsible for having verified workspace membership.
 */
import { createAdminClient } from "@/lib/supabase/server";

export interface DailyPoint {
  date:    string;
  sent:    number;
  opened:  number;
  replies: number;
}

export interface RecentThread {
  enrollment_id: string;
  crm_status:    string;
  lead:          { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null;
  campaign:      { name: string } | null;
  latest_reply:  { from_name: string | null; body_text: string | null; received_at: string; ai_category: string | null } | null;
  replied_at:    string | null;
}

export async function getStats(workspaceId: string) {
  const db = createAdminClient();
  const now = new Date();
  const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [campaigns, inboxes, sentThisMonth, openedThisMonth, replies, chartReplies, recentReplies] = await Promise.all([
    db.from("outreach_campaigns").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active")
      .or(`warmup_enabled.eq.false,warmup_ends_at.is.null,warmup_ends_at.lte.${now.toISOString()}`),
    db.from("outreach_sends").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("created_at", startOfMonth)
      .in("status", ["sent", "opened"]),
    db.from("outreach_sends").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("created_at", startOfMonth)
      .eq("status", "opened"),
    db.from("outreach_replies").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("received_at", startOfMonth)
      .not("enrollment_id", "is", null)
      .or("is_warmup.is.null,is_warmup.eq.false"),
    db.from("outreach_replies").select("received_at")
      .eq("workspace_id", workspaceId).gte("received_at", thirtyDaysAgo)
      .not("enrollment_id", "is", null)
      .or("is_warmup.is.null,is_warmup.eq.false"),
    db.from("outreach_replies")
      .select(`
        from_name, body_text, received_at, ai_category,
        enrollment:outreach_enrollments!enrollment_id(
          id, crm_status,
          lead:outreach_leads!lead_id(email, first_name, last_name, company),
          campaign:outreach_campaigns!campaign_id(name)
        )
      `)
      .eq("workspace_id", workspaceId)
      .not("enrollment_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(8),
  ]);

  const sentCount   = sentThisMonth.count   ?? 0;
  const openedCount = openedThisMonth.count ?? 0;
  const openRate    = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;

  // Paginate chart sends — daily cap * 30 days can exceed 1000 rows
  const allChartSends: { status: string; created_at: string }[] = [];
  const CHART_PAGE = 1000;
  let chartFrom = 0;
  while (true) {
    const { data: page } = await db.from("outreach_sends")
      .select("status, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", thirtyDaysAgo)
      .range(chartFrom, chartFrom + CHART_PAGE - 1);
    if (!page?.length) break;
    allChartSends.push(...(page as { status: string; created_at: string }[]));
    if (page.length < CHART_PAGE) break;
    chartFrom += CHART_PAGE;
  }

  const dayMap = new Map<string, DailyPoint>();
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayMap.set(key, { date: key, sent: 0, opened: 0, replies: 0 });
  }
  for (const s of allChartSends) {
    const key   = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const point = dayMap.get(key);
    if (!point) continue;
    if (s.status === "sent" || s.status === "opened") point.sent++;
    if (s.status === "opened") point.opened++;
  }
  for (const r of chartReplies.data ?? []) {
    const key   = new Date(r.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const point = dayMap.get(key);
    if (point) point.replies++;
  }
  const chartData    = [...dayMap.values()];
  const firstNonZero = chartData.findIndex(d => d.sent > 0 || d.opened > 0 || d.replies > 0);
  const trimmed      = firstNonZero > 0 ? chartData.slice(firstNonZero) : chartData;

  type RawReply = {
    from_name: string | null;
    body_text: string | null;
    received_at: string;
    ai_category: string | null;
    enrollment: {
      id: string;
      crm_status: string;
      lead: { email: string; first_name: string | null; last_name: string | null; company: string | null } | null;
      campaign: { name: string } | null;
    } | null;
  };

  const withReplies: RecentThread[] = (recentReplies.data ?? [])
    .filter((r: RawReply) => r.enrollment)
    .map((r: RawReply) => ({
      enrollment_id: r.enrollment!.id,
      crm_status:    r.enrollment!.crm_status ?? "neutral",
      lead:          r.enrollment!.lead ? { ...r.enrollment!.lead, title: null } : null,
      campaign:      r.enrollment!.campaign,
      latest_reply:  { from_name: r.from_name, body_text: r.body_text, received_at: r.received_at, ai_category: r.ai_category },
      replied_at:    r.received_at,
    }));

  return {
    activeCampaigns: campaigns.count ?? 0,
    activeInboxes:   inboxes.count ?? 0,
    sentThisMonth:   sentCount,
    openRate,
    replies:         replies.count ?? 0,
    chartData:       trimmed,
    recentActivity:  withReplies,
  };
}
