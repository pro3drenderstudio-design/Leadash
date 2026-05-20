"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface Account {
  id:              string;
  workspace_id:    string;
  account_type:    string;
  status:          string;
  kyc_status:      string;
  legal_first_name: string | null;
  legal_last_name:  string | null;
  business_name:    string | null;
  usd_balance_cents: number;
  kyc_submitted_at:  string | null;
  created_at:        string;
  workspace?: { name: string };
}

const KYC_COLORS: Record<string, string> = {
  unverified: "bg-white/10 text-white/40",
  pending:    "bg-yellow-500/15 text-yellow-400",
  verified:   "bg-green-500/15 text-green-400",
  rejected:   "bg-red-500/15 text-red-400",
  needs_more_info: "bg-orange-500/15 text-orange-400",
};

function AccountsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState(searchParams.get("search") ?? "");
  const [kycFilter, setKycFilter] = useState(searchParams.get("kyc") ?? "all");
  const [page, setPage]         = useState(1);
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search)              params.set("search",     search);
    if (kycFilter !== "all") params.set("kyc_status", kycFilter);
    const res  = await fetch(`/api/admin/leadpay/accounts?${params}`);
    const data = await res.json() as { accounts: Account[]; total: number };
    setAccounts(data.accounts);
    setTotal(data.total);
    setLoading(false);
  }, [page, search, kycFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, kycFilter]);

  const displayName = (a: Account) =>
    a.business_name ?? [a.legal_first_name, a.legal_last_name].filter(Boolean).join(" ") ?? "—";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">LeadPay Accounts</h1>
          <p className="text-white/40 text-sm mt-1">{total} accounts total</p>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search name or business…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
        <select
          value={kycFilter}
          onChange={e => setKycFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">All KYC</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
        {loading ? (
          <div className="space-y-px">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-white/3 animate-pulse" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">No accounts found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {accounts.map(a => (
              <Link key={a.id} href={`/admin/leadpay/accounts/${a.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400 flex-shrink-0">
                  {displayName(a)[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{displayName(a)}</p>
                  <p className="text-xs text-white/40 mt-0.5">{a.workspace?.name ?? a.workspace_id}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white">${(a.usd_balance_cents / 100).toFixed(2)}</p>
                  <p className="text-xs text-white/30">balance</p>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium shrink-0 ${KYC_COLORS[a.kyc_status] ?? "bg-white/10 text-white/40"}`}>
                  {a.kyc_status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {Math.ceil(total / PAGE_SIZE) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 disabled:opacity-30">Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={page>=Math.ceil(total/PAGE_SIZE)}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLeadPayAccountsPage() {
  return <Suspense><AccountsInner /></Suspense>;
}
