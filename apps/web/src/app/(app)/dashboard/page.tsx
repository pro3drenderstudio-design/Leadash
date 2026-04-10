import { getWorkspaceContext } from "@/lib/workspace/context";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardChart, { type DailyPoint } from "./DashboardChart";

async function getStats(workspaceId: string) {
  const db = createAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [campaigns, inboxes, sends, replies, chartSends, chartReplies] = await Promise.all([
    db.from("outreach_campaigns").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_sends").select("status")
      .eq("workspace_id", workspaceId).gte("created_at", startOfMonth),
    db.from("outreach_replies").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("received_at", startOfMonth),
    // Chart: last 30 days of sends
    db.from("outreach_sends").select("status, created_at")
      .eq("workspace_id", workspaceId).gte("created_at", thirtyDaysAgo),
    // Chart: last 30 days of replies
    db.from("outreach_replies").select("received_at")
      .eq("workspace_id", workspaceId).gte("received_at", thirtyDaysAgo),
  ]);

  const sentData  = sends.data ?? [];
  const sentCount = sentData.filter((s: { status: string }) => s.status === "sent" || s.status === "opened").length;
  const openedCount = sentData.filter((s: { status: string }) => s.status === "opened").length;
  const openRate  = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;

  // Build 30-day chart data
  const dayMap = new Map<string, DailyPoint>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayMap.set(key, { date: key, sent: 0, opened: 0, replies: 0 });
  }

  for (const s of chartSends.data ?? []) {
    const key = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const point = dayMap.get(key);
    if (!point) continue;
    if (s.status === "sent" || s.status === "opened") point.sent++;
    if (s.status === "opened") point.opened++;
  }
  for (const r of chartReplies.data ?? []) {
    const key = new Date(r.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const point = dayMap.get(key);
    if (point) point.replies++;
  }

  // Trim leading zeros for cleaner chart
  const chartData = [...dayMap.values()];
  const firstNonZero = chartData.findIndex(d => d.sent > 0 || d.opened > 0 || d.replies > 0);
  const trimmed = firstNonZero > 0 ? chartData.slice(firstNonZero) : chartData;

  return {
    activeCampaigns: campaigns.count ?? 0,
    activeInboxes:   inboxes.count ?? 0,
    sentThisMonth:   sentCount,
    openRate,
    replies:         replies.count ?? 0,
    chartData:       trimmed,
  };
}

export default async function DashboardPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const stats = await getStats(ctx.workspaceId);
  const workspace = ctx.workspace as { name: string; sends_this_month: number; max_monthly_sends: number };

  const sendUsagePct = workspace.max_monthly_sends > 0
    ? Math.min(100, Math.round((workspace.sends_this_month / workspace.max_monthly_sends) * 100))
    : 0;

  const cards = [
    { label: "Active Sequences", value: stats.activeCampaigns, color: "text-blue-400",   icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    { label: "Active Inboxes",   value: stats.activeInboxes,   color: "text-emerald-400", icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" },
    { label: "Sent This Month",  value: stats.sentThisMonth.toLocaleString(), color: "text-violet-400", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
    { label: "Open Rate",        value: `${stats.openRate}%`,  color: "text-amber-400",   icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
    { label: "Replies",          value: stats.replies,         color: "text-pink-400",    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">Welcome back to {workspace.name}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--card)] border border-white/8 rounded-xl p-4 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <svg className={`w-4 h-4 ${c.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
              </svg>
            </div>
            <div>
              <p className="text-xs text-white/40 leading-tight">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="bg-[var(--card)] border border-white/8 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold">Email Activity</h2>
            <p className="text-white/40 text-xs mt-0.5">Sends, opens, and replies — last 30 days</p>
          </div>
        </div>
        <DashboardChart data={stats.chartData} />
      </div>

      {/* Monthly quota */}
      <div className="bg-[var(--card)] border border-white/8 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Monthly send quota</h2>
            <p className="text-white/40 text-xs mt-0.5">Resets on the 1st of next month</p>
          </div>
          <span className="text-sm font-semibold text-white/60">
            {workspace.sends_this_month.toLocaleString()}
            <span className="text-white/25"> / {workspace.max_monthly_sends.toLocaleString()}</span>
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${sendUsagePct > 85 ? "bg-red-500" : "bg-[var(--primary)]"}`}
            style={{ width: `${Math.max(sendUsagePct, 1)}%` }}
          />
        </div>
        <p className="text-xs text-white/30 mt-2">{sendUsagePct}% used</p>
      </div>
    </div>
  );
}
