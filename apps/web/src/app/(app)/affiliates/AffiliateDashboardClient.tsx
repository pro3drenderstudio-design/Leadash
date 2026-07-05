"use client";
import { useEffect, useState } from "react";
import { wsFetch } from "@/lib/workspace/client";

interface AffiliateData {
  id: string;
  handle: string;
  tier: "bronze" | "silver" | "gold";
  clicks: number;
  signups: number;
  paid_referrals: number;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  referral_url: string;
}

interface Earnings {
  available: number;
  pending: number;
  paid: number;
  total: number;
}

interface Payout {
  id: string;
  amount_ngn: number;
  method: "bank" | "credit";
  status: string;
  fraud_flag: boolean;
  created_at: string;
  paid_at: string | null;
}

const TIER_COLOR:  Record<string, string> = { bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700" };
const TIER_RATE:   Record<string, number> = { bronze: 20, silver: 25, gold: 30 };
const TIER_THRESH: Record<string, number> = { bronze: 0, silver: 10, gold: 25 };
const TIER_NEXT:   Record<string, { label: string; target: number } | null> = {
  bronze: { label: "Silver", target: 10 },
  silver: { label: "Gold",   target: 25 },
  gold:   null,
};

function fmt(n: number) { return `₦${Math.floor(n).toLocaleString()}`; }

function pct(a: number, b: number) {
  if (!b) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

const card: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" };
const inputSt: React.CSSProperties = { width: "100%", background: "var(--app-surface-strong)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--app-text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

export default function AffiliateDashboardClient() {
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [earnings,  setEarnings]  = useState<Earnings | null>(null);
  const [payouts,   setPayouts]   = useState<Payout[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [copied,    setCopied]    = useState(false);

  // Bank form
  const [editingBank, setEditingBank] = useState(false);
  const [bankName,    setBankName]    = useState("");
  const [bankAccNum,  setBankAccNum]  = useState("");
  const [bankAccName, setBankAccName] = useState("");
  const [bankSaving,  setBankSaving]  = useState(false);

  // Payout request
  const [payoutMethod,  setPayoutMethod]  = useState<"bank" | "credit">("bank");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError,   setPayoutError]   = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");

  useEffect(() => {
    Promise.all([
      wsFetch("/api/affiliates/me").then((r: Response) => r.json() as Promise<{ affiliate?: AffiliateData; earnings?: Earnings }>),
      wsFetch("/api/affiliates/payout").then((r: Response) => r.json() as Promise<{ payouts?: Payout[] }>),
    ]).then(([d, p]) => {
      setAffiliate(d.affiliate ?? null);
      setEarnings(d.earnings ?? null);
      setPayouts(p.payouts ?? []);
      if (d.affiliate) {
        setBankName(d.affiliate.bank_name ?? "");
        setBankAccNum(d.affiliate.bank_account_number ?? "");
        setBankAccName(d.affiliate.bank_account_name ?? "");
      }
    }).finally(() => setLoading(false));
  }, []);

  function copyLink() {
    if (!affiliate) return;
    navigator.clipboard.writeText(affiliate.referral_url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  async function saveBank() {
    setBankSaving(true);
    await wsFetch("/api/affiliates/me", { method: "PATCH", body: JSON.stringify({ bank_name: bankName, bank_account_number: bankAccNum, bank_account_name: bankAccName }) });
    setAffiliate(prev => prev ? { ...prev, bank_name: bankName, bank_account_number: bankAccNum, bank_account_name: bankAccName } : prev);
    setEditingBank(false);
    setBankSaving(false);
  }

  async function requestPayout() {
    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");
    const res  = await wsFetch("/api/affiliates/payout", { method: "POST", body: JSON.stringify({ method: payoutMethod }) });
    const data = await res.json() as { error?: string; amount_ngn?: number };
    if (data.error) {
      setPayoutError(data.error);
    } else {
      setPayoutSuccess(`Payout of ${fmt(data.amount_ngn ?? 0)} queued for review.`);
      // Clear available balance — commissions are now queued
      setEarnings(prev => prev ? { ...prev, available: 0 } : prev);
    }
    setPayoutLoading(false);
  }

  if (loading) return <div style={{ padding: 40, color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>;
  if (!affiliate || !earnings) return (
    <div style={{ padding: 40, color: "var(--app-text-muted)", fontSize: 13 }}>
      Unable to load your affiliate account. Please refresh the page.
    </div>
  );

  const tier      = affiliate.tier;
  const tierColor = TIER_COLOR[tier];
  const tierRate  = TIER_RATE[tier];
  const nextTier  = TIER_NEXT[tier];
  const progress  = nextTier
    ? Math.min(1, (affiliate.paid_referrals - TIER_THRESH[tier]) / (nextTier.target - TIER_THRESH[tier]))
    : 1;

  const creditValue = earnings.available * 1.25;

  return (
    <div className="v2-app" style={{ color: "var(--app-text)", padding: "0 0 80px" }}>

      {/* ── Hero ── */}
      <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid var(--app-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>Affiliate Program</h1>
              {/* Tier badge */}
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: `${tierColor}1A`, border: `1px solid ${tierColor}40`, color: tierColor, textTransform: "capitalize" }}>
                {tier} · {tierRate}%
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginBottom: 14 }}>
              Earn commissions for every customer you refer to Leadash.
            </p>

            {/* Referral link */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 540 }}>
              <code style={{ flex: 1, background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "var(--app-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {affiliate.referral_url}
              </code>
              <button onClick={copyLink} style={{ background: copied ? "rgba(52,211,153,0.15)" : "var(--app-accent)", color: copied ? "#34D399" : "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 6 }}>30-day cookie · anyone who signs up within 30 days is attributed to you</p>
          </div>

          {/* Tier progress */}
          {nextTier && (
            <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: "16px 20px", minWidth: 220 }}>
              <p style={{ ...label, marginBottom: 10 }}>Progress to {nextTier.label}</p>
              <div style={{ height: 6, background: "var(--app-border)", borderRadius: 999, marginBottom: 8 }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${Math.round(progress * 100)}%`, background: `linear-gradient(90deg, ${tierColor}, ${TIER_COLOR[nextTier.label.toLowerCase()]})` }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                <strong style={{ color: "var(--app-text)" }}>{affiliate.paid_referrals}</strong> of <strong style={{ color: "var(--app-text)" }}>{nextTier.target}</strong> paid referrals
                {" · "}<span style={{ color: TIER_COLOR[nextTier.label.toLowerCase()] }}>{nextTier.label} at {nextTier.target} → {TIER_RATE[nextTier.label.toLowerCase()]}%</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 4 stat tiles ── */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Available",       value: fmt(earnings.available), color: "#34D399", sub: "after 45-day hold" },
            { label: "Pending",         value: fmt(earnings.pending),   color: "#FBBF24", sub: "still in hold period" },
            { label: "Lifetime earned", value: fmt(earnings.total),     color: "var(--app-text)", sub: "all commissions" },
            { label: "Active referrals", value: String(affiliate.paid_referrals), color: "#60A5FA", sub: "converted to paid" },
          ].map(tile => (
            <div key={tile.label} style={{ ...card, padding: "16px 18px" }}>
              <p style={{ ...label, marginBottom: 8 }}>{tile.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: tile.color, fontVariantNumeric: "tabular-nums" }}>{tile.value}</p>
              <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 4 }}>{tile.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* Left: Funnel + Payout history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Funnel */}
          <div style={{ ...card, padding: 20 }}>
            <p style={{ ...label, marginBottom: 16 }}>Referral funnel</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { stage: "Clicks",    value: affiliate.clicks,          conv: null,                                    color: "#60A5FA" },
                { stage: "Signups",   value: affiliate.signups,         conv: pct(affiliate.signups, affiliate.clicks), color: "#A78BFA" },
                { stage: "Paid",      value: affiliate.paid_referrals,  conv: pct(affiliate.paid_referrals, affiliate.signups), color: "#34D399" },
              ].map((row, i, arr) => {
                const maxVal = arr[0].value || 1;
                const barW   = Math.max(4, Math.round((row.value / maxVal) * 100));
                return (
                  <div key={row.stage}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>{row.stage}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {row.conv && <span style={{ fontSize: 11, color: "var(--app-text-muted)", background: "var(--app-surface-strong)", padding: "2px 8px", borderRadius: 6 }}>{row.conv} conversion</span>}
                        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{row.value.toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: "var(--app-border)", borderRadius: 999 }}>
                      <div style={{ height: "100%", width: `${barW}%`, borderRadius: 999, background: row.color, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payout history */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
              <p style={label}>Payout history</p>
            </div>
            {payouts.length === 0 ? (
              <p style={{ padding: "20px 20px", fontSize: 13, color: "var(--app-text-muted)" }}>No payouts yet.</p>
            ) : (
              payouts.map(p => (
                <div key={p.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{fmt(p.amount_ngn)}</span>
                    <span style={{ color: "var(--app-text-muted)", marginLeft: 8, fontSize: 12 }}>{p.method === "bank" ? "Bank transfer" : "Credit ×1.25"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: p.status === "paid" ? "rgba(52,211,153,0.12)" : p.status === "held" ? "rgba(251,191,36,0.12)" : "rgba(148,163,184,0.1)",
                      color:      p.status === "paid" ? "#34D399"              : p.status === "held" ? "#FBBF24"              : "var(--app-text-muted)",
                    }}>{p.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Get paid + How you earn */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Get paid */}
          <div style={{ ...card, padding: 20 }}>
            <p style={{ ...label, marginBottom: 14 }}>Get paid</p>

            {/* Method picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {([
                { val: "bank",   head: "Cash to bank",           sub: "via Leadash Pay · 1–2 days" },
                { val: "credit", head: "Subscription credit",    sub: `₦${Math.floor(earnings.available).toLocaleString()} → ₦${Math.floor(creditValue).toLocaleString()} at 1.25×` },
              ] as const).map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setPayoutMethod(opt.val)}
                  style={{
                    padding: "12px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${payoutMethod === opt.val ? "var(--app-accent)" : "var(--app-border)"}`,
                    background: payoutMethod === opt.val ? "rgba(249,115,22,0.07)" : "var(--app-surface)",
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 700, color: payoutMethod === opt.val ? "var(--app-accent)" : "var(--app-text)", marginBottom: 2 }}>{opt.head}</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-muted)" }}>{opt.sub}</p>
                </button>
              ))}
            </div>

            {/* Bank details (show when cash selected) */}
            {payoutMethod === "bank" && (
              <div style={{ background: "var(--app-surface-strong)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                {!editingBank && affiliate.bank_name ? (
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "var(--app-text)" }}>{affiliate.bank_name} · {affiliate.bank_account_number}</span>
                    <span style={{ color: "var(--app-text-muted)" }}>{affiliate.bank_account_name}</span>
                    <button onClick={() => setEditingBank(true)} style={{ alignSelf: "flex-start", marginTop: 4, background: "none", border: "none", color: "var(--app-accent)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Edit bank details</button>
                  </div>
                ) : editingBank ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { lbl: "Bank name",     val: bankName,    set: setBankName,    ph: "e.g. Access Bank" },
                      { lbl: "Account number",val: bankAccNum,  set: setBankAccNum,  ph: "10-digit number" },
                      { lbl: "Account name",  val: bankAccName, set: setBankAccName, ph: "As on the account" },
                    ].map(f => (
                      <div key={f.lbl}>
                        <label style={{ fontSize: 10, color: "var(--app-text-muted)", display: "block", marginBottom: 3 }}>{f.lbl}</label>
                        <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ ...inputSt, fontSize: 12 }} />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveBank} disabled={bankSaving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {bankSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingBank(false)} style={{ background: "none", border: "1px solid var(--app-border)", borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer", color: "var(--app-text-muted)", fontFamily: "inherit" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12 }}>
                    <p style={{ color: "var(--app-text-muted)", marginBottom: 6 }}>No bank details yet.</p>
                    <button onClick={() => setEditingBank(true)} style={{ background: "none", border: "none", color: "var(--app-accent)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>+ Add bank details</button>
                  </div>
                )}
              </div>
            )}

            {payoutError   && <p style={{ fontSize: 12, color: "#F87171", marginBottom: 10 }}>{payoutError}</p>}
            {payoutSuccess && <p style={{ fontSize: 12, color: "#34D399", marginBottom: 10 }}>{payoutSuccess}</p>}

            <button
              onClick={requestPayout}
              disabled={payoutLoading || earnings.available < 20000}
              style={{ width: "100%", background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (payoutLoading || earnings.available < 20000) ? 0.45 : 1 }}
            >
              {payoutLoading ? "Requesting…"
                : payoutMethod === "credit"
                  ? `Convert to ${fmt(creditValue)} credit`
                  : `Withdraw ${fmt(earnings.available)}`}
            </button>
            {earnings.available < 20000 && (
              <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 8, textAlign: "center" }}>
                Minimum payout is ₦20,000. You have {fmt(earnings.available)} available.
              </p>
            )}
            <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 8, textAlign: "center" }}>
              Earnings are held 45 days before becoming available.
            </p>
          </div>

          {/* How you earn */}
          <div style={{ ...card, padding: 20 }}>
            <p style={{ ...label, marginBottom: 14 }}>How you earn</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { n: 1, color: "#60A5FA", title: "Share your link", body: "Anyone who clicks gets a 30-day cookie. Share anywhere." },
                { n: 2, color: "#A78BFA", title: "They sign up",    body: "Their account is attributed to you for 12 months." },
                { n: 3, color: "#FBBF24", title: "₦5,000 bounty",  body: "You earn ₦5,000 when they make their first payment." },
                { n: 4, color: "#34D399", title: `${tierRate}% recurring`, body: "Plus a cut of every payment they make for 12 months." },
              ].map(step => (
                <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: `${step.color}18`, border: `1px solid ${step.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: step.color }}>{step.n}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{step.title}</p>
                    <p style={{ fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5 }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tier table */}
            <div style={{ marginTop: 16, borderTop: "1px solid var(--app-border)", paddingTop: 14 }}>
              <p style={{ ...label, marginBottom: 10 }}>Commission tiers</p>
              {([["bronze","Bronze","0+","20%"],["silver","Silver","10+","25%"],["gold","Gold","25+","30%"]] as const).map(([key, name, req, rate]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--app-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: TIER_COLOR[key], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, color: tier === key ? "var(--app-text)" : "var(--app-text-muted)", fontWeight: tier === key ? 700 : 400 }}>{name}</span>
                    {tier === key && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: `${TIER_COLOR[key]}20`, color: TIER_COLOR[key] }}>You</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TIER_COLOR[key] }}>{rate}</span>
                    <span style={{ fontSize: 11, color: "var(--app-text-muted)", marginLeft: 6 }}>{req} paid referrals</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
