/**
 * Dashboard — restyled to v2-app.
 *
 * Server-fetched stats and recent-replies stream preserved exactly. The
 * data layer (getStats) reads the same rows in the same order; only the
 * presentation switched to v2-app primitives (Card, Badge, Icon).
 *
 * Layout intent:
 *   - Header row with workspace greeting + quick-action chips.
 *   - 5-card stat strip (active sequences, inboxes, sent, open rate, replies).
 *   - 3/2 split: 30-day chart on the left, recent replies queue on the right.
 *
 * Existing chart component (DashboardChart) is kept as-is — it has its own
 * deliberate colour ramp tuned for the data, which we don't want to lose
 * by reskinning at this layer.
 */

import { getWorkspaceContext } from "@/lib/workspace/context";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardChart, { type DailyPoint } from "./DashboardChart";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mail01Icon,
  Inbox01Icon,
  ChartBarLineIcon,
  EyeIcon,
  Note01Icon,
  PlusSignIcon,
  UserSearch01Icon,
  CustomerService01Icon,
  ArrowRight01Icon,
} from "@/v2-app/icons";
import "@/v2-app/v2-app.css";

interface RecentThread {
  enrollment_id: string;
  crm_status:    string;
  lead:          { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null;
  campaign:      { name: string } | null;
  latest_reply:  { from_name: string | null; body_text: string | null; received_at: string; ai_category: string | null } | null;
  replied_at:    string | null;
}

const CRM_STATUS_TONE: Record<string, { label: string; tone: "default" | "success" | "warning" | "danger" | "accent" | "info" }> = {
  neutral:        { label: "Neutral",        tone: "default" },
  interested:     { label: "Interested",     tone: "success" },
  meeting_booked: { label: "Meeting booked", tone: "accent"  },
  won:            { label: "Won",            tone: "warning" },
  not_interested: { label: "Not interested", tone: "danger"  },
  ooo:            { label: "OOO",            tone: "warning" },
  follow_up:      { label: "Follow up",      tone: "info"    },
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
      .not("enrollment_id", "is", null),
    db.from("outreach_replies").select("received_at")
      .eq("workspace_id", workspaceId).gte("received_at", thirtyDaysAgo)
      .not("enrollment_id", "is", null),
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

export default async function DashboardPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const [stats, sb] = await Promise.all([getStats(ctx.workspaceId), createClient()]);
  const { data: { user } } = await sb.auth.getUser();
  const workspace = ctx.workspace as { name: string; sends_this_month: number; max_monthly_sends: number; plan_id: string };

  const meta       = (user?.user_metadata ?? {}) as { first_name?: string; name?: string; full_name?: string };
  const firstName  = meta.first_name
    ?? (meta.name  ?? meta.full_name ?? "")?.split(" ")[0]
    ?? user?.email?.split("@")[0]
    ?? "there";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const STAT_CARDS = [
    { label: "Active sequences", value: stats.activeCampaigns.toString(),         icon: Mail01Icon,        href: "/campaigns" },
    { label: "Active inboxes",   value: stats.activeInboxes.toString(),           icon: Inbox01Icon,       href: "/inboxes" },
    { label: "Sent this month",  value: stats.sentThisMonth.toLocaleString(),     icon: ChartBarLineIcon,  href: "/campaigns" },
    { label: "Open rate",        value: `${stats.openRate}%`,                     icon: EyeIcon,           href: "/campaigns" },
    { label: "Replies",          value: stats.replies.toLocaleString(),           icon: Note01Icon,        href: "/crm" },
  ];

  const QUICK_ACTIONS = [
    { label: "New sequence", href: "/campaigns/new", icon: PlusSignIcon,          primary: true  },
    { label: "Add inbox",    href: "/inboxes/new",   icon: Inbox01Icon,           primary: false },
    { label: "Find leads",   href: "/discover",      icon: UserSearch01Icon,      primary: false },
    { label: "CRM inbox",    href: "/crm",           icon: CustomerService01Icon, primary: false },
  ];

  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div className="dash-shell" style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Greeting */}
        <header>
          <h1 className="app-h1" style={{ letterSpacing: "-0.02em" }}>
            {greeting}, {firstName}
          </h1>
          <p style={{ color: "var(--app-text-muted)", fontSize: 14, marginTop: 6 }}>
            Here&rsquo;s how <span style={{ color: "var(--app-text)", fontWeight: 500 }}>{workspace.name}</span> is performing today.
          </p>
        </header>

