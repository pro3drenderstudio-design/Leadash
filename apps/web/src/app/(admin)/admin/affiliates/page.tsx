"use client";
import { useEffect, useState } from "react";

interface Affiliate {
  id: string;
  handle: string;
  tier: "bronze" | "silver" | "gold";
  clicks: number;
  signups: number;
  paid_referrals: number;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  created_at: string;
  workspaces?: { name: string; billing_email: string | null };
}

interface Payout {
  id: string;
  amount_ngn: number;
  method: "bank" | "credit";
  credit_multiplier: number | null;
  destination: Record<string, string>;
  status: string;
  fraud_flag: boolean;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  affiliates?: {
    handle: string;
    tier: string;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    workspaces?: { name: string; billing_email: string | null };
  };
}

const TIER_COLORS: Record<string, string> = { bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700" };
function fmt(n: number) { return `₦${Math.floor(n).toLocaleString()}`; }

export default function AdminAffiliatesPage() {
  const [tab, setTab]             = useState<"affiliates" | "payouts">("payouts");
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [payouts, setPayouts]     = useState<Payout[]>([]);
  const [payoutStatus, setPayoutStatus] = useState("queued");
  const [loading, setLoading]     = useState(false);
  const [acting, setActing]       = useState<string | null>(null);
  const [actionResult, setActionResult] = useState("");

  async function load() {
    setLoading(true);
    if (tab === "affiliates") {
      const res = await fetch("/api/admin/affiliates");
      const d   = await res.json();
      setAffiliates(d.affiliates ?? []);
    } else {
      const res = await fetch(`/api/admin/affiliates/payouts?status=${payoutStatus}`);
      const d   = await res.json();
      setPayouts(d.payouts ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [tab, payoutStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(payoutId: string, action: "approve" | "hold" | "reject") {
    setActing(payoutId);
    setActionResult("");
    const res = await fetch("/api/admin/affiliates/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payout_id: payoutId, action }),
    });
    const d = await res.json();
    setActing(null);
    if (d.ok) { setActionResult(`Payout ${action}d`); load(); }
    else setActionResult(d.error ?? "Error");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-2">Affiliate Program</h1>
      <p className="text-white/40 text-sm mb-6">Manage affiliate accounts, payout queue, and fraud flags.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["payouts", "affiliates"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-orange-500 text-white" : "bg-white/6 text-white/50 hover:text-white"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {actionResult && <p className="text-sm text-green-400 mb-4">{actionResult}</p>}

      {/* Payouts tab */}
      {tab === "payouts" && (
        <div>
          <div className="flex gap-2 mb-4">
            {["queued","processing","paid","held"].map(s => (
              <button key={s} onClick={() => setPayoutStatus(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${payoutStatus === s ? "bg-orange-500/20 border-orange-500/40 text-orange-300" : "border-white/10 text-white/40 hover:text-white"}`}>
                {s}
              </button>
            ))}
          </div>
          {loading ? <p className="text-white/40 text-sm">Loading…</p> : payouts.length === 0 ? (
            <p className="text-white/30 text-sm">No {payoutStatus} payouts.</p>
          ) : (
            <div className="space-y-3">
              {payouts.map(p => (
                <div key={p.id} className="bg-white/4 border border-white/8 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-bold text-sm">{fmt(p.amount_ngn)}</span>
                        <span className="text-white/40 text-xs">{p.method === "bank" ? "Bank transfer" : `Credit ×${p.credit_multiplier}`}</span>
                        {p.fraud_flag && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">FRAUD FLAG</span>}
                      </div>
                      <p className="text-white/60 text-xs mb-0.5">
                        Handle: <strong className="text-white">{p.affiliates?.handle}</strong>
                        {" · "}Tier: <span style={{ color: TIER_COLORS[p.affiliates?.tier ?? "bronze"] }}>{p.affiliates?.tier}</span>
                      </p>
                      {p.method === "bank" && (
                        <p className="text-white/40 text-xs">
                          {p.affiliates?.bank_name} · {p.affiliates?.bank_account_number} · {p.affiliates?.bank_account_name}
                        </p>
                      )}
                      {p.method === "credit" && (
                        <p className="text-white/40 text-xs">Workspace: {p.affiliates?.workspaces?.name}</p>
                      )}
                      <p className="text-white/30 text-xs mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    {p.status === "queued" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleAction(p.id, "approve")}
                          disabled={acting === p.id}
                          className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 text-green-300 text-xs font-semibold rounded-lg transition-colors"
                        >
                          {acting === p.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleAction(p.id, "hold")}
                          disabled={acting === p.id}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Hold
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Affiliates tab */}
      {tab === "affiliates" && (
        <div>
          {loading ? <p className="text-white/40 text-sm">Loading…</p> : affiliates.length === 0 ? (
            <p className="text-white/30 text-sm">No affiliates yet.</p>
          ) : (
            <div className="space-y-2">
              {affiliates.map(a => (
                <div key={a.id} className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white font-semibold text-sm">{a.handle}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: `${TIER_COLORS[a.tier]}20`, color: TIER_COLORS[a.tier] }}>{a.tier}</span>
                    </div>
                    <p className="text-white/40 text-xs">{a.workspaces?.name} · {a.workspaces?.billing_email}</p>
                  </div>
                  <div className="flex gap-5 text-center">
                    {[["Clicks", a.clicks], ["Signups", a.signups], ["Paid", a.paid_referrals]].map(([l, v]) => (
                      <div key={String(l)}>
                        <p className="text-[10px] text-white/30 mb-0.5">{l}</p>
                        <p className="text-white font-bold text-sm">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
