"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RedisStats {
  memory_used_mb: number;
  memory_max_mb:  number;
  memory_pct:     number;
  connected_clients: number;
  evicted_keys:   number;
}

interface QueueStat {
  name:    string;
  label:   string;
  waiting: number;
  active:  number;
  failed:  number;
  delayed: number;
}

interface ServerStats {
  cpu_load_1m:  number;
  cpu_load_5m:  number;
  cpu_load_15m: number;
  cpu_cores:    number;
  ram_used_mb:  number;
  ram_total_mb: number;
  ram_pct:      number;
  disk_used_gb: number;
  disk_total_gb:number;
  disk_pct:     number;
}

interface PostalStats {
  queued:         number;
  held:           number;
  failed:         number;
  delivered_today:number;
}

interface DbStats {
  total_inboxes:     number;
  active_inboxes:    number;
  error_inboxes:     number;
  warming_inboxes:   number;
  active_campaigns:  number;
  active_workspaces: number;
  sends_today:       number;
}

interface Snapshot {
  id:          string;
  captured_at: string;
  redis:       RedisStats | null;
  queues:      QueueStat[] | null;
  server:      ServerStats | null;
  postal:      PostalStats | null;
  db_stats:    DbStats | null;
}

interface Alert {
  id:          string;
  created_at:  string;
  type:        string;
  severity:    string;
  title:       string;
  body:        string | null;
  workspace_id:string | null;
  resolved_at: string | null;
  read_at:     string | null;
}

interface CapRow {
  id:      string;
  name:    string;
  current: number;
  max:     number | null;
  pct:     number | null;
}

