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
import { getStats } from "@/lib/outreach/dashboard-stats";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardChart from "./DashboardChart";
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

export default async function DashboardPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const stats     = await getStats(ctx.workspaceId);
  const workspace = ctx.workspace as { name: string; sends_this_month: number; max_monthly_sends: number; plan_id: string };

  const STAT_CARDS = [
    { label: "Active sequences", value: stats.activeCampaigns.toString(),         icon: Mail01Icon,        href: "/campaigns" },
    { label: "Active inboxes",   value: stats.activeInboxes.toString(),           icon: Inbox01Icon,       href: "/inboxes" },
    { label: "Sent this month",  value: stats.sentThisMonth.toLocaleString(),     icon: ChartBarLineIcon,  href: "/campaigns" },
    { label: "Open rate",        value: `${stats.openRate}%`,                     icon: EyeIcon,           href: "/campaigns" },
    { label: "Replies",          value: stats.replies.toLocaleString(),           icon: Note01Icon,        href: "/crm" },
  ];

  const QUICK_ACTIONS = [
    { label: "New sequence", href: "/campaigns/new", icon: PlusSignIcon,          primary: false },
    { label: "Add inbox",    href: "/inboxes/new",   icon: Inbox01Icon,           primary: false },
    { label: "Find leads",   href: "/discover",      icon: UserSearch01Icon,      primary: false },
    { label: "CRM inbox",    href: "/crm",           icon: CustomerService01Icon, primary: false },
  ];

  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div className="dash-shell" style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Greeting + quick actions */}
        <header className="dash-header">
          <div>
            <h1 className="app-h1">Dashboard</h1>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Welcome back to <span style={{ color: "var(--app-text)" }}>{workspace.name}</span>
            </p>
          </div>
          <div className="dash-quick">
            {QUICK_ACTIONS.map(a => (
              <Link
                key={a.href}
                href={a.href}
                className={`app-btn ${a.primary ? "app-btn-primary" : "app-btn-secondary"} app-btn-sm dash-quick-btn`}
              >
                <HugeiconsIcon icon={a.icon} size={13} strokeWidth={1.5} />
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        </header>

        {/* Stat strip */}
        <div className="dash-stats">
          {STAT_CARDS.map(c => (
            <Link
              key={c.label}
              href={c.href}
              className="app-card app-card-tight app-card-interactive dash-stat"
              style={{
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 96,
              }}
            >
              <div
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "var(--app-text-muted)",
                  flexShrink: 0,
                }}
              >
                <HugeiconsIcon icon={c.icon} size={15} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <p className="dash-stat-label" style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>
                  {c.label}
                </p>
                <p style={{ fontSize: 24, color: "var(--app-text)", fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {c.value}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Chart + recent replies */}
        <div className="dash-split">

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
        /* Desktop defaults */
        .dash-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .dash-quick {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .dash-stats {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .dash-split {
          display: grid;
          grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
          gap: 16px;
        }

        /* Tablet + phone */
        @media (max-width: 1024px) {
          .dash-shell { padding: 20px 16px !important; gap: 18px !important; }
          .dash-header { flex-direction: column; align-items: stretch; gap: 14px; }
          .dash-quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .dash-quick-btn { justify-content: center; }
          .dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dash-stats > *:last-child { grid-column: span 2; }
          .dash-stat { min-height: 108px; }
          .dash-stat-label { white-space: normal; word-break: normal; }
          .dash-split { grid-template-columns: minmax(0, 1fr); }
        }

        /* Small phones */
        @media (max-width: 420px) {
          .dash-stats { grid-template-columns: minmax(0, 1fr); }
          .dash-stats > *:last-child { grid-column: auto; }
        }
        .dash-reply-row:hover { background: var(--app-surface); }
      `}</style>
    </div>
  );
}
