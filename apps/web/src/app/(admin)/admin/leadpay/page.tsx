"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  total_accounts:   number;
  pending_kyc:      number;
  active_accounts:  number;
  pending_payouts:  number;
  total_volume_usd: number;
  transactions_24h: number;
}

export default function AdminLeadPayPage() {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/leadpay/dashboard")
      .then(r => r.ok ? r.json() as Promise<Stats> : null)
      .then(d => { if (d) setStats(d); })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: "Total Accounts",     value: loading ? "…" : String(stats?.total_accounts ?? 0),   href: "/admin/leadpay/accounts",     color: "text-blue-400"   },
    { label: "Pending KYC",        value: loading ? "…" : String(stats?.pending_kyc ?? 0),       href: "/admin/leadpay/accounts?kyc=pending", color: stats?.pending_kyc ? "text-yellow-400" : "text-green-400" },
    { label: "Pending Payouts",    value: loading ? "…" : String(stats?.pending_payouts ?? 0),   href: "/admin/leadpay/payouts?status=pending", color: stats?.pending_payouts ? "text-orange-400" : "text-green-400" },
    { label: "Volume (All Time)",  value: loading ? "…" : `$${((stats?.total_volume_usd ?? 0)).toLocaleString()}`, href: "/admin/leadpay/transactions", color: "text-purple-400" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="app-h1">LeadPay Overview</h1>
        <p className="text-white/50 text-sm mt-1">Payment service administration</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="bg-white/4 rounded-2xl border border-white/8 p-5 hover:bg-white/6 transition-colors">
            <p className="text-xs text-white/40 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/admin/leadpay/accounts?kyc=pending"
          className="bg-yellow-500/8 border border-yellow-500/20 rounded-2xl p-5 hover:bg-yellow-500/12 transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg">⏳</div>
            <p className="font-medium text-white">KYC Queue</p>
          </div>
          <p className="text-sm text-white/50">Review and approve pending identity verifications.</p>
        </Link>

        <Link href="/admin/leadpay/payouts?status=pending"
          className="bg-blue-500/8 border border-blue-500/20 rounded-2xl p-5 hover:bg-blue-500/12 transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-lg">💸</div>
            <p className="font-medium text-white">Payout Queue</p>
          </div>
          <p className="text-sm text-white/50">Approve or reject pending NGN withdrawal requests.</p>
        </Link>
      </div>
    </div>
  );
}
