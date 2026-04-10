import { getWorkspaceContext } from "@/lib/workspace/context";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardChart, { type DailyPoint } from "./DashboardChart";

interface RecentThread {
  enrollment_id: string;
  crm_status:    string;
  lead:          { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null;
  campaign:      { name: string } | null;
  latest_reply:  { from_name: string | null; body_text: string | null; received_at: string; ai_category: string | null } | null;
  replied_at:    string | null;
}

const CRM_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  neutral:        { label: "Neutral",        cls: "text-white/40 bg-white/5" },
  interested:     { label: "Interested",     cls: "text-emerald-400 bg-emerald-500/10" },
  meeting_booked: { label: "Meeting Booked", cls: "text-blue-400 bg-blue-500/10" },
  won:            { label: "Won",            cls: "text-yellow-400 bg-yellow-500/10" },
  not_interested: { label: "Not Interested", cls: "text-red-400 bg-red-500/10" },
  ooo:            { label: "OOO",            cls: "text-orange-400 bg-orange-500/10" },
  follow_up:      { label: "Follow Up",      cls: "text-violet-400 bg-violet-500/10" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

async function getStats(workspaceId: string) {
  const db = createAdminClient();
  const now = new Date();
  const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [campaigns, inboxes, sends, replies, chartSends, chartReplies, recentEnrollments] = await Promise.all([
    db.from("outreach_campaigns").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_sends").select("status")
      .eq("workspace_id", workspaceId).gte("created_at", startOfMonth),
    db.from("outreach_replies").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("received_at", startOfMonth),
    db.from("outreach_sends").select("status, created_at")
      .eq("workspace_id", workspaceId).gte("created_at", thirtyDaysAgo),
    db.from("outreach_replies").select("received_at")
      .eq("workspace_id", workspaceId).gte("received_at", thirtyDaysAgo),
    // Recent CRM threads with replies for activity panel
    db.from("outreach_enrollments")
      .select(`id, crm_status, lead:outreach_leads!lead_id(email, first_name, last_name, company, title), campaign:outreach_campaigns!campaign_id(name)`)
      .eq("workspace_id", workspaceId)
      .not("status", "eq", "active")
      .order("enrolled_at", { ascending: false })
      .limit(12),
  ]);

  const sentData    = sends.data ?? [];
  const sentCount   = sentData.filter((s: { status: string }) => s.status === "sent" || s.status === "opened").length;
  const openedCount = sentData.filter((s: { status: string }) => s.status === "opened").length;
  const openRate    = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;

  // Build chart
  const dayMap = new Map<string, DailyPoint>();
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayMap.set(key, { date: key, sent: 0, opened: 0, replies: 0 });
  }
  for (const s of chartSends.data ?? []) {
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
  const chartData   = [...dayMap.values()];
  const firstNonZero = chartData.findIndex(d => d.sent > 0 || d.opened > 0 || d.replies > 0);
  const trimmed     = firstNonZero > 0 ? chartData.slice(firstNonZero) : chartData;

  // Fetch latest reply for each recent enrollment
  const rows = recentEnrollments.data ?? [];
  const recentThreads: RecentThread[] = await Promise.all(
    rows.map(async (row: Record<string, unknown>) => {
      const { data: reply } = await db
        .from("outreach_replies")
        .select("from_name, body_text, received_at, ai_category")
        .eq("enrollment_id", row.id as string)
        .eq("is_filtered", false)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        enrollment_id: row.id as string,
        crm_status:    (row.crm_status as string) ?? "neutral",
        lead:          row.lead as RecentThread["lead"],
        campaign:      row.campaign as RecentThread["campaign"],
        latest_reply:  reply ?? null,
        replied_at:    reply?.received_at ?? null,
      };
    }),
  );

  // Keep only threads with actual replies, sorted by most recent
  const withReplies = recentThreads
    .filter(t => t.latest_reply)
    .sort((a, b) => new Date(b.replied_at!).getTime() - new Date(a.replied_at!).getTime())
    .slice(0, 8);

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

export default async function DashboardPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const stats     = await getStats(ctx.workspaceId);
  const workspace = ctx.workspace as { name: string; sends_this_month: number; max_monthly_sends: number; plan_id: string };

  const sendUsagePct = workspace.max_monthly_sends > 0
    ? Math.min(100, Math.round((workspace.sends_this_month / workspace.max_monthly_sends) * 100))
    : 0;

  const cards = [
    { label: "Active Sequences", value: stats.activeCampaigns,             color: "text-blue-400",   glow: "rgba(59,130,246,0.15)",  icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",  href: "/campaigns" },
    { label: "Active Inboxes",   value: stats.activeInboxes,               color: "text-emerald-400", glow: "rgba(16,185,129,0.15)",  icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4", href: "/inboxes" },
    { label: "Sent This Month",  value: stats.sentThisMonth.toLocaleString(), color: "text-violet-400", glow: "rgba(139,92,246,0.15)", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",  href: "/campaigns" },
    { label: "Open Rate",        value: `${stats.openRate}%`,               color: "text-amber-400",   glow: "rgba(245,158,11,0.15)",  icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", href: "/campaigns" },
    { label: "Replies",          value: stats.replies,                       color: "text-pink-400",    glow: "rgba(236,72,153,0.15)",  icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", href: "/crm" },
  ];

  const quickActions = [
    { label: "New Sequence",    href: "/campaigns/new",      icon: "M12 4v16m8-8H4",                  color: "text-blue-400",   bg: "bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/20" },
    { label: "Add Inbox",       href: "/inboxes/new",        icon: "M12 4v16m8-8H4",                  color: "text-emerald-400", bg: "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20" },
    { label: "Lead Campaign",   href: "/lead-campaigns",     icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z", color: "text-amber-400", bg: "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/20" },
    { label: "CRM Inbox",       href: "/crm",                icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", color: "text-pink-400", bg: "bg-pink-500/10 hover:bg-pink-500/15 border-pink-500/20" },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">

      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-white/35 text-sm mt-0.5">
            Welcome back to <span className="text-white/55">{workspace.name}</span>
          </p>
        </div>
        {/* Quick actions */}
        <div className="hidden lg:flex items-center gap-2">
          {quickActions.map(a => (
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${a.color} ${a.bg}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
              </svg>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(c => (
          <Link
            key={c.label}
            href={c.href}
            className="group relative rounded-xl p-4 space-y-3 overflow-hidden transition-all hover:scale-[1.02]"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${c.glow}, 0 8px 32px ${c.glow}`)}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "")}
          >
            {/* Glow blob */}
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl"
              style={{ background: c.glow }} />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center relative" style={{ background: "rgba(255,255,255,0.05)" }}>
              <svg className={`w-4 h-4 ${c.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
              </svg>
            </div>
            <div>
              <p className="text-xs text-white/35 leading-tight">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main body: chart + activity side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Left: chart + quota */}
        <div className="xl:col-span-3 space-y-5">

          {/* Activity chart */}
          <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Email Activity</h2>
                <p className="text-white/35 text-xs mt-0.5">Sends, opens &amp; replies — last 30 days</p>
              </div>
              <Link href="/campaigns" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                View sequences →
              </Link>
            </div>
            <DashboardChart data={stats.chartData} />
          </div>

          {/* Monthly quota */}
          <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Monthly Send Quota</h2>
                <p className="text-white/35 text-xs mt-0.5">Resets on the 1st of each month</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white">{workspace.sends_this_month.toLocaleString()}</span>
                <span className="text-white/25 text-sm"> / {workspace.max_monthly_sends.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(sendUsagePct, 1)}%`,
                  background: sendUsagePct > 85
                    ? "linear-gradient(90deg, #ef4444, #f87171)"
                    : "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-white/25">{sendUsagePct}% used</p>
              <p className="text-xs text-white/25">{(workspace.max_monthly_sends - workspace.sends_this_month).toLocaleString()} remaining</p>
            </div>
          </div>
        </div>

        {/* Right: Recent Activity */}
        <div className="xl:col-span-2">
          <div className="rounded-xl overflow-hidden h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h2 className="text-sm font-semibold text-white">Recent Replies</h2>
                <p className="text-white/35 text-xs mt-0.5">Latest CRM conversations</p>
              </div>
              <Link href="/crm" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                Open CRM →
              </Link>
            </div>

            {stats.recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-white/25 text-sm">No replies yet</p>
                <p className="text-white/15 text-xs mt-1">Replies will appear here once prospects respond</p>
              </div>
            ) : (
              <div className="divide-y" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
                {stats.recentActivity.map(t => {
                  const lead    = t.lead;
                  const name    = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email.split("@")[0] : "Unknown";
                  const initials = name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                  const status  = CRM_STATUS_STYLE[t.crm_status] ?? CRM_STATUS_STYLE.neutral;
                  const preview = t.latest_reply?.body_text?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";

                  return (
                    <Link
                      key={t.enrollment_id}
                      href="/crm"
                      className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/4 transition-colors group"
                      style={{ borderColor: "rgba(255,255,255,0.05)" }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white/80 flex-shrink-0 mt-0.5"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                      >
                        {initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">{name}</p>
                          <span className="text-[10px] text-white/25 flex-shrink-0">{t.replied_at ? timeAgo(t.replied_at) : ""}</span>
                        </div>
                        {lead?.company && (
                          <p className="text-xs text-white/30 truncate">{lead.company}</p>
                        )}
                        {preview && (
                          <p className="text-xs text-white/40 mt-1 leading-relaxed line-clamp-2">{preview}{preview.length >= 80 ? "…" : ""}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${status.cls}`}>
                            {status.label}
                          </span>
                          {t.campaign && (
                            <span className="text-[10px] text-white/20 truncate">{t.campaign.name}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
