"use client";
import { useEffect, useState, useCallback } from "react";

interface AdminCampaign {
  id: string;
  name: string;
  status: string;
  daily_cap: number | null;
  created_at: string;
  deleted_at: string | null;
  workspace_id: string;
  workspace_name: string;
  total: number;
  active: number;
  completed: number;
  failed: number;
}

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  paused:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  draft:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
  archived: "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/25",
  deleted:  "bg-red-100 text-red-500 dark:bg-red-500/10 dark:text-red-400",
};

export default function AdminOutreachCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const PAGE = 50;

  const fetchCampaigns = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (search) sp.set("search", search);
    if (status) sp.set("status", status);
    sp.set("page", String(page));

    fetch(`/api/admin/outreach/campaigns?${sp}`)
      .then(r => r.json())
      .then(d => {
        setCampaigns(d.campaigns ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Outreach Campaigns</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">All outreach campaigns across every workspace with enrollment breakdowns.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search campaign name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 w-64"
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All (non-deleted)</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="deleted">Deleted</option>
        </select>
        <span className="self-center text-xs text-slate-400 dark:text-white/30">{total.toLocaleString()} total</span>
      </div>

      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 dark:bg-white/5 rounded" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400 dark:text-white/30">No campaigns match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10">
                  {["Campaign", "Workspace", "Status", "Enrollments", "Active", "Completed", "Daily Cap", "Created"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {campaigns.map(c => (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => setExpanded(e => e === c.id ? null : c.id)}
                      className={`cursor-pointer transition-colors ${expanded === c.id ? "bg-orange-50 dark:bg-orange-500/5" : "hover:bg-slate-50 dark:hover:bg-white/3"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-white/80 max-w-[200px] truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-white/25 font-mono mt-0.5">{c.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-white/60 max-w-[140px] truncate">{c.workspace_name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${c.deleted_at ? STATUS_COLORS.deleted : (STATUS_COLORS[c.status] ?? STATUS_COLORS.draft)}`}>
                          {c.deleted_at ? "deleted" : c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-white/70 font-semibold">{c.total.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{c.active.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40">{c.completed.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40">{c.daily_cap ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 dark:text-white/30 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>

                    {expanded === c.id && (
                      <tr key={`${c.id}-exp`}>
                        <td colSpan={8} className="p-0">
                          <div className="bg-orange-50 dark:bg-orange-500/5 border-t border-orange-100 dark:border-orange-500/10 px-5 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: "Total Enrollments", value: c.total.toLocaleString(), color: "text-slate-700 dark:text-white/70" },
                                { label: "Active / Pending",  value: c.active.toLocaleString(), color: "text-emerald-600 dark:text-emerald-400" },
                                { label: "Completed",         value: c.completed.toLocaleString(), color: "text-blue-600 dark:text-blue-400" },
                                { label: "Failed",            value: c.failed.toLocaleString(), color: "text-red-500" },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="bg-white dark:bg-white/5 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-white/10">
                                  <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-wider font-semibold">{label}</p>
                                  <p className={`text-lg font-bold mt-0.5 tabular-nums ${color}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-white/25 mt-3">Campaign ID: <span className="font-mono">{c.id}</span></p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
            <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE >= total}
                className="px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
