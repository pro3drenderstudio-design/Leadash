"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface Domain {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_owner: string;
  domain: string;
  status: "pending" | "purchasing" | "dns_pending" | "verifying" | "active" | "failed";
  payment_provider: "stripe" | "paystack";
  mailgun_domain: string | null;
  mailbox_count: number;
  mailbox_prefix: string;
  first_name: string | null;
  last_name: string | null;
  daily_send_limit: number;
  warmup_ends_at: string | null;
  error_message: string | null;
  dns_records: Record<string, unknown> | null;
  domain_price_usd: number | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
  purchasing:  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  dns_pending: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  verifying:   "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  active:      "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  failed:      "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const pulse = status === "dns_pending" || status === "verifying" || status === "purchasing";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[status] ?? STATUS_COLORS.pending}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {status.replace("_", " ")}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const colors = provider === "stripe"
    ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
    : "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${colors}`}>{provider}</span>;
}

function DnsRecordsExpander({ records }: { records: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!records) return <span className="text-slate-300 dark:text-white/20 text-xs italic">—</span>;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        {open ? "Hide" : "Show"} DNS
      </button>
      {open && (
        <pre className="mt-2 text-[10px] text-slate-500 dark:text-white/50 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded p-2 max-w-xs overflow-x-auto">
          {JSON.stringify(records, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ActionButtons({ domain, onAction }: { domain: Domain; onAction: (id: string, action: string) => void }) {
  const { status } = domain;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {(status === "failed" || status === "dns_pending") && (
        <button
          onClick={() => onAction(domain.id, "retry_dns")}
          className="text-[11px] font-medium px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          Retry DNS
        </button>
      )}
      {status !== "active" && (
        <button
          onClick={() => onAction(domain.id, "force_active")}
          className="text-[11px] font-medium px-2 py-1 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
        >
          Force Active
        </button>
      )}
      {status !== "failed" && (
        <button
          onClick={() => onAction(domain.id, "set_failed")}
          className="text-[11px] font-medium px-2 py-1 rounded bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
        >
          Mark Failed
        </button>
      )}
    </div>
  );
}

function DomainsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [domains, setDomains]   = useState<Domain[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const page   = parseInt(searchParams.get("page")   ?? "1");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";

  const fetchDomains = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), search, status });
    fetch(`/api/admin/domains?${q}`)
      .then(r => r.json())
      .then(d => { setDomains(d.domains ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, search, status]);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/domains?${p}`);
  }

  async function handleAction(id: string, action: string) {
    if (!confirm(`Run "${action}" on this domain?`)) return;
    setActioning(id);
    try {
      const res = await fetch(`/api/admin/domains/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Action failed"); return; }
      // Optimistically update status in list
      setDomains(prev => prev.map(d =>
        d.id === id ? { ...d, status: data.newStatus, error_message: action === "retry_dns" || action === "force_active" ? null : d.error_message } : d
      ));
    } finally {
      setActioning(null);
    }
  }

  // Status counts for summary pills
  const countsByStatus = domains.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Domains</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total managed domains</p>
      </div>

      {/* Status pills */}
      {!loading && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(countsByStatus).map(([s, count]) => (
            <button
              key={s}
              onClick={() => setParam("status", status === s ? "" : s)}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${STATUS_COLORS[s] ?? STATUS_COLORS.pending} ${status === s ? "ring-2 ring-offset-1 ring-current" : ""}`}
            >
              {count} {s.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by domain name…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={status}
          onChange={e => setParam("status", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="purchasing">Purchasing</option>
          <option value="dns_pending">DNS Pending</option>
          <option value="verifying">Verifying</option>
          <option value="active">Active</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Domain</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Mailboxes</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden xl:table-cell">DNS</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-40" /></td>
                <td className="px-4 py-4 hidden md:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-32" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
                <td className="px-4 py-4 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-16" /></td>
                <td className="px-4 py-4 hidden xl:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-12" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-24" /></td>
              </tr>
            ))}
            {!loading && domains.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-white/30">
                  No domains found.
                </td>
              </tr>
            )}
            {!loading && domains.map(d => (
              <tr key={d.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors ${actioning === d.id ? "opacity-50 pointer-events-none" : ""}`}>
                <td className="px-5 py-4">
                  <p className="font-mono font-medium text-slate-800 dark:text-white/90">{d.domain}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ProviderBadge provider={d.payment_provider} />
                    {d.domain_price_usd && (
                      <span className="text-[10px] text-slate-400 dark:text-white/30">${d.domain_price_usd}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 hidden md:table-cell">
                  <Link
                    href={`/admin/workspaces/${d.workspace_id}`}
                    className="text-sm text-slate-600 dark:text-white/60 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {d.workspace_name}
                  </Link>
                  <p className="text-xs text-slate-400 dark:text-white/30 truncate max-w-[160px]">{d.workspace_owner}</p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={d.status} />
                  {d.status === "failed" && d.error_message && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 max-w-[160px] truncate" title={d.error_message}>
                      {d.error_message}
                    </p>
                  )}
                  {d.warmup_ends_at && d.status === "active" && new Date(d.warmup_ends_at) > new Date() && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      Warming up · ends {new Date(d.warmup_ends_at).toLocaleDateString()}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 hidden lg:table-cell">
                  <p className="text-sm text-slate-600 dark:text-white/60">
                    {d.mailbox_count} mailbox{d.mailbox_count !== 1 ? "es" : ""}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-white/30">
                    {d.first_name} {d.last_name} · {d.daily_send_limit}/day
                  </p>
                </td>
                <td className="px-4 py-4 hidden xl:table-cell">
                  <DnsRecordsExpander records={d.dns_records} />
                </td>
                <td className="px-4 py-4">
                  <ActionButtons domain={d} onAction={handleAction} />
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

export default function DomainsPage() {
  return <Suspense><DomainsInner /></Suspense>;
}
