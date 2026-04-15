"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Workspace {
  id: string; name: string; slug: string; owner_id: string; owner_email: string;
  plan_id: string; plan_status: string; lead_credits_balance: number;
  sends_this_month: number; max_monthly_sends: number; max_inboxes: number;
  created_at: string; stripe_customer_id: string | null;
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    growth:  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

function StatusDot({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${active ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-white/30"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-slate-300 dark:bg-white/20"}`} />
      {status}
    </span>
  );
}

function WorkspacesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const page   = parseInt(searchParams.get("page")   ?? "1");
  const search = searchParams.get("search") ?? "";
  const plan   = searchParams.get("plan")   ?? "";

  const fetchWorkspaces = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), search, plan });
    fetch(`/api/admin/workspaces?${q}`)
      .then(r => r.json())
      .then(d => { setWorkspaces(d.workspaces ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, search, plan]);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/workspaces?${p}`);
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Workspaces</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total workspaces</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or slug…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={plan}
          onChange={e => setParam("plan", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="scale">Scale</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Owner</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Credits</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Sends</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden xl:table-cell">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-40" /></td>
                <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-32" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-16" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-12" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
                <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
                <td className="px-4 py-3" />
              </tr>
            ))}
            {!loading && workspaces.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No workspaces found.</td></tr>
            )}
            {!loading && workspaces.map(ws => (
              <tr key={ws.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <td className="px-5 py-3">
                  <div>
                    <Link href={`/admin/workspaces/${ws.id}`} className="font-medium text-slate-800 dark:text-white/90 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {ws.name}
                    </Link>
                    <p className="text-xs text-slate-400 dark:text-white/30">{ws.slug}</p>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-white/50 text-xs">{ws.owner_email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <PlanBadge plan={ws.plan_id} />
                    <StatusDot status={ws.plan_status} />
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-600 dark:text-white/60 tabular-nums">
                  {ws.lead_credits_balance.toLocaleString()}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-500 dark:text-white/40 text-xs tabular-nums">
                  {ws.sends_this_month.toLocaleString()} / {ws.max_monthly_sends.toLocaleString()}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-slate-500 dark:text-white/40 text-xs">
                  {new Date(ws.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/workspaces/${ws.id}`} className="text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-white/30">
              Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}
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
                        ? "bg-blue-500 text-white"
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

export default function WorkspacesPage() {
  return <Suspense><WorkspacesInner /></Suspense>;
}
