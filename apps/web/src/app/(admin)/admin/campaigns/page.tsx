"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface Campaign {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_owner: string;
  name: string;
  mode: "scrape" | "verify_personalize" | "full_suite";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  max_leads: number;
  total_scraped: number;
  total_verified: number;
  total_personalized: number;
  total_valid: number;
  credits_reserved: number;
  credits_used: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const MODE_LABELS: Record<string, string> = {
  scrape:             "Scrape",
  verify_personalize: "Verify & Personalize",
  full_suite:         "Full Suite",
};

const MODE_COLORS: Record<string, string> = {
  scrape:             "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  verify_personalize: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  full_suite:         "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
  running:   "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  failed:    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  cancelled: "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/30",
};

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${MODE_COLORS[mode] ?? MODE_COLORS.scrape}`}>
      {MODE_LABELS[mode] ?? mode}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[status] ?? STATUS_COLORS.pending}`}>
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-400 dark:text-white/30 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function CampaignsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);

  const page   = parseInt(searchParams.get("page")   ?? "1");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const mode   = searchParams.get("mode")   ?? "";

  const fetchCampaigns = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), search, status, mode });
    fetch(`/api/admin/campaigns?${q}`)
      .then(r => r.json())
      .then(d => { setCampaigns(d.campaigns ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, search, status, mode]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/campaigns?${p}`);
  }

  // Summary counts derived from current page (approximate for filtered views)
  const runningCount   = campaigns.filter(c => c.status === "running").length;
  const failedCount    = campaigns.filter(c => c.status === "failed").length;
  const completedCount = campaigns.filter(c => c.status === "completed").length;

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Lead Campaigns</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total campaigns</p>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && (
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "Running",   count: runningCount,   color: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/20" },
            { label: "Failed",    count: failedCount,    color: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20" },
            { label: "Completed", count: completedCount, color: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/20" },
          ].map(s => s.count > 0 && (
            <button
              key={s.label}
              onClick={() => setParam("status", status === s.label.toLowerCase() ? "" : s.label.toLowerCase())}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${s.color}`}
            >
              {s.count} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by campaign or workspace name…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <select
          value={status}
          onChange={e => setParam("status", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={mode}
          onChange={e => setParam("mode", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All modes</option>
          <option value="scrape">Scrape</option>
          <option value="verify_personalize">Verify & Personalize</option>
          <option value="full_suite">Full Suite</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Campaign</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Progress</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Credits</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden xl:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-40" /></td>
                <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-32" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-28" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-16" /></td>
                <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
              </tr>
            ))}
            {!loading && campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <p className="text-slate-400 dark:text-white/30">No campaigns found.</p>
                </td>
              </tr>
            )}
            {!loading && campaigns.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800 dark:text-white/90 truncate max-w-[200px]">{c.name}</p>
                  <ModeBadge mode={c.mode} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Link
                    href={`/admin/workspaces/${c.workspace_id}`}
                    className="text-sm text-slate-600 dark:text-white/60 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                  >
                    {c.workspace_name}
                  </Link>
                  <p className="text-xs text-slate-400 dark:text-white/30 truncate max-w-[180px]">{c.workspace_owner}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                  {c.status === "failed" && c.error_message && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 max-w-[140px] truncate" title={c.error_message}>
                      {c.error_message}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell min-w-[160px]">
                  <ProgressBar value={c.total_scraped} max={c.max_leads} />
                  <p className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5">
                    {c.total_scraped.toLocaleString()} / {c.max_leads.toLocaleString()} leads
                    {c.total_valid > 0 && (
                      <span className="text-green-600 dark:text-green-400 ml-1">· {c.total_valid.toLocaleString()} valid</span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <p className="text-sm text-slate-600 dark:text-white/60 tabular-nums">
                    {c.credits_used.toLocaleString()}
                    <span className="text-slate-400 dark:text-white/30"> / {c.credits_reserved.toLocaleString()}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-white/30">used / reserved</p>
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-slate-400 dark:text-white/30">
                  {new Date(c.created_at).toLocaleDateString()}
                  {c.completed_at && (
                    <p className="text-green-600 dark:text-green-400">
                      Done {new Date(c.completed_at).toLocaleDateString()}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-white/30">
              Showing {((page - 1) * 30) + 1}–{Math.min(page * 30, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setParam("page", String(p))}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-orange-500 text-white"
                        : "text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return <Suspense><CampaignsInner /></Suspense>;
}