interface InfraData {
  snapshot:     Snapshot | null;
  history:      Snapshot[];
  activeAlerts: Alert[];
  workerAlive:  boolean;
  lastCapture:  string | null;
  capsNearLimit:CapRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function pctColor(pct: number): string {
  if (pct >= 90) return "text-red-600 dark:text-red-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function pctBar(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function PctBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${pctBar(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 text-right ${pctColor(pct)}`}>{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
      <p className="text-xs text-slate-400 dark:text-white/30 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800 dark:text-white/90 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

function SevBadge({ severity }: { severity: string }) {
  const cls = severity === "critical"
    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
    : severity === "warning"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
    : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${cls}`}>
      {severity}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function alertLink(a: { type: string; workspace_id: string | null }): string | null {
  if (a.workspace_id && ["inbox_limit", "trial", "warmup"].includes(a.type))
    return `/admin/workspaces/${a.workspace_id}`;
  if (a.type === "queue")  return "/admin/system";
  if (a.type === "infra" || a.type === "postal") return "/admin/infrastructure";
  return null;
}

export default function InfrastructurePage() {
  const router = useRouter();
  const [data, setData]     = useState<InfraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/infrastructure");
      if (res.ok) setData(await res.json() as InfraData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function resolveAlert(id: string) {
    setResolving(id);
    try {
      await fetch("/api/admin/notifications", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ids: [id], action: "resolve" }),
      });
      await load();
    } finally {
      setResolving(null);
    }
  }

  const snap = data?.snapshot;
  const r    = snap?.redis;
  const s    = snap?.server;
  const p    = snap?.postal;
  const d    = snap?.db_stats;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white/90">Infrastructure</h1>
          <p className="text-sm text-slate-400 dark:text-white/30 mt-0.5">
            Live snapshot · refreshes every 30s · last captured {timeAgo(data?.lastCapture ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${data?.workerAlive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${data?.workerAlive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            Worker {data?.workerAlive ? "alive" : "down"}
          </span>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="text-xs text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Active alerts banner */}
      {(data?.activeAlerts ?? []).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Active Alerts ({data!.activeAlerts.length})
          </h2>
          {data!.activeAlerts.map(a => {
            const link = alertLink(a);
            return (
            <div key={a.id}
              onClick={() => link && router.push(link)}
              className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
              a.severity === "critical"
                ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
                : a.severity === "warning"
                ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                : "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30"
            } ${link ? "cursor-pointer hover:opacity-90" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <SevBadge severity={a.severity} />
                  <span className="font-medium text-slate-800 dark:text-white/90">{a.title}</span>
                </div>
                {a.body && <p className="text-slate-500 dark:text-white/40 text-xs">{a.body}</p>}
                <p className="text-slate-400 dark:text-white/20 text-xs mt-1">{timeAgo(a.created_at)}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); resolveAlert(a.id); }}
                disabled={resolving === a.id}
                className="text-xs text-slate-400 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/70 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
              >
                {resolving === a.id ? "..." : "Resolve"}
              </button>
            </div>
          );})}
        </div>
      )}

      {/* Redis */}
      <section>
        <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          Redis
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Memory used" value={r ? `${r.memory_used_mb} MB` : "—"} sub={r ? `of ${r.memory_max_mb} MB` : undefined} />
          <StatCard label="Clients" value={r?.connected_clients ?? "—"} />
          <StatCard label="Evicted keys" value={r?.evicted_keys ?? "—"} />
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 col-span-1">
            <p className="text-xs text-slate-400 dark:text-white/30 mb-2">Memory usage</p>
            {r ? <PctBar pct={r.memory_pct} /> : <p className="text-slate-300 dark:text-white/20 text-sm">—</p>}
          </div>
        </div>
      </section>

      {/* Server */}
      <section>
        <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" /></svg>
          VPS Server
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 dark:text-white/30 mb-2">CPU load ({s?.cpu_cores ?? "?"} cores)</p>
            <div className="space-y-1.5">
              {[["1m", s?.cpu_load_1m], ["5m", s?.cpu_load_5m], ["15m", s?.cpu_load_15m]].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 dark:text-white/30 w-5">{label}</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-white/70">
                    {val != null ? (val as number).toFixed(2) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 dark:text-white/30 mb-2">RAM</p>
            {s ? (
              <>
                <p className="text-xl font-bold text-slate-800 dark:text-white/90 tabular-nums">{s.ram_used_mb} <span className="text-sm font-normal text-slate-400">MB</span></p>
                <p className="text-xs text-slate-400 dark:text-white/30 mb-2">of {s.ram_total_mb} MB</p>
                <PctBar pct={s.ram_pct} />
              </>
            ) : <p className="text-slate-300 dark:text-white/20">—</p>}
          </div>
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 dark:text-white/30 mb-2">Disk</p>
            {s ? (
              <>
                <p className="text-xl font-bold text-slate-800 dark:text-white/90 tabular-nums">{s.disk_used_gb} <span className="text-sm font-normal text-slate-400">GB</span></p>
                <p className="text-xs text-slate-400 dark:text-white/30 mb-2">of {s.disk_total_gb} GB</p>
                <PctBar pct={s.disk_pct} />
              </>
            ) : <p className="text-slate-300 dark:text-white/20">—</p>}
          </div>
        </div>
      </section>

      {/* Queues */}
      <section>
        <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
          Queues
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(snap?.queues ?? []).map(q => (
            <div key={q.name} className={`bg-white dark:bg-white/5 border rounded-xl p-4 ${q.failed > 0 ? "border-red-200 dark:border-red-500/30" : "border-slate-200 dark:border-white/10"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-white/70 truncate">{q.label}</p>
                {q.failed > 0
                  ? <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300">{q.failed} failed</span>
                  : q.active > 0
                  ? <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  : null}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                {[["waiting", q.waiting], ["active", q.active], ["delayed", q.delayed], ["failed", q.failed]].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between">
                    <span className="text-slate-400 dark:text-white/30">{l}</span>
                    <span className={`font-mono font-semibold ${(l as string) === "failed" && (v as number) > 0 ? "text-red-500" : "text-slate-600 dark:text-white/60"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!snap?.queues?.length && (
            <p className="col-span-4 text-sm text-slate-400 dark:text-white/30">No queue data yet. Worker will populate on next snapshot.</p>
          )}
        </div>
      </section>

      {/* Postal + DB stats side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Postal */}
        <section>
          <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3">Postal (Mail Server)</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Queued" value={p?.queued ?? "—"} />
            <StatCard label="Held" value={p?.held ?? "—"} />
            <StatCard label="Failed" value={p?.failed ?? "—"} />
            <StatCard label="Delivered today" value={p?.delivered_today ?? "—"} />
          </div>
        </section>

        {/* App DB */}
        <section>
          <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3">Application</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Active workspaces" value={d?.active_workspaces ?? "—"} />
            <StatCard label="Active campaigns" value={d?.active_campaigns ?? "—"} />
            <StatCard label="Inboxes (total)" value={d?.total_inboxes ?? "—"} sub={d ? `${d.active_inboxes} active · ${d.warming_inboxes} warming · ${d.error_inboxes} error` : undefined} />
            <StatCard label="Sends today" value={d?.sends_today ?? "—"} />
          </div>
        </section>
      </div>

      {/* Subscription caps */}
      {(data?.capsNearLimit ?? []).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-600 dark:text-white/60 mb-3">Workspaces near inbox limit</h2>
          <div className="space-y-2">
            {data!.capsNearLimit.map(w => (
              <div key={w.id} className="flex items-center gap-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-white/70 truncate">{w.name}</p>
                  <p className="text-xs text-slate-400 dark:text-white/30">{w.current} / {w.max ?? "∞"} inboxes</p>
                </div>
                <div className="w-40">
                  {w.pct != null && <PctBar pct={w.pct} />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
