"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface Transaction {
  id: string;
  workspace_id: string;
  workspace_name: string;
  amount: number;
  type: string;
  description: string | null;
  lead_campaign_id: string | null;
  created_at: string;
}

interface Summary {
  total_granted: number;
  total_purchased: number;
  total_consumed: number;
}

const TYPE_COLORS: Record<string, string> = {
  grant:       "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  admin_grant: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  purchase:    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  reserve:     "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  consume:     "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
  admin_deduct:"bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  refund:      "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${TYPE_COLORS[type] ?? TYPE_COLORS.consume}`}>
      {type.replace("_", " ")}
    </span>
  );
}

function AmountCell({ amount }: { amount: number }) {
  const positive = amount > 0;
  return (
    <span className={`font-semibold tabular-nums ${positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {positive ? "+" : ""}{amount.toLocaleString()}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function CreditsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal]               = useState(0);
  const [summary, setSummary]           = useState<Summary>({ total_granted: 0, total_purchased: 0, total_consumed: 0 });
  const [loading, setLoading]           = useState(true);

  const page     = parseInt(searchParams.get("page")     ?? "1");
  const search   = searchParams.get("search")   ?? "";
  const type     = searchParams.get("type")     ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo   = searchParams.get("dateTo")   ?? "";

  const fetchCredits = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), search, type, dateFrom, dateTo });
    fetch(`/api/admin/credits?${q}`)
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? []);
        setTotal(d.total ?? 0);
        setSummary(d.summary ?? { total_granted: 0, total_purchased: 0, total_consumed: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search, type, dateFrom, dateTo]);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/credits?${p}`);
  }

  const totalPages = Math.ceil(total / 50);
  const netBalance = summary.total_granted + summary.total_purchased - summary.total_consumed;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Credit Ledger</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} transactions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Granted"   value={summary.total_granted}   color="text-green-600 dark:text-green-400" />
        <SummaryCard label="Total Purchased" value={summary.total_purchased} color="text-orange-600 dark:text-orange-400" />
        <SummaryCard label="Total Consumed"  value={summary.total_consumed}  color="text-red-600 dark:text-red-400" />
        <SummaryCard label="Net Balance"     value={netBalance}              color={netBalance >= 0 ? "text-slate-900 dark:text-white" : "text-red-600 dark:text-red-400"} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Filter by workspace…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <select
          value={type}
          onChange={e => setParam("type", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All types</option>
          <option value="grant">Grant</option>
          <option value="admin_grant">Admin Grant</option>
          <option value="purchase">Purchase</option>
          <option value="reserve">Reserve</option>
          <option value="consume">Consume</option>
          <option value="admin_deduct">Admin Deduct</option>
          <option value="refund">Refund</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setParam("dateFrom", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setParam("dateTo", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          title="To date"
        />
        {(search || type || dateFrom || dateTo) && (
          <button
            onClick={() => router.push("/admin/credits")}
            className="px-3 py-2 text-sm text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Type</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Description</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 12 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-36" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-20" /></td>
                <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-14 ml-auto" /></td>
                <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-48" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-24" /></td>
              </tr>
            ))}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-400 dark:text-white/30">
                  No transactions found.
                </td>
              </tr>
            )}
            {!loading && transactions.map(tx => (
              <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/workspaces/${tx.workspace_id}`}
                    className="font-medium text-slate-800 dark:text-white/80 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                  >
                    {tx.workspace_name || tx.workspace_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={tx.type} />
                </td>
                <td className="px-4 py-3 text-right">
                  <AmountCell amount={tx.amount} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-white/50 text-xs max-w-xs truncate">
                  {tx.description ?? <span className="text-slate-300 dark:text-white/20 italic">—</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400 dark:text-white/30 whitespace-nowrap">
                  {new Date(tx.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-white/30">
              Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
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

export default function CreditsPage() {
  return <Suspense><CreditsInner /></Suspense>;
}
