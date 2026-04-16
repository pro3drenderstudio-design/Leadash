"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type { LeadCreditTransaction } from "@/types/lead-campaigns";

// Static display data — no env vars, safe for client bundle
const CREDIT_PACKS = [
  { id: "pack_500",   credits: 500,   price_usd: 19,  label: "Starter pack" },
  { id: "pack_2000",  credits: 2000,  price_usd: 59,  label: "Growth pack"  },
  { id: "pack_5000",  credits: 5000,  price_usd: 129, label: "Best value"   },
  { id: "pack_10000", credits: 10000, price_usd: 249, label: "Scale pack"   },
] as const;

const TX_LABELS: Record<string, string> = {
  grant:    "Monthly Grant",
  purchase: "Purchase",
  reserve:  "Reserved",
  consume:  "Used",
  refund:   "Refunded",
  // Bubble migration types (capitalised)
  Credit:   "Credit",
  Debit:    "Debit",
};

const TX_COLORS: Record<string, string> = {
  grant:    "text-emerald-400",
  purchase: "text-emerald-400",
  refund:   "text-emerald-400",
  reserve:  "text-amber-400",
  consume:  "text-red-400",
  // Bubble migration types
  Credit:   "text-emerald-400",
  Debit:    "text-red-400",
};

// Returns true for any type that represents a debit/spend, even if amount is positive
function isDebitType(type: string): boolean {
  return type === "consume" || type === "reserve" || type === "Debit";
}

export default function CreditsClient() {
  const [balance, setBalance]           = useState(0);
  const [transactions, setTransactions] = useState<LeadCreditTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [purchasing, setPurchasing]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lead-campaigns/credits")
      .then(r => r.json())
      .then(d => { setBalance(d.balance ?? 0); setTransactions(d.transactions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handlePurchase(packId: string) {
    setPurchasing(packId);
    const res  = await fetch("/api/lead-campaigns/credits/purchase", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pack_id: packId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else { alert(data.error ?? "Purchase failed"); setPurchasing(null); }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/lead-campaigns" className="text-white/40 hover:text-white/70 transition-colors">Lead Campaigns</Link>
        <span className="text-white/20">›</span>
        <span className="text-white/70">Credits</span>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl p-6 mb-8">
        <p className="text-white/50 text-sm font-medium mb-2">Current Balance</p>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-bold text-white">
            {loading ? "—" : balance.toLocaleString()}
          </span>
          <span className="text-amber-400 text-lg font-medium mb-1">credits</span>
        </div>
        <p className="text-white/30 text-xs mt-2">
          Credits are used for scraping (1/lead), verification (1/lead), and personalization (2/lead)
        </p>
      </div>

      {/* Purchase packs */}
      <h2 className="text-white font-semibold mb-4">Purchase Credits</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {CREDIT_PACKS.map(pack => (
          <div
            key={pack.id}
            className={`relative border rounded-2xl p-5 flex flex-col gap-3 ${
              pack.id === "pack_5000"
                ? "border-orange-500/40 bg-orange-500/8"
                : "border-white/8 bg-white/4 hover:bg-white/6"
            } transition-colors`}
          >
            {pack.id === "pack_5000" && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-orange-500 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                Best value
              </span>
            )}
            <div>
              <p className="text-2xl font-bold text-white">{pack.credits.toLocaleString()}</p>
              <p className="text-white/40 text-sm">credits</p>
            </div>
            {pack.label && <p className="text-white/50 text-xs">{pack.label}</p>}
            <p className="text-white/60 text-sm">${pack.price_usd} <span className="text-white/30 text-xs">one-time</span></p>
            <button
              onClick={() => handlePurchase(pack.id)}
              disabled={!!purchasing}
              className={`mt-auto py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                pack.id === "pack_5000"
                  ? "bg-orange-500 hover:bg-orange-400 text-white"
                  : "bg-white/8 hover:bg-white/12 text-white"
              }`}
            >
              {purchasing === pack.id ? "Loading..." : "Buy"}
            </button>
          </div>
        ))}
      </div>

      {/* Cost reference */}
      <div className="bg-white/3 border border-white/8 rounded-xl p-4 mb-8">
        <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Credit Costs</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Scrape only",          cost: "1 cr / lead", color: "text-violet-400" },
            { label: "Verify + Personalize", cost: "3 cr / lead", color: "text-amber-400"  },
            { label: "Full Suite",           cost: "4 cr / lead", color: "text-orange-400"   },
          ].map(r => (
            <div key={r.label}>
              <p className={`text-lg font-bold ${r.color}`}>{r.cost}</p>
              <p className="text-white/40 text-xs mt-0.5">{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      <h2 className="text-white font-semibold mb-4">Transaction History</h2>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-white/4 rounded-xl animate-pulse" />)}</div>
      ) : transactions.length === 0 ? (
        <p className="text-white/30 text-sm py-8 text-center border border-white/8 rounded-xl">No transactions yet</p>
      ) : (
        <div className="border border-white/8 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left text-white/40 font-medium px-4 py-3">Date</th>
                <th className="text-left text-white/40 font-medium px-4 py-3">Type</th>
                <th className="text-left text-white/40 font-medium px-4 py-3">Description</th>
                <th className="text-right text-white/40 font-medium px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr key={tx.id} className={`${i !== transactions.length - 1 ? "border-b border-white/5" : ""}`}>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${TX_COLORS[tx.type] ?? "text-white/50"}`}>{TX_LABELS[tx.type] ?? tx.type}</span>
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs truncate max-w-xs">{tx.description ?? "—"}</td>
                  <td className={`px-4 py-3 text-right font-semibold text-sm ${isDebitType(tx.type) ? "text-red-400" : "text-emerald-400"}`}>
                    {isDebitType(tx.type) ? "-" : "+"}{Math.abs(tx.amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
