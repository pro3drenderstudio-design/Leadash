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

const STATUS_COLORS: Record<TransactionStatus, string> = {
  pending:   "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-green-400",
  failed:    "bg-red-500/15 text-red-400",
  reversed:  "bg-white/10 text-white/50",
};

const TYPE_ICONS: Record<TransactionType, string> = {
  invoice_payment: "↓",
  payout:          "↑",
  card_spend:      "▣",
  card_funding:    "⊕",
  fee:             "−",
  refund:          "↩",
  adjustment:      "≈",
};

const TYPE_COLORS: Record<TransactionType, string> = {
  invoice_payment: "text-green-400 bg-green-500/10",
  payout:          "text-blue-400 bg-blue-500/10",
  card_spend:      "text-orange-400 bg-orange-500/10",
  card_funding:    "text-purple-400 bg-purple-500/10",
  fee:             "text-red-400 bg-red-500/10",
  refund:          "text-teal-400 bg-teal-500/10",
  adjustment:      "text-white/50 bg-white/5",
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
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "2-digit", minute: "2-digit",
  });
}

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
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search)                    params.set("search", search);
      if (typeFilter   !== "all")    params.set("type", typeFilter);
      if (statusFilter !== "all")    params.set("status", statusFilter);

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Transactions</h1>
        <p className="text-white/50 text-sm mt-1">Complete ledger of all account activity</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search description or reference…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as TransactionType | "all")}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">All Types</option>
          {ALL_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TransactionStatus | "all")}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-white/3 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-white/40 text-sm">No transactions found</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[2rem_1fr_8rem_8rem_6rem_6rem] gap-4 px-5 py-3 border-b border-white/8 text-xs text-white/40 uppercase tracking-wider">
              <div />
              <div>Description</div>
              <div className="text-right">Amount (USD)</div>
              <div className="text-right">Amount (NGN)</div>
              <div>Status</div>
              <div className="text-right">Date</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/5">
              {transactions.map(tx => {
                const sign   = AMOUNT_SIGN[tx.type];
                const hasUsd = tx.usd_amount_cents != null;
                const hasNgn = tx.ngn_amount_kobo  != null;
                return (
                  <div
                    key={tx.id}
                    className="grid grid-cols-[2rem_1fr_8rem_8rem_6rem_6rem] gap-4 px-5 py-3.5 items-center hover:bg-white/3 transition-colors"
                  >
                    {/* Type icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${TYPE_COLORS[tx.type]}`}>
                      {TYPE_ICONS[tx.type]}
                    </div>

                    {/* Description + ref */}
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{tx.description}</p>
                      <p className="text-xs text-white/30 mt-0.5 font-mono">{tx.reference}</p>
                    </div>

                    {/* USD amount */}
                    <div className={`text-right text-sm font-medium tabular-nums ${
                      !hasUsd ? "text-white/20" :
                      sign > 0 ? "text-green-400" :
                      sign < 0 ? "text-red-400" : "text-white/60"
                    }`}>
                      {hasUsd
                        ? `${sign > 0 ? "+" : sign < 0 ? "−" : ""}${fmtUsd(tx.usd_amount_cents)}`
                        : "—"
                      }
                    </div>

                    {/* NGN amount */}
                    <div className={`text-right text-sm tabular-nums ${hasNgn ? "text-white/60" : "text-white/20"}`}>
                      {hasNgn
                        ? `₦${(Math.abs(tx.ngn_amount_kobo!) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                        : "—"
                      }
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[tx.status]}`}>
                        {tx.status}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="text-right">
                      <p className="text-xs text-white/60">{fmtDate(tx.created_at)}</p>
                      <p className="text-xs text-white/30">{fmtTime(tx.created_at)}</p>
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
          <p className="text-xs text-white/40">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} transactions
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = totalPages <= 5 ? i + 1 :
                page <= 3 ? i + 1 :
                page >= totalPages - 2 ? totalPages - 4 + i :
                page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    p === page
                      ? "bg-white/15 border-white/20 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
