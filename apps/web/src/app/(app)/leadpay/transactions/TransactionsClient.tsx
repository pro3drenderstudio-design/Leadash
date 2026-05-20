"use client";

import { useState, useEffect, useCallback } from "react";
import { wsGet } from "@/lib/workspace/client";
import type { LeadPayTransaction, TransactionType, TransactionStatus } from "@/types/leadpay";

const TYPE_LABELS: Record<TransactionType, string> = {
  invoice_payment: "Invoice Payment",
  payout:          "Payout",
  card_spend:      "Card Spend",
  card_funding:    "Card Funding",
  fee:             "Fee",
  refund:          "Refund",
  adjustment:      "Adjustment",
};

const TYPE_ICONS: Record<TransactionType, React.ReactNode> = {
  invoice_payment: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  payout: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  card_spend: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  card_funding: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  fee: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
    </svg>
  ),
  refund: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  ),
  adjustment: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  ),
};

const TYPE_COLORS: Record<TransactionType, string> = {
  invoice_payment: "text-emerald-400 bg-emerald-500/[0.1]",
  payout:          "text-blue-400 bg-blue-500/[0.1]",
  card_spend:      "text-orange-400 bg-orange-500/[0.1]",
  card_funding:    "text-violet-400 bg-violet-500/[0.1]",
  fee:             "text-red-400 bg-red-500/[0.1]",
  refund:          "text-teal-400 bg-teal-500/[0.1]",
  adjustment:      "text-white/40 bg-white/[0.05]",
};

const STATUS_CFG: Record<TransactionStatus, { dot: string; text: string; label: string }> = {
  pending:   { dot: "bg-amber-400",   text: "text-amber-400",   label: "Pending" },
  completed: { dot: "bg-emerald-400", text: "text-emerald-400", label: "Completed" },
  failed:    { dot: "bg-red-400",     text: "text-red-400",     label: "Failed" },
  reversed:  { dot: "bg-white/25",    text: "text-white/40",    label: "Reversed" },
};

const AMOUNT_SIGN: Record<TransactionType, number> = {
  invoice_payment: 1,
  payout:          -1,
  card_spend:      -1,
  card_funding:    -1,
  fee:             -1,
  refund:          1,
  adjustment:      0,
};

const ALL_TYPES: TransactionType[] = [
  "invoice_payment","payout","card_spend","card_funding","fee","refund","adjustment",
];

function fmtUsd(cents: number | null): string {
  if (cents == null) return "—";
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

const SELECT_CLS = "bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/40 transition-colors appearance-none cursor-pointer";

export default function TransactionsClient() {
  const [transactions, setTransactions] = useState<LeadPayTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState<TransactionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "all">("all");
  const [page, setPage]                 = useState(1);
  const [total, setTotal]               = useState(0);
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search)                 params.set("search", search);
      if (typeFilter !== "all")   params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await wsGet<{ transactions: LeadPayTransaction[]; total: number }>(
        `/api/leadpay/transactions?${params}`
      );
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      // handled by error boundary
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Page number window
  function pageWindow(): number[] {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [page - 2, page - 1, page, page + 1, page + 2];
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Transactions</h1>
        <p className="text-white/40 text-sm mt-1">Complete ledger of all account activity</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search description or reference…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TransactionType | "all")}
            className={SELECT_CLS + " pr-8"} style={{ colorScheme: "dark" }}>
            <option value="all">All Types</option>
            {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </div>

        {/* Status filter */}
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TransactionStatus | "all")}
            className={SELECT_CLS + " pr-8"} style={{ colorScheme: "dark" }}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="reversed">Reversed</option>
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] overflow-hidden">
        {loading ? (
          <div className="divide-y divide-white/[0.04]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-white/[0.06] rounded animate-pulse w-48" />
                  <div className="h-2.5 bg-white/[0.04] rounded animate-pulse w-28" />
                </div>
                <div className="h-3.5 bg-white/[0.05] rounded animate-pulse w-16" />
                <div className="h-3.5 bg-white/[0.04] rounded animate-pulse w-12" />
                <div className="h-3.5 bg-white/[0.04] rounded animate-pulse w-20" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
            </div>
            <p className="text-sm font-medium text-white/40">No transactions found</p>
            <p className="text-xs text-white/25 mt-1">
              {search || typeFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Transaction history will appear here once you start using Leadash Pay"}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[2.25rem_1fr_7rem_7rem_5.5rem_6.5rem] gap-4 px-5 py-3 border-b border-white/[0.05] bg-white/[0.015]">
              <div />
              <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Description</div>
              <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">USD</div>
              <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">NGN</div>
              <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Status</div>
              <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">Date</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
              {transactions.map(tx => {
                const sign   = AMOUNT_SIGN[tx.type];
                const hasUsd = tx.usd_amount_cents != null;
                const hasNgn = tx.ngn_amount_kobo  != null;
                const stCfg  = STATUS_CFG[tx.status];
                const tColor = TYPE_COLORS[tx.type];

                return (
                  <div
                    key={tx.id}
                    className="grid grid-cols-[2.25rem_1fr_7rem_7rem_5.5rem_6.5rem] gap-4 px-5 py-4 items-center hover:bg-white/[0.025] transition-colors group"
                  >
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tColor}`}>
                      {TYPE_ICONS[tx.type]}
                    </div>

                    {/* Description + ref */}
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{tx.description}</p>
                      <p className="text-[11px] text-white/25 mt-0.5 font-mono truncate">{tx.reference}</p>
                    </div>

                    {/* USD amount */}
                    <div className={`text-right text-sm font-bold tabular-nums ${
                      !hasUsd       ? "text-white/20" :
                      sign > 0      ? "text-emerald-400" :
                      sign < 0      ? "text-white/60" :
                                      "text-white/50"
                    }`}>
                      {hasUsd
                        ? `${sign > 0 ? "+" : sign < 0 ? "−" : ""}${fmtUsd(tx.usd_amount_cents)}`
                        : "—"
                      }
                    </div>

                    {/* NGN amount */}
                    <div className={`text-right text-sm tabular-nums ${hasNgn ? "text-white/45" : "text-white/20"}`}>
                      {hasNgn
                        ? `₦${(Math.abs(tx.ngn_amount_kobo!) / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`
                        : "—"
                      }
                    </div>

                    {/* Status */}
                    <div>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stCfg.dot}`} />
                        <span className={`text-[11px] font-medium ${stCfg.text}`}>{stCfg.label}</span>
                      </span>
                    </div>

                    {/* Date + time */}
                    <div className="text-right">
                      <p className="text-xs text-white/50">{fmtDate(tx.created_at)}</p>
                      <p className="text-[11px] text-white/25 mt-0.5">{fmtTime(tx.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/30">
            Showing <span className="text-white/50 font-medium">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span> of <span className="text-white/50 font-medium">{total}</span> transactions
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>

            {pageWindow().map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium border transition-all ${
                  p === page
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-white/[0.04] border-white/[0.08] text-white/45 hover:bg-white/[0.07] hover:text-white/70"
                }`}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
