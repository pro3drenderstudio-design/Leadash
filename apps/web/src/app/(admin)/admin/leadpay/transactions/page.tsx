"use client";

import { useEffect, useState, useCallback } from "react";
import { Suspense } from "react";
import type { LeadPayTransaction } from "@/types/leadpay";

const TYPE_LABELS: Record<string, string> = {
  invoice_payment: "Invoice",
  payout:          "Payout",
  card_spend:      "Card",
  card_funding:    "Card Fund",
  fee:             "Fee",
  refund:          "Refund",
  adjustment:      "Adjustment",
};

function TxInner() {
  const [transactions, setTransactions] = useState<LeadPayTransaction[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setType] = useState("all");
  const [page, setPage]     = useState(1);
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search)              params.set("search", search);
    if (typeFilter !== "all") params.set("type", typeFilter);
    const res  = await fetch(`/api/admin/leadpay/transactions?${params}`);
    const data = await res.json() as { transactions: LeadPayTransaction[]; total: number };
    setTransactions(data.transactions);
    setTotal(data.total);
    setLoading(false);
  }, [page, search, typeFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">All Transactions</h1>
        <p className="text-white/40 text-sm mt-1">{total} total</p>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search description or reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
        <select
          value={typeFilter}
          onChange={e => setType(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
        >
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
        {loading ? (
          <div className="space-y-px">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-white/3 animate-pulse" />)}</div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">No transactions found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-xs bg-white/8 px-2 py-0.5 rounded text-white/50 shrink-0">
                  {TYPE_LABELS[tx.type] ?? tx.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{tx.description}</p>
                  <p className="text-xs text-white/30 font-mono mt-0.5">{tx.reference}</p>
                </div>
                <div className="text-right shrink-0">
                  {tx.usd_amount_cents != null && (
                    <p className="text-sm font-medium text-white">${(tx.usd_amount_cents / 100).toFixed(2)}</p>
                  )}
                  <p className="text-xs text-white/30">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                  tx.status === "completed" ? "bg-green-500/15 text-green-400" :
                  tx.status === "pending"   ? "bg-yellow-500/15 text-yellow-400" :
                  tx.status === "failed"    ? "bg-red-500/15 text-red-400" : "bg-white/10 text-white/40"
                }`}>
                  {tx.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {Math.ceil(total / PAGE_SIZE) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 disabled:opacity-30">Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={page>=Math.ceil(total/PAGE_SIZE)}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTransactionsPage() {
  return <Suspense><TxInner /></Suspense>;
}
