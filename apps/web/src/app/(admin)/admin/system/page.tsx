"use client";
import { useEffect, useState, useCallback } from "react";

interface QueueStat {
  name: string;
  label: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  error?: boolean;
}

interface FailedJob {
  queue: string;
  name: string;
  failedReason: string;
  timestamp: number;
}

interface SystemData {
  redis:      { connected: boolean };
  queues:     QueueStat[];
  failedJobs: FailedJob[];
  supabase:   { connected: boolean };
  uptime:     number;
  nodeVersion:string;
  memoryMb:   number;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
      {ok ? "Online" : "Offline"}
    </span>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function QueueCard({ q }: { q: QueueStat }) {
  const hasIssues = q.failed > 0 || q.error;
  return (
    <div className={`bg-white dark:bg-white/5 border rounded-xl p-4 ${hasIssues ? "border-red-200 dark:border-red-500/30" : "border-slate-200 dark:border-white/10"}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-white/80">{q.label}</p>
        {q.error
          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">Error</span>
          : q.active > 0
          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />Active
            </span>
          : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-white/30">Idle</span>
        }
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-4">
        {[
          { label: "Waiting",   value: q.waiting,   color: "text-amber-600 dark:text-amber-400" },
          { label: "Active",    value: q.active,    color: "text-blue-600 dark:text-blue-400" },
          { label: "Completed", value: q.completed, color: "text-green-600 dark:text-green-400" },
          { label: "Failed",    value: q.failed,    color: q.failed > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-white/30" },
          { label: "Delayed",   value: q.delayed,   color: "text-slate-500 dark:text-white/50" },
        ].map(s => (
          <div key={s.label}>
            <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{q.error ? "—" : s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [data, setData]       = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const fetch_ = useCallback((showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    fetch("/api/admin/system")
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLastRefresh(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(() => fetch_(), 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetch_]);

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-40 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400">Failed to load system data.</div>
    );
  }

  const totalActive  = data.queues.reduce((s, q) => s + q.active,  0);
  const totalWaiting = data.queues.reduce((s, q) => s + q.waiting, 0);
  const totalFailed  = data.queues.reduce((s, q) => s + q.failed,  0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Health</h1>
          {lastRefresh && (
            <p className="text-sm text-slate-400 dark:text-white/30 mt-0.5">
              Last refreshed {lastRefresh.toLocaleTimeString()} · auto-updates every 30s
            </p>
          )}
        </div>
        <button
          onClick={() => fetch_(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-all disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Service status row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wide mb-2">Redis</p>
          <StatusDot ok={data.redis.connected} />
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wide mb-2">Supabase</p>
          <StatusDot ok={data.supabase.connected} />
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wide mb-2">Uptime</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-white/80">{formatUptime(data.uptime)}</p>
          <p className="text-xs text-slate-400 dark:text-white/30">Node {data.nodeVersion}</p>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wide mb-2">Memory</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-white/80">{data.memoryMb} MB</p>
          <p className="text-xs text-slate-400 dark:text-white/30">Heap used</p>
        </div>
      </div>

      {/* Queue summary bar */}
      <div className="flex gap-4 flex-wrap">
        {[
          { label: `${totalActive} Active`,  color: totalActive > 0  ? "text-blue-600 dark:text-blue-400"  : "text-slate-400 dark:text-white/30" },
          { label: `${totalWaiting} Waiting`, color: totalWaiting > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30" },
          { label: `${totalFailed} Failed`,   color: totalFailed > 0  ? "text-red-600 dark:text-red-400"    : "text-slate-400 dark:text-white/30" },
        ].map(s => (
          <span key={s.label} className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
        ))}
      </div>

      {/* Queue cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-3">Queues</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.queues.map(q => <QueueCard key={q.name} q={q} />)}
        </div>
      </div>

      {/* Failed jobs */}
      {data.failedJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-3">
            Recent Failed Jobs
          </h2>
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Queue</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.failedJobs.map((job, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                        {job.queue}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-white/60 font-mono text-xs">{job.name}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-red-500 dark:text-red-400 max-w-sm truncate" title={job.failedReason}>
                      {job.failedReason}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400 dark:text-white/30">
                      {new Date(job.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.failedJobs.length === 0 && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-green-700 dark:text-green-300">No failed jobs in any queue.</p>
        </div>
      )}
    </div>
  );
}
