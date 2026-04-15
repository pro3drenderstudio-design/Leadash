"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  users:       { total: number; newThisWeek: number; newThisMonth: number };
  workspaces:  { total: number };
  campaigns:   { total: number; active: number };
  leads:       { total: number };
  tickets:     { open: number };
  credits:     { purchased: number; consumed: number };
  recentUsers: { id: string; name: string; owner_id: string; plan_id: string; created_at: string; lead_credits_balance: number }[];
  recentTickets: { id: string; subject: string; status: string; priority: string; created_at: string }[];
  signupSparkline: { date: string; count: number }[];
}

function StatCard({ label, value, sub, href, color = "blue" }: {
  label: string; value: string | number; sub?: string; href?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue:   "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
    green:  "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400",
    purple: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
    amber:  "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red:    "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    slate:  "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
  };
  const card = (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 hover:border-slate-300 dark:hover:border-white/20 transition-all">
      <p className="text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className={`mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full inline-block ${colorMap[color]}`}>{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 200, h = 40, pad = 2;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - (d.count / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    high:   "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300",
    low:    "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/50",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[p] ?? map.low}`}>{p}</span>;
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:   "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter:"bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    growth: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-8">
      <div className="h-7 w-40 bg-slate-200 dark:bg-white/10 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );

  if (!stats) return <div className="p-8 text-slate-500">Failed to load stats.</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Workspaces" value={stats.users.total} sub={`+${stats.users.newThisWeek} this week`} href="/admin/workspaces" color="blue" />
        <StatCard label="New This Month"   value={stats.users.newThisMonth} sub="new signups" href="/admin/users" color="green" />
        <StatCard label="Lead Campaigns"   value={stats.campaigns.total} sub={`${stats.campaigns.active} active`} href="/admin/campaigns" color="purple" />
        <StatCard label="Total Leads"      value={stats.leads.total} href="/admin/campaigns" color="slate" />
        <StatCard label="Open Tickets"     value={stats.tickets.open} sub={stats.tickets.open > 0 ? "needs attention" : "all clear"} href="/admin/support" color={stats.tickets.open > 0 ? "red" : "green"} />
        <StatCard label="Credits Sold (mo)" value={stats.credits.purchased} href="/admin/credits" color="amber" />
        <StatCard label="Credits Used (mo)" value={stats.credits.consumed} href="/admin/credits" color="slate" />
        <StatCard label="Credit Balance Net" value={stats.credits.purchased - stats.credits.consumed} color={stats.credits.purchased >= stats.credits.consumed ? "green" : "red"} />
      </div>

      {/* Signups sparkline */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-white/80">New Workspaces — Last 30 Days</p>
            <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">Daily signup count</p>
          </div>
          <div className="text-orange-500 dark:text-orange-400">
            <Sparkline data={stats.signupSparkline} />
          </div>
        </div>
        <div className="flex gap-1 items-end h-16">
          {stats.signupSparkline.map((d, i) => {
            const max = Math.max(...stats.signupSparkline.map(x => x.count), 1);
            const pct = (d.count / max) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col justify-end group relative">
                <div
                  className="bg-orange-400/40 dark:bg-orange-400/30 hover:bg-orange-500/60 dark:hover:bg-orange-400/50 rounded-sm transition-all"
                  style={{ height: `${Math.max(pct, d.count > 0 ? 8 : 2)}%` }}
                />
                {d.count > 0 && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    {d.count} on {d.date.slice(5)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent signups */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-white/80">Recent Workspaces</p>
            <Link href="/admin/workspaces" className="text-xs text-orange-500 hover:text-orange-600">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {stats.recentUsers.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-400">No workspaces yet.</p>
            )}
            {stats.recentUsers.map(w => (
              <Link key={w.id} href={`/admin/workspaces/${w.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(w.name ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">{w.name}</p>
                  <p className="text-xs text-slate-400 dark:text-white/30">{new Date(w.created_at).toLocaleDateString()}</p>
                </div>
                <PlanBadge plan={w.plan_id} />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent tickets */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-white/80">Recent Support Tickets</p>
            <Link href="/admin/support" className="text-xs text-orange-500 hover:text-orange-600">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {stats.recentTickets.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-400">No tickets yet.</p>
            )}
            {stats.recentTickets.map(t => (
              <Link key={t.id} href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">{t.subject || "(no subject)"}</p>
                  <p className="text-xs text-slate-400 dark:text-white/30">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <PriorityBadge p={t.priority} />
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
