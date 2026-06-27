"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tag01Icon,
  PlusSignIcon,
  Search01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import type { OfferWithStats, PricingModel } from "@/types/offers";
import { GRANT_COLORS, GRANT_LABELS, formatOfferPrice } from "@/types/offers";
import { GRANT_ICONS } from "./grantIcons";

// ── Style helpers (match academy admin / ChallengeBuilder precedent) ──────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

const inputStyle: React.CSSProperties = {
  background: "var(--app-bg)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--app-text)",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

function priceLabel(o: OfferWithStats): string {
  const model = o.pricing_model as PricingModel;
  if (model === "free") return "Free";
  if (model === "recurring") return `${formatOfferPrice(o.price_ngn)}/mo`;
  if (model === "trial") return `${o.trial_days ?? 0}d trial → ${formatOfferPrice(o.price_ngn)}/mo`;
  return formatOfferPrice(o.price_ngn);
}

type StatusFilter = "all" | "active" | "draft" | "paused";

export default function OffersLibraryPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<OfferWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/offers");
      const d = await res.json();
      setOffers(d.offers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createOffer() {
    const name = window.prompt("Offer name");
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) { window.alert(d.error ?? "Failed to create offer"); return; }
      router.push(`/admin/offers/${d.offer.id}`);
    } finally {
      setCreating(false);
    }
  }

  const filtered = useMemo(() => {
    return offers.filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search.trim() && !o.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [offers, search, statusFilter]);

  const totalRevenue = offers.reduce((s, o) => s + (o.revenue_ngn ?? 0), 0);
  const liveCount = offers.filter(o => o.status === "active").length;
  const totalSales = offers.reduce((s, o) => s + (o.sales ?? 0), 0);
  const withViews = offers.filter(o => o.views > 0);
  const avgConversion = withViews.length > 0
    ? withViews.reduce((s, o) => s + o.conversion_rate, 0) / withViews.length
    : 0;
  const activeFunnels = new Set(offers.flatMap(o => o.funnel_ids ?? [])).size;

  const tiles = [
    { label: "Total revenue", value: `₦${totalRevenue.toLocaleString("en-NG")}`, color: "var(--app-success)" },
    { label: "Offers live", value: `${liveCount} / ${offers.length}`, color: "var(--app-text)" },
    { label: "Total sales", value: totalSales.toLocaleString(), color: "var(--app-text)" },
    { label: "Avg conversion", value: `${avgConversion.toFixed(1)}%`, color: "var(--app-text)" },
    { label: "Active funnels", value: activeFunnels.toLocaleString(), color: "var(--app-text)" },
  ];

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)", padding: "24px 28px" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Offers</h1>
        <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>
          Sellable bundles of grants, pricing, and checkout pages — sold via Paystack.
        </p>
      </div>

      {/* Rollup tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ ...cardStyle, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{t.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: t.color, fontVariantNumeric: "tabular-nums" }}>{loading ? "—" : t.value}</p>
          </div>
        ))}
      </div>

      {/* Offers table card */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            All offers
            <span style={{
              fontSize: 11, fontWeight: 600, color: "var(--app-text-muted)",
              background: "var(--app-surface-strong)", borderRadius: 999, padding: "2px 8px",
            }}>{offers.length}</span>
          </h3>
          <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
            <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--app-text-quiet)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search offers…"
              style={{ ...inputStyle, width: "100%", paddingLeft: 32 }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            style={{ ...inputStyle, width: 160 }}
          >
            <option value="all">All status</option>
            <option value="active">Live</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
          </select>
          <button
            onClick={createOffer}
            disabled={creating}
            className="app-btn app-btn-primary"
            style={{ opacity: creating ? 0.6 : 1 }}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.8} />
            {creating ? "Creating…" : "New offer"}
          </button>
        </div>

        {/* Table header row */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "2.2fr 1.6fr 0.8fr 1fr 1fr 1fr",
            padding: "10px 18px",
            borderBottom: "1px solid var(--app-border)",
            fontSize: 10, fontWeight: 600, color: "var(--app-text-quiet)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            <span>Offer</span>
            <span>Grants</span>
            <span>Views</span>
            <span>Sales</span>
            <span>Revenue</span>
            <span style={{ textAlign: "right" }}>Status</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: "48px 18px", textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 18px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--app-text-muted)" }}>
              {offers.length === 0 ? "No offers yet." : "No offers match your filters."}
            </p>
            <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 6 }}>
              {offers.length === 0 ? "Create your first offer to start selling bundles." : "Try a different search or status filter."}
            </p>
            {offers.length === 0 && (
              <button onClick={createOffer} disabled={creating} className="app-btn app-btn-primary" style={{ marginTop: 16 }}>
                <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.8} />
                {creating ? "Creating…" : "New offer"}
              </button>
            )}
          </div>
        ) : (
          filtered.map(o => {
            const visibleGrants = o.grants.slice(0, 4);
            const statusChip = o.status === "active"
              ? { label: "Live", bg: "rgba(52,211,153,0.1)", color: "var(--app-success)", border: "rgba(52,211,153,0.25)" }
              : o.status === "paused"
                ? { label: "Paused", bg: "rgba(251,191,36,0.1)", color: "var(--app-warning)", border: "rgba(251,191,36,0.25)" }
                : { label: "Draft", bg: "var(--app-surface)", color: "var(--app-text-muted)", border: "var(--app-border)" };
            return (
              <div
                key={o.id}
                onClick={() => router.push(`/admin/offers/${o.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.2fr 1.6fr 0.8fr 1fr 1fr 1fr",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--app-border)",
                  cursor: "pointer",
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--app-surface)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Col 1: icon + name */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: "var(--app-accent-soft)", border: "1px solid var(--app-accent-line)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HugeiconsIcon icon={Tag01Icon} size={16} strokeWidth={1.8} color="var(--app-accent)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</p>
                    <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>{o.grants.length} grant{o.grants.length === 1 ? "" : "s"} · {priceLabel(o)}</p>
                  </div>
                </div>

                {/* Col 2: grant pills */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {visibleGrants.length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>—</span>
                  ) : visibleGrants.map(g => {
                    const color = GRANT_COLORS[g.type];
                    const Icon = GRANT_ICONS[g.type];
                    return (
                      <span key={g.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10.5, fontWeight: 600, padding: "3px 7px",
                        borderRadius: 999, color, background: `${color}1a`, border: `1px solid ${color}33`,
                      }}>
                        <HugeiconsIcon icon={Icon} size={10} strokeWidth={2} />
                        {GRANT_LABELS[g.type].split(" ")[0]}
                      </span>
                    );
                  })}
                  {o.grants.length > 4 && (
                    <span style={{ fontSize: 10.5, color: "var(--app-text-quiet)", padding: "3px 4px" }}>+{o.grants.length - 4}</span>
                  )}
                </div>

                {/* Col 3: views */}
                <span style={{ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--app-text-muted)" }}>
                  {o.views.toLocaleString()}
                </span>

                {/* Col 4: sales + conversion */}
                <div>
                  <span style={{ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--app-text)", fontWeight: 600 }}>
                    {o.sales.toLocaleString()}
                  </span>
                  {o.conversion_rate > 0 && (
                    <span style={{ fontSize: 10.5, color: "var(--app-text-quiet)", marginLeft: 6 }}>{o.conversion_rate.toFixed(1)}%</span>
                  )}
                </div>

                {/* Col 5: revenue */}
                <span style={{
                  fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: o.revenue_ngn > 0 ? "var(--app-success)" : "var(--app-text-quiet)", fontWeight: o.revenue_ngn > 0 ? 600 : 400,
                }}>
                  {o.revenue_ngn > 0 ? `₦${o.revenue_ngn.toLocaleString("en-NG")}` : "—"}
                </span>

                {/* Col 6: status + chevron */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                    color: statusChip.color, background: statusChip.bg, border: `1px solid ${statusChip.border}`,
                    textTransform: "uppercase", letterSpacing: "0.04em",
                  }}>{statusChip.label}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} color="var(--app-text-quiet)" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
