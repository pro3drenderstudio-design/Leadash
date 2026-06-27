"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, EyeIcon } from "@hugeicons/core-free-icons";
import type { Offer } from "@/types/offers";
import { formatOfferPrice, grantLine } from "@/types/offers";
import { GRANT_COLORS } from "@/types/offers";
import { cardStyle, btnGhost } from "./shared";
import { GRANT_ICONS } from "../grantIcons";

interface Props {
  offer: Offer;
  onPreview: () => void;
}

export default function SummaryRail({ offer, onPreview }: Props) {
  const hasCompareValue = offer.grants.length > 0 && offer.compare_at_ngn != null && offer.compare_at_ngn > offer.price_ngn;

  return (
    <div style={{ position: "sticky", top: 20, width: 380, flexShrink: 0 }}>
      <div style={{ ...cardStyle, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <p style={{ fontSize: 10.5, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>Offer summary</p>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text)" }}>{offer.name}</h3>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "ui-monospace, monospace", color: "var(--app-accent)" }}>
            {formatOfferPrice(offer.price_ngn)}
          </span>
          {hasCompareValue && (
            <span style={{ fontSize: 13, color: "var(--app-text-quiet)", textDecoration: "line-through", fontFamily: "ui-monospace, monospace" }}>
              {formatOfferPrice(offer.compare_at_ngn!)}
            </span>
          )}
        </div>

        {offer.grants.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-muted)", marginBottom: 10 }}>Customer gets</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {offer.grants.map(g => {
                const color = GRANT_COLORS[g.type];
                const Icon = GRANT_ICONS[g.type];
                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.8} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: "var(--app-text)", flex: 1, lineHeight: 1.4 }}>{grantLine(g)}</span>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={1.8} color="var(--app-success)" style={{ flexShrink: 0, marginTop: 1 }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasCompareValue && (
          <div style={{ paddingTop: 12, borderTop: "1px solid var(--app-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: "var(--app-text-muted)" }}>Total value</span>
              <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--app-text)" }}>{formatOfferPrice(offer.compare_at_ngn!)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 4 }}>
              <span style={{ color: "var(--app-success)" }}>You save</span>
              <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--app-success)", fontWeight: 700 }}>
                {formatOfferPrice(offer.compare_at_ngn! - offer.price_ngn)}
              </span>
            </div>
          </div>
        )}

        <button onClick={onPreview} style={{ ...btnGhost, width: "100%", justifyContent: "center", border: "1px solid var(--app-border-strong)" }}>
          <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.8} />
          Preview checkout page
        </button>
      </div>
    </div>
  );
}
