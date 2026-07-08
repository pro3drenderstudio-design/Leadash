"use client";
import { useEffect, useState, useCallback } from "react";

interface WarmupSummary {
  total_warmup_inboxes: number;
  error_inboxes: number;
  sends_today: number;
  sends_7d: number;
  replies_7d: number;
  rescued_7d: number;
  reply_rate: number;
}

interface WarmupWorkspace {
  workspace_id: string;
  workspace_name: string;
  inbox_count: number;
  error_count: number;
  sends_today: number;
  sends_7d: number;
  replies_7d: number;
  last_send: string | null;
}

interface WarmupActivity {
  id: string;
  from_inbox_id: string;
  to_inbox_id: string;
  subject: string | null;
  sent_at: string;
  replied_at: string | null;
  rescued_from_spam: boolean;
}

interface WarmupData {
  summary: WarmupSummary;
  by_workspace: WarmupWorkspace[];
  recent_activity: WarmupActivity[];
}

function Tile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <p className="text-[10px] font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color ?? "text-slate-800 dark:text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminOutreachWarmupPage() {
  const [data, setData]       = useState<WarmupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    fetch("/api/admin/outreach/warmup")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setRefreshing(false); })
      .catch(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-5 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => <div key={i} className="h-24 bg-slate-200 dark:bg-white/5 rounded-xl" />)}
        </div>
        <div className="h-64 bg-slate-200 dark:bg-white/5 rounded-xl" />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Warmup Pool</h1>
          <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">Platform-wide warmup health — all warmup-enabled user inboxes.</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 transition-colors disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        <Tile label="Warmup Inboxes" value={s?.total_warmup_inboxes ?? 0} />
        <Tile label="Error Inboxes"  value={s?.error_inboxes ?? 0} color={s?.error_inboxes ? "text-red-500" : undefined} />
        <Tile label="Sends Today"    value={s?.sends_today ?? 0} color="text-blue-600 dark:text-blue-400" />
        <Tile label="Sends 7d"       value={(s?.sends_7d ?? 0).toLocaleString()} />
        <Tile label="Replies 7d"     value={(s?.replies_7d ?? 0).toLocaleString()} />
        <Tile label="Reply Rate"     value={`${s?.reply_rate ?? 0}%`} color={((s?.reply_rate ?? 0) >= 30) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"} />
        <Tile label="Rescued Spam 7d" value={s?.rescued_7d ?? 0} />
      </div>

      {/* Per-workspace table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">By Workspace</h2>
          <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{(data?.by_workspace ?? []).length} workspaces with warmup-enabled inboxes</p>
        </div>
        {(data?.by_workspace ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/30">No warmup-enabled inboxes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10">
                  {["Workspace", "Warmup Inboxes", "Errors", "Sends Today", "Sends 7d", "Replies 7d", "Last Send"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {(data?.by_workspace ?? []).map(ws => (
                  <tr key={ws.workspace_id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-white/80 max-w-[180px] truncate">{ws.workspace_name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/25 font-mono mt-0.5">{ws.workspace_id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-white/70 font-semibold">{ws.inbox_count}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {ws.error_count > 0
                        ? <span className="font-semibold text-red-500">{ws.error_count}</span>
                        : <span className="text-slate-300 dark:text-white/20">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-blue-600 dark:text-blue-400 font-semibold">{ws.sends_today}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-white/60">{ws.sends_7d.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40">{ws.replies_7d.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-white/30 whitespace-nowrap">
                      {ws.last_send ? new Date(ws.last_send).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Recent Activity</h2>
          <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">Last 30 warmup sends from the past 7 days</p>
        </div>
        {(data?.recent_activity ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/30">No warmup sends in the past 7 days.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {(data?.recent_activity ?? []).map(a => (
              <div key={a.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-600 dark:text-white/60 truncate">{a.subject ?? "(no subject)"}</p>
                  <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 font-mono">
                    {a.from_inbox_id.slice(0, 8)}… → {a.to_inbox_id.slice(0, 8)}…
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.replied_at && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Replied</span>
                  )}
                  {a.rescued_from_spam && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">Rescued</span>
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-white/30 whitespace-nowrap">
                    {new Date(a.sent_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