        {/* Quick actions */}
        <div className="dash-quick" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {QUICK_ACTIONS.map(a => (
            <Link
              key={a.href}
              href={a.href}
              className={`app-btn ${a.primary ? "app-btn-primary" : "app-btn-secondary"}`}
              style={{ justifyContent: "center", padding: "12px 14px", fontSize: 14 }}
            >
              <HugeiconsIcon icon={a.icon} size={15} strokeWidth={1.8} />
              <span>{a.label}</span>
            </Link>
          ))}
        </div>

        {/* Stat strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
          }}
          className="dash-stats"
        >
          {STAT_CARDS.map(c => (
            <Link
              key={c.label}
              href={c.href}
              className="app-card app-card-interactive"
              style={{
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                padding: 20,
                minHeight: 132,
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "var(--app-text-muted)",
                  flexShrink: 0,
                }}
              >
                <HugeiconsIcon icon={c.icon} size={16} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <p style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
                  {c.label}
                </p>
                <p style={{ fontSize: 32, color: "var(--app-text)", fontWeight: 500, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {c.value}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Chart + recent replies */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16 }} className="dash-split">

          {/* Chart */}
          <div className="app-card" style={{ padding: 20 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="app-h3">Email activity</h2>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>
                  Sends, opens &amp; replies — last 30 days
                </p>
              </div>
              <Link
                href="/campaigns"
                style={{ fontSize: 12, color: "var(--app-text-quiet)", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap" }}
              >
                View sequences <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.6} />
              </Link>
            </header>
            <DashboardChart data={stats.chartData} />
          </div>

          {/* Recent replies */}
          <div className="app-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
            <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="app-h3">Recent replies</h2>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>Latest CRM threads</p>
              </div>
              <Link
                href="/crm"
                style={{ fontSize: 12, color: "var(--app-text-quiet)", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap" }}
              >
                Open CRM <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.6} />
              </Link>
            </header>

            {stats.recentActivity.length === 0 ? (
              <div className="app-empty">
                <div className="app-empty-icon">
                  <HugeiconsIcon icon={Note01Icon} size={26} strokeWidth={1.4} />
                </div>
                <p className="app-empty-title">No replies yet</p>
                <p className="app-empty-body">Replies will show up here the moment prospects respond.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {stats.recentActivity.map((t, i) => {
                  const lead     = t.lead;
                  const fullName = lead
                    ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email.split("@")[0]
                    : "Unknown";
                  const initials = fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                  const status   = CRM_STATUS_TONE[t.crm_status] ?? CRM_STATUS_TONE.neutral;
                  const preview  = t.latest_reply?.body_text?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";

                  return (
                    <Link
                      key={t.enrollment_id}
                      href={`/crm?thread=${t.enrollment_id}`}
                      style={{
                        padding: "14px 20px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        borderTop: i === 0 ? "none" : "1px solid var(--app-border)",
                        textDecoration: "none",
                        transition: "background var(--app-dur-fast) var(--app-ease)",
                      }}
                      className="dash-reply-row"
                    >
                      <div
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: "var(--app-surface-strong)",
                          border: "1px solid var(--app-border)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: "var(--app-text)", fontWeight: 500, fontSize: 12, letterSpacing: "-0.01em",
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "var(--app-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fullName}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--app-text-quiet)", flexShrink: 0 }}>
                            {t.replied_at ? timeAgo(t.replied_at) : ""}
                          </span>
                        </div>
                        {lead?.company && (
                          <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 1 }}>{lead.company}</p>
                        )}
                        {preview && (
                          <p style={{ fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.45, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {preview}{preview.length >= 80 ? "…" : ""}
                          </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                          <span className={`app-badge app-badge-${status.tone}`}>{status.label}</span>
                          {t.campaign && (
                            <span style={{ fontSize: 10, color: "var(--app-text-quiet)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.campaign.name}
                            </span>
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

      <style>{`
        @media (max-width: 1024px) {
          .dash-shell { padding: 20px 16px; gap: 20px; }
          .dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dash-stats > *:last-child { grid-column: span 2; }
          .dash-quick { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .dash-split { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 420px) {
          .dash-stats > *:last-child { grid-column: auto; }
        }
        .dash-reply-row:hover { background: var(--app-surface); }
      `}</style>
    </div>
  );
}
