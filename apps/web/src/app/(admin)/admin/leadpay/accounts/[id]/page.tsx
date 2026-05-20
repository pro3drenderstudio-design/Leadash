"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { LeadPayAccount, LeadPayBankAccount } from "@/types/leadpay";

const KYC_COLORS: Record<string, string> = {
  unverified:      "bg-white/10 text-white/40",
  pending:         "bg-yellow-500/15 text-yellow-400",
  verified:        "bg-green-500/15 text-green-400",
  rejected:        "bg-red-500/15 text-red-400",
  needs_more_info: "bg-orange-500/15 text-orange-400",
};

export default function AdminLeadPayAccountDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [account, setAccount]     = useState<(LeadPayAccount & { workspace?: { name: string }; bank_accounts?: LeadPayBankAccount[] }) | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setBusy]     = useState(false);
  const [rejectReason, setReject] = useState("");
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/leadpay/accounts/${id}`)
      .then(async r => {
        const d = await r.json() as { account?: LeadPayAccount & { workspace?: { name: string }; bank_accounts?: LeadPayBankAccount[] }; error?: string };
        if (!r.ok || !d.account) {
          setLoadError(d.error ?? `HTTP ${r.status}`);
        } else {
          setAccount(d.account);
        }
      })
      .catch(e => setLoadError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  async function action(act: string, extra?: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/leadpay/accounts/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: act, ...extra }),
    });
    const d = await res.json() as { account?: LeadPayAccount };
    if (d.account) setAccount(prev => prev ? { ...prev, ...d.account } : prev);
    setBusy(false);
    setShowReject(false);
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}</div>;
  }
  if (!account) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 text-center space-y-2">
        <p className="text-white/40">Account not found</p>
        {loadError && <p className="text-red-400/70 text-xs font-mono">{loadError}</p>}
      </div>
    );
  }

  const name = account.business_name ?? [account.legal_first_name, account.legal_last_name].filter(Boolean).join(" ") ?? "—";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg font-bold text-indigo-400">
              {name[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">{name}</h1>
              <p className="text-xs text-white/40">{account.workspace?.name ?? account.workspace_id}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${KYC_COLORS[account.kyc_status] ?? "bg-white/10 text-white/40"}`}>
            KYC: {account.kyc_status}
          </span>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
            account.status === "active" ? "bg-green-500/15 text-green-400" :
            account.status === "suspended" ? "bg-red-500/15 text-red-400" : "bg-white/10 text-white/40"
          }`}>
            {account.status}
          </span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4">
        {[
          ["Account Type", account.account_type],
          ["USD Balance",  `$${(account.usd_balance_cents / 100).toFixed(2)}`],
          ["Pending",      `$${(account.usd_pending_cents / 100).toFixed(2)}`],
          ["Date of Birth", account.date_of_birth ?? "—"],
          ["Phone",        account.phone ?? "—"],
          ["KYC Submitted", account.kyc_submitted_at ? new Date(account.kyc_submitted_at).toLocaleDateString() : "—"],
          ["Created",      new Date(account.created_at).toLocaleDateString()],
          ["RC Number",    account.rc_number ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="bg-white/4 rounded-xl p-4">
            <p className="text-xs text-white/40 mb-1">{label}</p>
            <p className="text-sm text-white font-medium">{value}</p>
          </div>
        ))}
      </div>

      {/* KYC rejection reason */}
      {account.kyc_rejection_reason && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-red-400 font-medium mb-1">Rejection Reason</p>
          <p className="text-sm text-white/80">{account.kyc_rejection_reason}</p>
        </div>
      )}

      {/* Bank accounts */}
      {account.bank_accounts && account.bank_accounts.length > 0 && (
        <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8">
            <p className="text-sm font-medium text-white">Bank Accounts</p>
          </div>
          <div className="divide-y divide-white/5">
            {account.bank_accounts.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-white">{b.account_name}</p>
                  <p className="text-xs text-white/40">{b.bank_name} — {b.account_number}</p>
                </div>
                {b.is_default && <span className="text-xs text-green-400">Default</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white/4 rounded-2xl border border-white/8 p-5 space-y-3">
        <p className="text-sm font-medium text-white mb-4">Actions</p>

        {account.kyc_status === "pending" && (
          <div className="flex gap-3">
            <button
              onClick={() => action("approve_kyc")}
              disabled={actionBusy}
              className="flex-1 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors"
            >
              Approve KYC
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={actionBusy}
              className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              Reject KYC
            </button>
          </div>
        )}

        {showReject && (
          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={e => setReject(e.target.value)}
              placeholder="Reason for rejection…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-red-400/50 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => action("reject_kyc", { rejection_reason: rejectReason })}
                disabled={actionBusy || !rejectReason.trim()}
                className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
              <button onClick={() => setShowReject(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/50 text-sm hover:bg-white/10">
                Cancel
              </button>
            </div>
          </div>
        )}

        {account.status === "active" ? (
          <button
            onClick={() => action("suspend")}
            disabled={actionBusy}
            className="w-full py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/25 text-orange-400 text-sm font-medium hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
          >
            Suspend Account
          </button>
        ) : account.status === "suspended" ? (
          <button
            onClick={() => action("activate")}
            disabled={actionBusy}
            className="w-full py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors"
          >
            Reactivate Account
          </button>
        ) : null}
      </div>
    </div>
  );
}
