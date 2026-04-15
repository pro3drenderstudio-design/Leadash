"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Ticket {
  id: string; ticket_number: number; subject: string; message: string;
  category: string; priority: string; status: string;
  admin_reply: string | null; admin_replied_at: string | null;
  created_at: string; user_email: string;
}

const STATUS_MAP: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300",
  resolved:    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  closed:      "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
};
const PRIORITY_MAP: Record<string, string> = {
  low:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  high:   "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function Badge({ label, map }: { label: string; map: Record<string, string> }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[label] ?? map.medium}`}>
      {label.replace("_", " ")}
    </span>
  );
}

function SupportInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const page     = parseInt(searchParams.get("page")     ?? "1");
  const status   = searchParams.get("status")   ?? "";
  const priority = searchParams.get("priority") ?? "";
  const search   = searchParams.get("search")   ?? "";

  const fetchTickets = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), status, priority, search });
    fetch(`/api/admin/support?${q}`)
      .then(r => r.json())
      .then(d => { setTickets(d.tickets ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, status, priority, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/support?${p}`);
  }

  const openCount = tickets.filter(t => t.status === "open").length;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support Tickets</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">
            {total.toLocaleString()} total · {openCount > 0 && <span className="text-blue-500 font-semibold">{openCount} open on this page</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by subject…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select value={status} onChange={e => setParam("status", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priority} onChange={e => setParam("priority", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Ticket list */}
      <div className="space-y-2">
        {loading && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl animate-pulse" />
        ))}
        {!loading && tickets.length === 0 && (
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-5 py-10 text-center text-slate-400">
            No tickets found.
          </div>
        )}
        {!loading && tickets.map(t => (
          <Link
            key={t.id}
            href={`/admin/support/${t.id}`}
            className="block bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4 hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-slate-400 dark:text-white/30 font-mono">#{t.ticket_number}</span>
                  <Badge label={t.status}   map={STATUS_MAP} />
                  <Badge label={t.priority} map={PRIORITY_MAP} />
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40">
                    {t.category}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white/90 truncate">{t.subject}</p>
                <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5 truncate">{t.user_email}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400 dark:text-white/30">{new Date(t.created_at).toLocaleDateString()}</p>
                {t.admin_reply && (
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-0.5">Replied</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-white/30">
            Showing {((page - 1) * 30) + 1}–{Math.min(page * 30, total)} of {total}
          </p>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1;
              return (
                <button key={p} onClick={() => setParam("page", String(p))}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    p === page ? "bg-blue-500 text-white" : "text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/10"
                  }`}>
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return <Suspense><SupportInner /></Suspense>;
}
