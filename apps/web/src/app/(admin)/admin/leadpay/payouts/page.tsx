"use client";

import { useEffect, useState, useCallback } from "react";
import { Suspense } from "react";
import type { LeadPayPayout } from "@/types/leadpay";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-500/15 text-yellow-400",
  processing: "bg-blue-500/15 text-blue-400",
  completed:  "bg-green-500/15 text-green-400",
  failed:     "bg-red-500/15 text-red-400",
};

interface PayoutWithMeta extends LeadPayPayout {
  account?: { legal_first_name: string | null; legal_last_name: string | null; business_name: string | null; workspace_id: string };
}

function PayoutsInner() {
  const [payouts, setPayouts]     = useState<PayoutWithMeta[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatus] = useState("all");
  const [page, setPage]           = useState(1);
  const [actingOn, setActingOn]   = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res  = await fetch(`/api/admin/leadpay/payouts?${params}`);
    const data = await res.json() as { payouts: PayoutWithMeta[]; total: number };
    setPayouts(data.payouts);
    setTotal(data.total);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  async function doAction(id: string, action: string, extra?: Record<string, unknown>) {
    setActingOn(id);
    await fetch(`/api/admin/leadpay/payouts/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, ...extra }),
    });
    setActingOn(null);
    load();
  }

  const displayName = (p: PayoutWithMeta) =>
    p.account?.business_name ?? [p.account?.legal_first_name, p.account?.legal_last_name].filter(Boolean).join(" ") ?? "—";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Payouts</h1>
          <p className="text-white/40 text-sm mt-1">{total} total</p>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending Approval</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
        {loading ? (
          <div className="space-y-px">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-white/3 animate-pulse" />)}</div>
        ) : payouts.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">No payouts found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {payouts.map(p => (
              <div key={p.id} className="px-5 py-4 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{displayName(p)}</p>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[p.status] ?? "bg-white/10 text-white/40"}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {p.bank_account?.bank_name} — {p.bank_account?.account_number}
                    </p>
                    <p className="text-xs text-white/30 font-mono mt-0.5">{p.reference}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-white">${(p.usd_amount_cents / 100).toFixed(2)}</p>
                    <p className="text-xs text-white/40">₦{(p.ngn_amount_kobo / 100).toLocaleString("en-NG")}</p>
                    <p className="text-xs text-white/25">@ {p.fx_rate.toFixed(2)}</p>
                  </div>
                </div>

                {p.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => doAction(p.id, "approve")}
                      disabled={actingOn === p.id}
                      className="px-4 py-1.5 rounded-lg bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectModal({ id: p.id }); setRejectReason(""); }}
                      disabled={actingOn === p.id}
                      className="px-4 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {p.status === "processing" && (
                  <button
                    onClick={() => doAction(p.id, "complete")}
                    disabled={actingOn === p.id}
                    className="px-4 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs font-medium hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold text-white">Reject Payout</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  doAction(rejectModal.id, "reject", { rejection_reason: rejectReason });
                  setRejectModal(null);
                }}
                disabled={!rejectReason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 disabled:opacity-50"
              >
                Reject & Refund
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/50 text-sm hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPayoutsPage() {
  return <Suspense><PayoutsInner /></Suspense>;
}
