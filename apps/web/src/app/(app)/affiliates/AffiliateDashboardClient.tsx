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

const TIER_COLORS: Record<string, string> = {
  bronze: "rgba(180,120,60,0.15)",
  silver: "rgba(180,180,200,0.15)",
  gold:   "rgba(250,200,50,0.15)",
};
const TIER_TEXT: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold:   "#FFD700",
};
const TIER_RATES: Record<string, number> = { bronze: 20, silver: 25, gold: 30 };
const TIER_NEXT: Record<string, string>  = { bronze: "Silver at 10 paid referrals", silver: "Gold at 25 paid referrals", gold: "Max tier" };

function fmt(n: number) { return `₦${Math.floor(n).toLocaleString()}`; }

export default function AffiliateDashboardClient() {
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [earnings, setEarnings]   = useState<Earnings | null>(null);
  const [payouts, setPayouts]     = useState<Payout[]>([]);
  const [loading, setLoading]     = useState(true);
  const [copied, setCopied]       = useState(false);

  // Bank form
  const [editingBank, setEditingBank]   = useState(false);
  const [bankName, setBankName]         = useState("");
  const [bankAccNum, setBankAccNum]     = useState("");
  const [bankAccName, setBankAccName]   = useState("");
  const [bankSaving, setBankSaving]     = useState(false);

  // Payout request
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "credit">("bank");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError]   = useState("");
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
    navigator.clipboard.writeText(affiliate.referral_url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function saveBank() {
    setBankSaving(true);
    await wsFetch("/api/affiliates/me", {
      method: "PATCH",
      body: JSON.stringify({ bank_name: bankName, bank_account_number: bankAccNum, bank_account_name: bankAccName }),
    });
    setAffiliate(prev => prev ? { ...prev, bank_name: bankName, bank_account_number: bankAccNum, bank_account_name: bankAccName } : prev);
    setEditingBank(false);
    setBankSaving(false);
  }

  async function requestPayout() {
    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");
    const res = await wsFetch("/api/affiliates/payout", { method: "POST", body: JSON.stringify({ method: payoutMethod }) });
    const data = await res.json();
    if (data.error) { setPayoutError(data.error); }
    else { setPayoutSuccess(`Payout of ${fmt(data.amount_ngn)} queued for review.`); }
    setPayoutLoading(false);
  }

  if (loading) return <div style={{ padding: 32, color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>;
  if (!affiliate || !earnings) return null;

  const tier = affiliate.tier;

  return (
    <div className="v2-app" style={{ color: "var(--app-text)", padding: "0 0 64px" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>Affiliate Program</h1>
          <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>Earn commissions by referring customers to Leadash.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: TIER_COLORS[tier], border: `1px solid ${TIER_TEXT[tier]}30`, borderRadius: 20, padding: "5px 14px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: TIER_TEXT[tier], textTransform: "capitalize" }}>{tier}</span>
          <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>· {TIER_RATES[tier]}% commission</span>
        </div>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>

        {/* Referral link */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Your referral link</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, background: "var(--app-surface-strong)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "var(--app-text)", wordBreak: "break-all" }}>
              {affiliate.referral_url}
            </code>
            <button
              onClick={copyLink}
              style={{ background: copied ? "rgba(52,211,153,0.15)" : "var(--app-accent)", color: copied ? "#34D399" : "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 8 }}>30-day cookie. Anyone who signs up within 30 days of clicking your link is attributed to you.</p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Clicks", value: affiliate.clicks.toLocaleString() },
            { label: "Signups", value: affiliate.signups.toLocaleString() },
            { label: "Paid referrals", value: affiliate.paid_referrals.toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 11, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Earnings */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Earnings</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Available", value: fmt(earnings.available), color: "#34D399" },
              { label: "Holding (45-day)", value: fmt(earnings.pending), color: "#FBBF24" },
              { label: "Paid out", value: fmt(earnings.paid), color: "var(--app-text-muted)" },
            ].map(e => (
              <div key={e.label}>
                <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginBottom: 4 }}>{e.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: e.color }}>{e.value}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
            Tier: <strong style={{ color: TIER_TEXT[tier] }}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</strong> ({TIER_RATES[tier]}%) · {TIER_NEXT[tier]} · Min payout ₦20,000 · 45-day hold
          </p>
        </div>

        {/* Payout request */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Request Payout</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {([["bank", "Cash to bank"], ["credit", "Subscription credit (×1.25)"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPayoutMethod(val)}
                style={{
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${payoutMethod === val ? "var(--app-accent)" : "var(--app-border)"}`,
                  background: payoutMethod === val ? "rgba(249,115,22,0.08)" : "var(--app-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  color: payoutMethod === val ? "var(--app-accent)" : "var(--app-text)",
                }}
              >{label}</button>
            ))}
          </div>
          {payoutMethod === "credit" && (
            <p style={{ fontSize: 12, color: "#34D399", marginBottom: 12 }}>
              Your {fmt(earnings.available)} gets credited as {fmt(earnings.available * 1.25)} in Leadash subscription credit.
            </p>
          )}
          {payoutError && <p style={{ fontSize: 12, color: "#F87171", marginBottom: 10 }}>{payoutError}</p>}
          {payoutSuccess && <p style={{ fontSize: 12, color: "#34D399", marginBottom: 10 }}>{payoutSuccess}</p>}
          <button
            onClick={requestPayout}
            disabled={payoutLoading || earnings.available < 20000}
            style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (payoutLoading || earnings.available < 20000) ? 0.5 : 1 }}
          >
            {payoutLoading ? "Requesting…" : `Request payout — ${fmt(earnings.available)}`}
          </button>
          {earnings.available < 20000 && <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginTop: 8 }}>You need at least ₦20,000 available to request a payout.</p>}
        </div>

        {/* Bank details */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank Details</p>
            <button onClick={() => setEditingBank(v => !v)} style={{ background: "none", border: "none", color: "var(--app-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {editingBank ? "Cancel" : "Edit"}
            </button>
          </div>
          {editingBank ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Bank name", val: bankName, set: setBankName, placeholder: "e.g. Access Bank" },
                { label: "Account number", val: bankAccNum, set: setBankAccNum, placeholder: "10-digit account number" },
                { label: "Account name", val: bankAccName, set: setBankAccName, placeholder: "As it appears on the account" },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 11, color: "var(--app-text-muted)", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input
                    value={f.val}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ width: "100%", background: "var(--app-surface-strong)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--app-text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <button onClick={saveBank} disabled={bankSaving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
                {bankSaving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13 }}>
              {affiliate.bank_name ? (
                <>
                  <p style={{ marginBottom: 4 }}><span style={{ color: "var(--app-text-muted)" }}>Bank: </span>{affiliate.bank_name}</p>
                  <p style={{ marginBottom: 4 }}><span style={{ color: "var(--app-text-muted)" }}>Account: </span>{affiliate.bank_account_number}</p>
                  <p><span style={{ color: "var(--app-text-muted)" }}>Name: </span>{affiliate.bank_account_name}</p>
                </>
              ) : (
                <p style={{ color: "var(--app-text-muted)" }}>No bank details yet. Add them before requesting a cash payout.</p>
              )}
            </div>
          )}
        </div>

        {/* Payout history */}
        {payouts.length > 0 && (
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payout History</p>
            </div>
            {payouts.map(p => (
              <div key={p.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{fmt(p.amount_ngn)}</span>
                  <span style={{ color: "var(--app-text-muted)", marginLeft: 8 }}>{p.method === "bank" ? "Bank transfer" : "Credit (×1.25)"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: p.status === "paid" ? "rgba(52,211,153,0.12)" : p.status === "held" ? "rgba(251,191,36,0.12)" : "rgba(148,163,184,0.12)",
                    color: p.status === "paid" ? "#34D399" : p.status === "held" ? "#FBBF24" : "var(--app-text-muted)",
                  }}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
