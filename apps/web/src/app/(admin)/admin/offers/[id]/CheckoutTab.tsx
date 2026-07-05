"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import type { BuyerField, Offer } from "@/types/offers";
import { formatOfferPrice, grantLine } from "@/types/offers";
import { cardStyle, inputStyle, labelStyle, Toggle } from "./shared";
import { GRANT_ICONS } from "../grantIcons";
import { GRANT_COLORS } from "@/types/offers";

interface Props {
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
}

const LAYOUTS: { value: Offer["checkout"]["layout"]; label: string }[] = [
  { value: "two_col", label: "Two-column" },
  { value: "single", label: "Single card" },
  { value: "long", label: "Long-form" },
];

export default function CheckoutTab({ offer, onUpdate }: Props) {
  const checkout = offer.checkout;

  function updateCheckout(patch: Partial<Offer["checkout"]>) {
    onUpdate({ checkout: { ...checkout, ...patch } });
  }

  function updateField(key: string, patch: Partial<BuyerField>) {
    updateCheckout({ fields: checkout.fields.map(f => (f.key === key ? { ...f, ...patch } : f)) });
  }

  function addCustomField() {
    const label = window.prompt("Field label");
    if (!label) return;
    const key = `custom_${label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}_${Date.now().toString(36)}`;
    const field: BuyerField = { key, label, enabled: true, required: false, type: "text" };
    updateCheckout({ fields: [...checkout.fields, field] });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>
      {/* LEFT: controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Checkout page</h2>
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
            What the buyer sees when they land on the public checkout page.
          </p>
        </div>

        {/* Content card */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Content</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Headline</label>
              <input style={inputStyle} value={checkout.headline} onChange={e => updateCheckout({ headline: e.target.value })} placeholder="Get everything you need to launch" />
            </div>
            <div>
              <label style={labelStyle}>Subhead</label>
              <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={checkout.subhead} onChange={e => updateCheckout({ subhead: e.target.value })} placeholder="A short supporting line under the headline" />
            </div>
            <div>
              <label style={labelStyle}>Highlight badge</label>
              <input style={inputStyle} value={checkout.badge} onChange={e => updateCheckout({ badge: e.target.value })} placeholder="Limited launch pricing" />
            </div>
          </div>
        </div>

        {/* Layout & trust */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Layout &amp; trust</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Layout</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {LAYOUTS.map(l => {
                const active = checkout.layout === l.value;
                return (
                  <button
                    key={l.value}
                    onClick={() => updateCheckout({ layout: l.value })}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 8,
                      border: `1.5px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
                      background: active ? "var(--app-accent-soft)" : "var(--app-surface)",
                      color: active ? "var(--app-accent)" : "var(--app-text-muted)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {([
              { key: "show_value_stack", label: "Show value stack" },
              { key: "show_countdown", label: "Show countdown" },
              { key: "show_testimonials", label: "Show testimonials", comingSoon: true },
              { key: "show_guarantee", label: "Show guarantee badge" },
            ] as { key: keyof Offer["checkout"]; label: string; comingSoon?: boolean }[]).map(row => (
              <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--app-text)", opacity: row.comingSoon ? 0.55 : 1 }}>{row.label}</span>
                {row.comingSoon
                  ? <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--app-text-quiet)", background: "var(--app-border)", padding: "2px 7px", borderRadius: 999 }}>Soon</span>
                  : <Toggle on={Boolean(checkout[row.key])} onChange={v => updateCheckout({ [row.key]: v } as Partial<Offer["checkout"]>)} />
                }
              </div>
            ))}
          </div>
        </div>

        {/* Buyer fields */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Buyer fields</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checkout.fields.map(f => (
              <div key={f.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8, background: "var(--app-surface)", border: "1px solid var(--app-border)",
              }}>
                <Toggle on={f.enabled} onChange={v => updateField(f.key, { enabled: v })} />
                <input
                  value={f.label}
                  onChange={e => updateField(f.key, { label: e.target.value })}
                  style={{ ...inputStyle, flex: 1, padding: "6px 9px", fontSize: 12.5 }}
                />
                <button
                  onClick={() => updateField(f.key, { required: !f.required })}
                  disabled={!f.enabled}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                    border: "1px solid var(--app-border)",
                    background: f.required ? "rgba(251,191,36,0.1)" : "var(--app-surface-strong)",
                    color: f.required ? "var(--app-warning)" : "var(--app-text-quiet)",
                    cursor: f.enabled ? "pointer" : "not-allowed",
                    textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                    opacity: f.enabled ? 1 : 0.5,
                  }}
                >
                  {f.required ? "Required" : "Optional"}
                </button>
              </div>
            ))}
          </div>
          <button onClick={addCustomField} style={{
            marginTop: 12, background: "transparent", border: "none", color: "var(--app-accent)",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 5, padding: 0,
          }}>
            <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
            Add custom field
          </button>
        </div>
      </div>

      {/* RIGHT: live preview */}
      <div style={{ position: "sticky", top: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "var(--app-success)", flexShrink: 0 }}>
            <span className="offer-pulse-dot" />
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)" }}>Live preview</span>
        </div>
        <div style={{ transform: "scale(0.92)", transformOrigin: "top center" }}>
          <CheckoutPreview offer={offer} />
        </div>
        <style>{`
          .offer-pulse-dot {
            position: absolute; inset: 0; border-radius: 50%;
            background: var(--app-success);
            animation: offerPulse 1.8s ease-out infinite;
          }
          @keyframes offerPulse {
            0% { transform: scale(1); opacity: 0.7; }
            100% { transform: scale(2.6); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

function CheckoutPreview({ offer }: { offer: Offer }) {
  const checkout = offer.checkout;
  const enabledFields = checkout.fields.filter(f => f.enabled);
  const firstBump = offer.bumps[0];
  const compareAt = offer.compare_at_ngn;
  const save = compareAt && compareAt > offer.price_ngn ? compareAt - offer.price_ngn : 0;

  return (
    <div style={{
      ...cardStyle,
      padding: 22,
      width: 420,
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      {checkout.badge && (
        <span style={{
          alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
          color: "var(--app-accent)", background: "var(--app-accent-soft)", border: "1px solid var(--app-accent-line)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>{checkout.badge}</span>
      )}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)", lineHeight: 1.3 }}>
          {checkout.headline || offer.name}
        </h3>
        {checkout.subhead && (
          <p style={{ fontSize: 12.5, color: "var(--app-text-muted)", marginTop: 6, lineHeight: 1.5 }}>{checkout.subhead}</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "ui-monospace, monospace", color: "var(--app-accent)" }}>
          {formatOfferPrice(offer.price_ngn)}
        </span>
        {compareAt && compareAt > offer.price_ngn && (
          <span style={{ fontSize: 14, color: "var(--app-text-quiet)", textDecoration: "line-through", fontFamily: "ui-monospace, monospace" }}>
            {formatOfferPrice(compareAt)}
          </span>
        )}
        {save > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--app-success)" }}>Save {formatOfferPrice(save)}</span>
        )}
      </div>

      {checkout.show_value_stack && offer.grants.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)" }}>
          {offer.grants.map(g => {
            const color = GRANT_COLORS[g.type];
            const Icon = GRANT_ICONS[g.type];
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.8} color={color} />
                <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{grantLine(g)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Buyer fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {enabledFields.map(f => (
          <div key={f.key} style={{
            padding: "9px 11px", borderRadius: 7,
            background: "var(--app-surface)", border: "1px solid var(--app-border)",
            fontSize: 12, color: "var(--app-text-quiet)",
          }}>
            {f.label}{f.required && <span style={{ color: "var(--app-danger)" }}> *</span>}
          </div>
        ))}
      </div>

      {/* Order bump */}
      {firstBump && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 9,
          background: "rgba(251,191,36,0.06)", border: "1px dashed rgba(251,191,36,0.3)",
        }}>
          <input type="checkbox" disabled style={{ marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--app-text)" }}>{firstBump.label || "Order bump"}</p>
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>Add for {formatOfferPrice(firstBump.price_ngn)}</p>
          </div>
        </div>
      )}

      {/* Discount code */}
      <div style={{ display: "flex", gap: 8 }}>
        <input disabled placeholder="Discount code" style={{ ...inputStyle, flex: 1, padding: "8px 10px", fontSize: 12 }} />
        <button disabled style={{
          padding: "8px 14px", borderRadius: 8, border: "1px solid var(--app-border-strong)",
          background: "var(--app-surface-strong)", color: "var(--app-text-muted)", fontSize: 12, fontWeight: 600,
        }}>Apply</button>
      </div>

      {/* Totals */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--app-text-muted)" }}>
          <span>Subtotal</span><span style={{ fontFamily: "ui-monospace, monospace" }}>{formatOfferPrice(offer.price_ngn)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--app-text)", paddingTop: 6, borderTop: "1px solid var(--app-border)" }}>
          <span>Total</span><span style={{ fontFamily: "ui-monospace, monospace" }}>{formatOfferPrice(offer.price_ngn)}</span>
        </div>
      </div>

      <button disabled style={{
        width: "100%", padding: "12px 0", borderRadius: 9, border: "none",
        background: "var(--app-accent)", color: "#fff", fontSize: 14, fontWeight: 700,
        opacity: 0.55, cursor: "not-allowed",
      }}>
        Complete purchase
      </button>

      {checkout.show_guarantee && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={1.8} color="var(--app-success)" />
          <span style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>Secured by Paystack</span>
        </div>
      )}
    </div>
  );
}
