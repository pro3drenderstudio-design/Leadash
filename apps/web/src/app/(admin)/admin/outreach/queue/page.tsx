"use client";
import { useEffect, useState, useCallback } from "react";

interface ErrorInbox {
  id: string;
  email_address: string;
  workspace_id: string;
  workspace_name: string;
  status: string;
  last_error: string;
  provider: string | null;
  smtp_host: string | null;
  warmup_enabled: boolean | null;
}

interface FailedSend {
  id: string;
  workspace_id: string;
  workspace_name: string;
  inbox_id: string | null;
  to_email: string;
  status: string;
  created_at: string;
  bounced_at: string | null;
  campaign_id: string | null;
}

interface ErrorGroup {
  pattern: string;
  count: number;
}

interface QueueSummary {
  error_inboxes: number;
  failed_30d: number;
  bounced_30d: number;
  failed_today: number;
  bounced_today: number;
}

interface QueueData {
  summary: QueueSummary;
  error_groups: ErrorGroup[];
  error_inboxes: ErrorInbox[];
  failed_sends: FailedSend[];
}

function Tile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <p className="text-[10px] font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color ?? "text-slate-800 dark:text-white"}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminOutreachQueuePage() {
  const [data, setData]           = useState<QueueData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [clearWorking, setClearWorking]   = useState<string | null>(null);
  const [clearMsg, setClearMsg]           = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const fetchData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    fetch("/api/admin/outreach/queue")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setRefreshing(false); })
      .catch(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function clearInboxError(inboxId: string, resetStatus: boolean) {
    setClearWorking(inboxId);
    setClearMsg(null);
    const res  = await fetch(`/api/admin/outreach/inboxes/${inboxId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: resetStatus ? "reset_status" : "clear_error" }),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    setClearWorking(null);
    setClearMsg({ id: inboxId, ok: !!d.ok, text: d.ok ? (resetStatus ? "Reset to active." : "Error cleared.") : (d.error ?? "Failed") });
    if (d.ok) fetchData(true);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-5 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-slate-200 dark:bg-white/5 rounded-xl" />)}
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Failed Sends &amp; Queue</h1>
          <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">Inbox errors and failed/bounced sends from the past 30 days.</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Tile label="Error Inboxes"   value={s?.error_inboxes  ?? 0} color={s?.error_inboxes  ? "text-red-500" : undefined} />
        <Tile label="Failed Today"    value={s?.failed_today   ?? 0} color={s?.failed_today   ? "text-red-500" : undefined} />
        <Tile label="Bounced Today"   value={s?.bounced_today  ?? 0} color={s?.bounced_today  ? "text-amber-600 dark:text-amber-400" : undefined} />
        <Tile label="Failed 30d"      value={s?.failed_30d     ?? 0} />
        <Tile label="Bounced 30d"     value={s?.bounced_30d    ?? 0} />
      </div>

      {/* Error inbox groups */}
      {(data?.error_inboxes ?? []).length > 0 && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Inbox Errors</h2>
            <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{data?.error_inboxes.length} inboxes with last_error set</p>
          </div>

          {/* Error pattern groups */}
          {(data?.error_groups ?? []).length > 0 && (
            <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex flex-wrap gap-2">
              {(data?.error_groups ?? []).map(g => (
                <button
                  key={g.pattern}
                  onClick={() => setExpandedError(e => e === g.pattern ? null : g.pattern)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${expandedError === g.pattern ? "bg-red-100 dark:bg-red-500/15 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400" : "bg-slate-100 dark:bg-white/8 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/50 hover:border-slate-300 dark:hover:border-white/20"}`}
                >
                  <span className="font-semibold">{g.count}×</span>
                  <span className="max-w-[260px] truncate">{g.pattern}</span>
                </button>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {(data?.error_inboxes ?? [])
              .filter(i => !expandedError || i.last_error.startsWith(expandedError))
              .map(inbox => (
                <div key={inbox.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-mono text-slate-800 dark:text-white/80">{inbox.email_address}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${inbox.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40"}`}>
                          {inbox.status}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-white/30">{inbox.workspace_name}</span>
                      </div>
                      <p className="text-xs text-red-500 mt-1.5 font-mono break-all">{inbox.last_error}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => clearInboxError(inbox.id, false)}
                        disabled={clearWorking === inbox.id}
                        className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 text-slate-600 dark:text-white/50 transition-colors disabled:opacity-50"
                      >
                        {clearWorking === inbox.id ? "…" : "Clear Error"}
                      </button>
                      {inbox.status !== "active" && (
                        <button
                          onClick={() => clearInboxError(inbox.id, true)}
                          disabled={clearWorking === inbox.id}
                          className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-emerald-100 dark:bg-emerald-500/15 hover:bg-emerald-200 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 transition-colors disabled:opacity-50"
                        >
                          Reset Active
                        </button>
                      )}
                    </div>
                  </div>
                  {clearMsg?.id === inbox.id && (
                    <p className={`text-xs font-medium mt-1.5 ${clearMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{clearMsg.text}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Failed sends table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Failed &amp; Bounced Sends</h2>
          <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">Last 200 failures from the past 30 days</p>
        </div>
        {(data?.failed_sends ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/30">No failed sends in the past 30 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10">
                  {["To", "Workspace", "Status", "Date"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {(data?.failed_sends ?? []).map(send => (
                  <tr key={send.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-slate-700 dark:text-white/70 max-w-[200px] truncate">{send.to_email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50 max-w-[160px] truncate">{send.workspace_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${send.status === "failed" ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"}`}>
                        {send.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-white/30 whitespace-nowrap">{new Date(send.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
