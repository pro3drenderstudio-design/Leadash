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

interface ProgramSettings {
  affiliate_commission_type: string;
  affiliate_commission_fixed_ngn: string;
  affiliate_recurring_months: string;
  affiliate_cookie_days: string;
  affiliate_min_payout_ngn: string;
  affiliate_hold_days: string;
  affiliate_silver_threshold: string;
  affiliate_gold_threshold: string;
  affiliate_bronze_rate: string;
  affiliate_silver_rate: string;
  affiliate_gold_rate: string;
}

const DEFAULT_SETTINGS: ProgramSettings = {
  affiliate_commission_type: "percent",
  affiliate_commission_fixed_ngn: "2000",
  affiliate_recurring_months: "0",
  affiliate_cookie_days: "30",
  affiliate_min_payout_ngn: "20000",
  affiliate_hold_days: "45",
  affiliate_silver_threshold: "10",
  affiliate_gold_threshold: "25",
  affiliate_bronze_rate: "0.20",
  affiliate_silver_rate: "0.25",
  affiliate_gold_rate: "0.30",
};

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
  // Program settings state
  const [settings,     setSettings]    = useState<ProgramSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving,  setSettingsSaving]  = useState(false);

  // Aggregate stats derived from loaded data
  const heldCount   = payouts.filter(p => p.fraud_flag).length;
  const cleanTotal  = payouts.filter(p => p.status === "queued" && !p.fraud_flag).reduce((s, p) => s + p.amount_ngn, 0);
  const fraudCount  = affiliates.filter(a => false /* fraud_flags join TBD */).length; // placeholder

  async function load() {
    setLoading(true);
    try {
      if (tab === "affiliates") {
        const q   = search ? `?q=${encodeURIComponent(search)}` : "";
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

  useEffect(() => {
    if (tab === "settings" && !settingsLoaded) {
      fetch("/api/admin/settings")
        .then(r => r.json() as Promise<{ settings?: Record<string, unknown> }>)
        .then(d => {
          if (!d.settings) return;
          const s = d.settings;
          setSettings(prev => ({
            ...prev,
            ...(s.affiliate_commission_type      !== undefined ? { affiliate_commission_type:      String(s.affiliate_commission_type) }      : {}),
            ...(s.affiliate_commission_fixed_ngn !== undefined ? { affiliate_commission_fixed_ngn: String(s.affiliate_commission_fixed_ngn) } : {}),
            ...(s.affiliate_recurring_months     !== undefined ? { affiliate_recurring_months:     String(s.affiliate_recurring_months) }     : {}),
            ...(s.affiliate_cookie_days          !== undefined ? { affiliate_cookie_days:          String(s.affiliate_cookie_days) }          : {}),
            ...(s.affiliate_min_payout_ngn       !== undefined ? { affiliate_min_payout_ngn:       String(s.affiliate_min_payout_ngn) }       : {}),
            ...(s.affiliate_hold_days            !== undefined ? { affiliate_hold_days:            String(s.affiliate_hold_days) }            : {}),
            ...(s.affiliate_silver_threshold     !== undefined ? { affiliate_silver_threshold:     String(s.affiliate_silver_threshold) }     : {}),
            ...(s.affiliate_gold_threshold       !== undefined ? { affiliate_gold_threshold:       String(s.affiliate_gold_threshold) }       : {}),
            ...(s.affiliate_bronze_rate          !== undefined ? { affiliate_bronze_rate:          String(s.affiliate_bronze_rate) }          : {}),
            ...(s.affiliate_silver_rate          !== undefined ? { affiliate_silver_rate:          String(s.affiliate_silver_rate) }          : {}),
            ...(s.affiliate_gold_rate            !== undefined ? { affiliate_gold_rate:            String(s.affiliate_gold_rate) }            : {}),
          }));
          setSettingsLoaded(true);
        });
    }
  }, [tab, settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSettings() {
    setSettingsSaving(true);
    const body: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(settings)) {
      body[k] = k === "affiliate_commission_type" ? v : Number(v);
    }
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    setSettingsSaving(false);
    showToast(d.ok ? "Settings saved" : (d.error ?? "Error saving settings"));
  }

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
              <p className="text-xs text-white/40">Affiliates earn on every offer and subscription payment. Set how much.</p>
            </div>
            <div className="divide-y divide-white/6">
              {/* Commission type */}
              <div className="flex items-center justify-between px-5 py-3 gap-4">
                <label className="text-sm text-white/70 flex-1">Commission type</label>
                <select
                  value={settings.affiliate_commission_type}
                  onChange={e => setSettings(prev => ({ ...prev, affiliate_commission_type: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500/50"
                >
                  <option value="percent">Percentage of payment</option>
                  <option value="fixed">Fixed amount per payment</option>
                </select>
              </div>
              {/* Fixed amount — only shown when type=fixed */}
              {settings.affiliate_commission_type === "fixed" && (
                <div className="flex items-center justify-between px-5 py-3 gap-4">
                  <label className="text-sm text-white/70 flex-1">Fixed commission (₦)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/40">₦</span>
                    <input
                      type="number"
                      value={settings.affiliate_commission_fixed_ngn}
                      onChange={e => setSettings(prev => ({ ...prev, affiliate_commission_fixed_ngn: e.target.value }))}
                      className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-right outline-none focus:border-orange-500/50"
                    />
                  </div>
                </div>
              )}
              {/* Numeric settings */}
              {([
                { key: "affiliate_recurring_months", label: "Commission window (months, 0 = lifetime)", unit: "mo" },
                { key: "affiliate_cookie_days",      label: "Cookie lifetime (days)",                  unit: "days" },
              ] as const).map(row => (
                <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-4">
                  <label className="text-sm text-white/70 flex-1">{row.label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={settings[row.key]}
                      onChange={e => setSettings(prev => ({ ...prev, [row.key]: e.target.value }))}
                      className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-right outline-none focus:border-orange-500/50"
                    />
                    <span className="text-xs text-white/40">{row.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tiers */}
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-sm font-bold text-white">Commission tiers</p>
              <p className="text-xs text-white/40">Rates as decimals (e.g. 0.20 = 20%). Thresholds are paid-referral counts.</p>
            </div>
            <div className="divide-y divide-white/6">
              {([
                { key: "affiliate_bronze_rate",      label: "Bronze rate",           color: TIER_CLR.bronze },
                { key: "affiliate_silver_threshold", label: "Silver threshold (paid referrals)", color: TIER_CLR.silver },
                { key: "affiliate_silver_rate",      label: "Silver rate",           color: TIER_CLR.silver },
                { key: "affiliate_gold_threshold",   label: "Gold threshold (paid referrals)", color: TIER_CLR.gold },
                { key: "affiliate_gold_rate",        label: "Gold rate",             color: TIER_CLR.gold },
              ] as const).map(row => (
                <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-4">
                  <label className="text-sm flex-1" style={{ color: row.color }}>{row.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings[row.key]}
                    onChange={e => setSettings(prev => ({ ...prev, [row.key]: e.target.value }))}
                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-right outline-none focus:border-orange-500/50"
                  />
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
              {([
                { key: "affiliate_min_payout_ngn", label: "Minimum payout (₦)",        unit: "₦" },
                { key: "affiliate_hold_days",       label: "Refund hold period (days)", unit: "days" },
              ] as const).map(row => (
                <div key={row.key} className="flex items-center justify-between px-5 py-3 gap-4">
                  <label className="text-sm text-white/70 flex-1">{row.label}</label>
                  <div className="flex items-center gap-1.5">
                    {row.unit === "₦" && <span className="text-xs text-white/40">₦</span>}
                    <input
                      type="number"
                      value={settings[row.key]}
                      onChange={e => setSettings(prev => ({ ...prev, [row.key]: e.target.value }))}
                      className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-right outline-none focus:border-orange-500/50"
                    />
                    {row.unit !== "₦" && <span className="text-xs text-white/40">{row.unit}</span>}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-white/70">Self-referral detection</span>
                <span className="text-sm font-bold text-green-400">Enabled — block + flag</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveSettings}
              disabled={settingsSaving}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-500/90 transition-colors disabled:opacity-40"
            >
              {settingsSaving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
