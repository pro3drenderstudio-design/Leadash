"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import type { Offer, OfferAnalytics, OfferPurchase } from "@/types/offers";
import { cardStyle, btnGhost, btnDefault, Chip } from "../shared";

const STATUS_CHIP: Record<OfferPurchase["status"], { label: string; color: string; bg: string; border: string }> = {
  paid:     { label: "Paid",     color: "var(--app-success)", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)" },
  pending:  { label: "Pending",  color: "var(--app-warning)", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" },
  refunded: { label: "Refunded", color: "var(--app-text-muted)", bg: "var(--app-surface)", border: "var(--app-border)" },
  failed:   { label: "Failed",   color: "var(--app-danger)", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" },
};

const FUNNEL_STAGE_META: Record<string, { label: string; color: string }> = {
  view: { label: "Viewed checkout", color: "var(--app-info)" },
  started: { label: "Started form", color: "#A78BFA" },
  payment_added: { label: "Added payment", color: "var(--app-warning)" },
  purchased: { label: "Purchased", color: "var(--app-success)" },
};

export default function OfferAnalyticsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const offerId = params.id;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [data, setData] = useState<OfferAnalytics | null>(null);
  const [purchases, setPurchases] = useState<OfferPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [offerRes, analyticsRes, purchasesRes] = await Promise.all([
        fetch(`/api/admin/offers/${offerId}`).then(r => r.json()),
        fetch(`/api/admin/offers/${offerId}/analytics`).then(r => r.json()),
        fetch(`/api/admin/offers/${offerId}/purchases`).then(r => r.json()),
      ]);
      if (offerRes.offer) setOffer(offerRes.offer);
      if (analyticsRes.tiles) setData(analyticsRes);
      if (purchasesRes.purchases) setPurchases(purchasesRes.purchases);
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => { load(); }, [load]);

  async function refundPurchase(purchase: OfferPurchase) {
    if (!window.confirm(`Refund ${purchase.buyer_email ?? "this buyer"} ₦${purchase.total_ngn.toLocaleString("en-NG")}? This revokes any granted access and cannot be undone.`)) return;
    setRefundingId(purchase.id);
    try {
      const res = await fetch(`/api/admin/offers/purchases/${purchase.id}/refund`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Refund failed"); return; }
      setPurchases(prev => prev.map(p => (p.id === purchase.id ? (d.purchase as OfferPurchase) : p)));
      showToast("Purchase refunded");
    } finally {
      setRefundingId(null);
    }
  }

  if (loading || !offer || !data) {
    return (
      <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)", padding: "60px 28px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--app-text-quiet)" }}>Loading analytics…</p>
      </div>
    );
  }

  const statusChip = offer.status === "active"
    ? { label: "Live", bg: "rgba(52,211,153,0.1)", color: "var(--app-success)", border: "rgba(52,211,153,0.25)" }
    : offer.status === "paused"
      ? { label: "Paused", bg: "rgba(251,191,36,0.1)", color: "var(--app-warning)", border: "rgba(251,191,36,0.25)" }
      : { label: "Draft", bg: "var(--app-surface)", color: "var(--app-text-muted)", border: "var(--app-border)" };

  const maxRevenue = Math.max(...data.revenue_trend.map(d => d.revenue_ngn), 1);
  const maxFunnel = Math.max(...data.checkout_funnel.map(s => s.count), 1);

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--app-border)", padding: "18px 28px", background: "var(--app-bg-sunken)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <button
              onClick={() => router.push(`/admin/offers/${offerId}`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, color: "var(--app-text-muted)",
                background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--app-text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-muted)")}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />
              Back to builder
            </button>
            <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginBottom: 4 }}>
              Monetization / Offers / {offer.name} / Analytics
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{offer.name}</h1>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                color: statusChip.color, background: statusChip.bg, border: `1px solid ${statusChip.border}`,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>{statusChip.label}</span>
            </div>
          </div>
          <button onClick={() => showToast("Coming soon")} style={btnGhost}>
            <HugeiconsIcon icon={Download01Icon} size={13} strokeWidth={1.8} />
            Export
          </button>
        </div>
      </header>

      <main style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Revenue", value: `₦${data.tiles.revenue_ngn.toLocaleString("en-NG")}`, color: "var(--app-success)" },
            { label: "Sales", value: data.tiles.sales.toLocaleString(), color: "var(--app-text)" },
            { label: "Checkout views", value: data.tiles.checkout_views.toLocaleString(), color: "var(--app-text)" },
            { label: "Conversion", value: `${data.tiles.conversion_rate.toFixed(1)}%`, color: "var(--app-accent)" },
            { label: "Refund rate", value: `${data.tiles.refund_rate.toFixed(1)}%`, color: data.tiles.refund_rate > 10 ? "var(--app-danger)" : "var(--app-text)" },
          ].map(t => (
            <div key={t.label} style={{ ...cardStyle, padding: "16px 18px" }}>
              <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>{t.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: t.color, fontVariantNumeric: "tabular-nums" }}>{t.value}</p>
            </div>
          ))}
        </div>

        {/* Revenue trend + funnel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Revenue trend (28 days)</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
              {data.revenue_trend.map((d, i) => {
                const isLast = i === data.revenue_trend.length - 1;
                const height = maxRevenue > 0 ? Math.round((d.revenue_ngn / maxRevenue) * 100) : 0;
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ₦${d.revenue_ngn.toLocaleString("en-NG")}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(height, 3)}%`,
                      minHeight: 3,
                      borderRadius: 3,
                      background: isLast
                        ? "var(--app-success)"
                        : d.revenue_ngn > 0
                          ? "linear-gradient(180deg, rgba(52,211,153,0.55), rgba(52,211,153,0.2))"
                          : "var(--app-surface-strong)",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: "var(--app-text-quiet)" }}>{data.revenue_trend[0]?.date}</span>
              <span style={{ fontSize: 10, color: "var(--app-text-quiet)" }}>{data.revenue_trend[data.revenue_trend.length - 1]?.date}</span>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Checkout funnel</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.checkout_funnel.map(stage => {
                const meta = FUNNEL_STAGE_META[stage.stage] ?? { label: stage.stage, color: "var(--app-text-muted)" };
                const width = maxFunnel > 0 ? Math.round((stage.count / maxFunnel) * 100) : 0;
                return (
                  <div key={stage.stage}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                      <span style={{ color: "var(--app-text-muted)" }}>{meta.label}</span>
                      <span style={{ color: "var(--app-text)", fontFamily: "ui-monospace, monospace" }}>
                        {stage.count.toLocaleString()} ({stage.pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{ height: 7, background: "var(--app-surface-strong)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${width}%`, background: meta.color, borderRadius: 999, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Revenue by grant + discount codes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Revenue by line item</h3>
            {data.revenue_by_grant.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No revenue yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.revenue_by_grant.map(g => (
                  <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--app-text)", flex: 1 }}>{g.label}</span>
                    <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace", color: "var(--app-text-muted)" }}>
                      ₦{g.amount_ngn.toLocaleString("en-NG")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Discount code performance</h3>
            {data.discount_code_performance.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No discount codes used yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.discount_code_performance.map(c => (
                  <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, fontWeight: 700,
                      color: "var(--app-accent)",
                    }}>{c.code}</span>
                    <span style={{ fontSize: 12, color: "var(--app-text-quiet)", flex: 1 }}>{c.redemptions} redemption{c.redemptions === 1 ? "" : "s"}</span>
                    <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace", color: "var(--app-text-muted)" }}>
                      ₦{c.revenue_ngn.toLocaleString("en-NG")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Purchases */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Purchases</h3>
          {purchases.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No purchases yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--app-text-quiet)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ padding: "0 10px 10px 0", fontWeight: 600 }}>Buyer</th>
                  <th style={{ padding: "0 10px 10px 0", fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: "0 10px 10px 0", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0 10px 10px 0", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "0 0 10px 0", fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => {
                  const chip = STATUS_CHIP[p.status];
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--app-border)" }}>
                      <td style={{ padding: "10px 10px 10px 0" }}>
                        <div style={{ color: "var(--app-text)" }}>{p.buyer_name || "—"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>{p.buyer_email ?? "—"}</div>
                      </td>
                      <td style={{ padding: "10px 10px 10px 0", fontFamily: "ui-monospace, monospace" }}>
                        ₦{p.total_ngn.toLocaleString("en-NG")}
                      </td>
                      <td style={{ padding: "10px 10px 10px 0" }}>
                        <Chip label={chip.label} color={chip.color} bg={chip.bg} border={chip.border} />
                      </td>
                      <td style={{ padding: "10px 10px 10px 0", color: "var(--app-text-muted)" }}>
                        {new Date(p.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "right" }}>
                        {p.status === "paid" && (
                          <button
                            onClick={() => refundPurchase(p)}
                            disabled={refundingId === p.id}
                            style={{ ...btnDefault, opacity: refundingId === p.id ? 0.6 : 1, cursor: refundingId === p.id ? "not-allowed" : "pointer" }}
                          >
                            {refundingId === p.id ? "Refunding…" : "Refund"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
            background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)",
            borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "var(--app-text)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)", zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
