import { getWorkspaceContext } from "@/lib/workspace/context";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function getStats(workspaceId: string) {
  const db = createAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [campaigns, inboxes, sends, replies] = await Promise.all([
    db.from("outreach_campaigns").select("id, status", { count: "exact", head: false })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_sends").select("id, status", { count: "exact", head: false })
      .eq("workspace_id", workspaceId).gte("created_at", startOfMonth),
    db.from("outreach_replies").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("received_at", startOfMonth),
  ]);

  const sentCount   = sends.data?.filter((s: { status: string }) => s.status === "sent" || s.status === "opened").length ?? 0;
  const openedCount = sends.data?.filter((s: { status: string }) => s.status === "opened").length ?? 0;
  const openRate    = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;

  return {
    activeCampaigns: campaigns.count ?? 0,
    activeInboxes:   inboxes.count ?? 0,
    sentThisMonth:   sentCount,
    openRate,
    replies:         replies.count ?? 0,
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
    { label: "Active Campaigns", value: stats.activeCampaigns, color: "text-blue-400" },
    { label: "Active Inboxes",   value: stats.activeInboxes,   color: "text-green-400" },
    { label: "Sent This Month",  value: stats.sentThisMonth,   color: "text-purple-400" },
    { label: "Open Rate",        value: `${stats.openRate}%`,  color: "text-yellow-400" },
    { label: "Replies",          value: stats.replies,         color: "text-pink-400" },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Welcome back to {workspace.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-gray-900 border border-white/8 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly quota */}
      <div className="bg-gray-900 border border-white/8 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white">Monthly send quota</h2>
          <span className="text-sm text-gray-400">{workspace.sends_this_month.toLocaleString()} / {workspace.max_monthly_sends.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${sendUsagePct > 85 ? "bg-red-500" : "bg-blue-500"}`}
            style={{ width: `${sendUsagePct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">{sendUsagePct}% used — resets on the 1st of next month</p>
      </div>
    </div>
  );
}
