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
    handle: string; tier: string;
    bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null;
    workspaces?: { name: string; billing_email: string | null };
  };
}

const TIER_CLR: Record<string, string> = { bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700" };
function fmt(n: number) { return `₦${Math.floor(n).toLocaleString()}`; }

function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    queued:     ["rgba(148,163,184,0.12)", "#94A3B8"],
    processing: ["rgba(96,165,250,0.12)",  "#60A5FA"],
    paid:       ["rgba(52,211,153,0.12)",  "#34D399"],
    held:       ["rgba(251,191,36,0.12)",  "#FBBF24"],
  };
  const [bg, cl] = map[status] ?? map.queued;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: cl, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function TierChip({ tier }: { tier: string }) {
  const c = TIER_CLR[tier] ?? "#94A3B8";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${c}18`, border: `1px solid ${c}30`, color: c, textTransform: "capitalize" }}>
      {tier}
    </span>
  );
}

type Tab = "affiliates" | "payouts" | "settings";

export default function AdminAffiliatesPage() {
  const [tab,          setTab]         = useState<Tab>("payouts");
  const [affiliates,   setAffiliates]  = useState<Affiliate[]>([]);
  const [payouts,      setPayouts]     = useState<Payout[]>([]);
  const [payoutStatus, setPayoutStatus]= useState("queued");
  const [loading,      setLoading]     = useState(false);
  const [acting,       setActing]      = useState<string | null>(null);
  const [toast,        setToast]       = useState("");
  const [search,       setSearch]      = useState("");

  // Aggregate stats derived from loaded data
  const heldCount   = payouts.filter(p => p.fraud_flag).length;
  const cleanTotal  = payouts.filter(p => p.status === "queued" && !p.fraud_flag).reduce((s, p) => s + p.amount_ngn, 0);
  const fraudCount  = affiliates.filter(a => false /* fraud_flags join TBD */).length; // placeholder

  async function load() {
    setLoading(true);
    try {
      if (tab === "affiliates") {
        const q   = search ? `?search=${encodeURIComponent(search)}` : "";
        const res = await fetch(`/api/admin/affiliates${q}`);
        const d   = await res.json() as { affiliates?: Affiliate[] };
        setAffiliates(d.affiliates ?? []);
      } else if (tab === "payouts") {
        const res = await fetch(`/api/admin/affiliates/payouts?status=${payoutStatus}`);
        const d   = await res.json() as { payouts?: Payout[] };
        setPayouts(d.payouts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab, payoutStatus, search]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function handleAction(payoutId: string, action: "approve" | "hold" | "reject") {
    setActing(payoutId);
    const res = await fetch("/api/admin/affiliates/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payout_id: payoutId, action }),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    setActing(null);
    if (d.ok) { showToast(`Payout ${action}d`); load(); }
    else showToast(d.error ?? "Error");
  }

  async function approveAllClean() {
    const clean = payouts.filter(p => p.status === "queued" && !p.fraud_flag);
    for (const p of clean) await handleAction(p.id, "approve");
  }

  const card = "bg-white/4 border border-white/8 rounded-xl";

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-white">Affiliate Program</h1>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 uppercase tracking-wide">Live</span>
          </div>
          <p className="text-white/40 text-sm">Manage affiliate accounts, payout queue, and program configuration.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/6 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            Program settings
          </button>
          <button
            onClick={approveAllClean}
            disabled={cleanTotal === 0}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-500/90 transition-colors disabled:opacity-40"
          >
            Run payouts{cleanTotal > 0 ? ` — ${fmt(cleanTotal)}` : ""}
          </button>
        </div>
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Affiliates",       value: affiliates.length > 0 ? String(affiliates.length) : "—",  color: "text-white" },
          { label: "Revenue driven",   value: "—",       color: "text-white" },
          { label: "Pending liability",value: fmt(payouts.filter(p => p.status === "queued").reduce((s,p) => s+p.amount_ngn, 0)), color: "text-amber-400" },
          { label: "Paid out",         value: fmt(payouts.filter(p => p.status === "paid").reduce((s,p) => s+p.amount_ngn, 0)), color: "text-green-400" },
          { label: "Fraud flags",      value: String(heldCount),  color: heldCount > 0 ? "text-red-400" : "text-white/30" },
        ].map(t => (
          <div key={t.label} className={`${card} p-4`}>
            <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">{t.label}</p>
            <p className={`text-xl font-bold ${t.color} tabular-nums`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-5 border-b border-white/8 pb-0">
        {(["payouts","affiliates","settings"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg -mb-px transition-colors ${
              tab === t
                ? "bg-white/6 border border-b-transparent border-white/10 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {t === "payouts" ? "Payout queue" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {toast && <p className="text-sm text-green-400 mb-4">{toast}</p>}

      {/* ── Payout queue tab ── */}
      {tab === "payouts" && (
        <div>
          {/* Fraud warning banner */}
          {heldCount > 0 && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 mb-4">
              <span className="text-amber-400 text-sm font-semibold">⚠ {heldCount} payout{heldCount > 1 ? "s are" : " is"} held for fraud review — resolve before running batch.</span>
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5">
              {["queued","processing","paid","held"].map(s => (
                <button key={s} onClick={() => setPayoutStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    payoutStatus === s
                      ? "bg-orange-500/15 border-orange-500/35 text-orange-300"
                      : "border-white/8 text-white/35 hover:text-white hover:border-white/20"
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {payoutStatus === "queued" && cleanTotal > 0 && (
              <button onClick={approveAllClean} className="text-xs font-bold text-green-400 hover:text-green-300 transition-colors">
                Approve all clean · {fmt(cleanTotal)}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-white/40 text-sm">Loading…</p>
          ) : payouts.length === 0 ? (
            <div className={`${card} px-6 py-12 text-center`}>
              <p className="text-white/30 text-sm">No {payoutStatus} payouts.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payouts.map(p => (
                <div key={p.id} className={`${card} p-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <span className="text-white font-bold text-[15px] tabular-nums">{fmt(p.amount_ngn)}</span>
                        <span className="text-white/40 text-xs">{p.method === "bank" ? "Bank transfer" : `Credit ×${p.credit_multiplier ?? 1.25}`}</span>
                        <StatusChip status={p.status} />
                        {p.fraud_flag && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25">Fraud flag</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-white/50 text-xs">@{p.affiliates?.handle}</span>
                        {p.affiliates?.tier && <TierChip tier={p.affiliates.tier} />}
                        {p.affiliates?.workspaces?.name && <span className="text-white/35 text-xs">{p.affiliates.workspaces.name}</span>}
                      </div>
                      {p.method === "bank" && p.affiliates?.bank_name && (
                        <p className="text-white/30 text-xs">
                          {p.affiliates.bank_name} · {p.affiliates.bank_account_number} · {p.affiliates.bank_account_name}
                        </p>
                      )}
                      <p className="text-white/25 text-xs mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    {p.status === "queued" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleAction(p.id, "approve")}
                          disabled={acting === p.id}
                          className="px-3 py-1.5 bg-green-600/15 hover:bg-green-600/25 border border-green-600/35 text-green-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
                        >
                          {acting === p.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleAction(p.id, "hold")}
                          disabled={acting === p.id}
                          className="px-3 py-1.5 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
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

      {/* ── Affiliates tab ── */}
      {tab === "affiliates" && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by handle or workspace…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/25 max-w-xs"
            />
          </div>

          {loading ? (
            <p className="text-white/40 text-sm">Loading…</p>
          ) : affiliates.length === 0 ? (
            <div className={`${card} px-6 py-12 text-center`}>
              <p className="text-white/30 text-sm">No affiliates{search ? " matching your search" : " yet"}.</p>
            </div>
          ) : (
            <div className={`${card} overflow-hidden`}>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-2.5 border-b border-white/8">
                {["Affiliate","Tier","Clicks","Signups","Paid ref.","Joined"].map(h => (
                  <p key={h} className="text-[10px] font-bold text-white/30 uppercase tracking-widest text-right first:text-left">{h}</p>
                ))}
              </div>
              {affiliates.map((a, i) => (
                <div key={a.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-3 ${i < affiliates.length - 1 ? "border-b border-white/6" : ""} hover:bg-white/3 transition-colors`}>
                  <div>
                    <p className="text-white text-sm font-semibold">@{a.handle}</p>
                    <p className="text-white/40 text-xs">{a.workspaces?.name}{a.workspaces?.billing_email ? ` · ${a.workspaces.billing_email}` : ""}</p>
                  </div>
                  <TierChip tier={a.tier} />
                  <p className="text-white/70 text-sm text-right tabular-nums">{a.clicks.toLocaleString()}</p>
                  <p className="text-white/70 text-sm text-right tabular-nums">{a.signups.toLocaleString()}</p>
                  <p className="text-white text-sm font-semibold text-right tabular-nums">{a.paid_referrals.toLocaleString()}</p>
                  <p className="text-white/30 text-xs text-right">{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Program settings tab ── */}
      {tab === "settings" && (
        <div className="space-y-6 max-w-2xl">
          {/* Commission */}
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-sm font-bold text-white">Commission</p>
              <p className="text-xs text-white/40">Rates and attribution window applied to new referrals.</p>
            </div>
            <div className="divide-y divide-white/6">
              {[
                { label: "Bounty (first payment)",      value: "₦5,000" },
                { label: "Recurring window",            value: "12 months" },
                { label: "Cookie lifetime",             value: "30 days" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-white/70">{row.label}</span>
                  <span className="text-sm font-bold text-white">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tiers */}
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-sm font-bold text-white">Commission tiers</p>
            </div>
            <div className="divide-y divide-white/6">
              {([
                ["bronze", "Bronze", "0+ paid referrals", "20%"],
                ["silver", "Silver", "10+ paid referrals", "25%"],
                ["gold",   "Gold",   "25+ paid referrals", "30% + priority payouts"],
              ] as const).map(([key, name, req, rate]) => (
                <div key={key} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TIER_CLR[key] }} />
                    <span className="text-sm font-semibold" style={{ color: TIER_CLR[key] }}>{name}</span>
                    <span className="text-xs text-white/40">{req}</span>
                  </div>
                  <span className="text-sm font-bold text-white">{rate}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payout & safety */}
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-sm font-bold text-white">Payouts & safety</p>
            </div>
            <div className="divide-y divide-white/6">
              {[
                { label: "Minimum payout",         value: "₦20,000" },
                { label: "Refund hold period",     value: "45 days" },
                { label: "Credit payout multiplier",value: "1.25×" },
                { label: "Self-referral detection", value: "Enabled — block + flag" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-white/70">{row.label}</span>
                  <span className="text-sm font-bold text-white">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/25">These settings are hardcoded in the current release. Admin-editable config coming in a future update.</p>
        </div>
      )}
    </div>
  );
}
