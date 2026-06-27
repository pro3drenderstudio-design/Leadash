"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import type { BillingInterval, CurrencyMode, Offer, PricingModel } from "@/types/offers";
import { formatOfferPrice } from "@/types/offers";
import { cardStyle, inputStyle, labelStyle } from "./shared";

interface Props {
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
}

const MODEL_CARDS: { value: PricingModel; label: string; desc: string }[] = [
  { value: "one_time", label: "One-time", desc: "Single payment, lifetime access" },
  { value: "recurring", label: "Subscription", desc: "Recurring billing every interval" },
  { value: "trial", label: "Trial → paid", desc: "Free or discounted trial, then bills" },
  { value: "free", label: "Free", desc: "No payment required at checkout" },
  { value: "payment_plan", label: "Payment plan", desc: "Split into fixed installments" },
  { value: "pwyw", label: "Pay what you want", desc: "Buyer chooses the price, with a floor" },
];

export default function PricingTab({ offer, onUpdate }: Props) {
  const installments = offer.installments ?? { count: 3, amount_ngn: Math.ceil(offer.price_ngn / 3) || 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Pricing</h2>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          How this offer is billed, and what it costs.
        </p>
      </div>

      {/* Model cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {MODEL_CARDS.map(m => {
          const active = offer.pricing_model === m.value;
          return (
            <button
              key={m.value}
              onClick={() => onUpdate({ pricing_model: m.value })}
              style={{
                padding: 16,
                borderRadius: 10,
                border: `1.5px solid ${active ? "var(--app-accent-line)" : "var(--app-border)"}`,
                background: active ? "var(--app-accent-soft)" : "var(--app-surface)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "all 0.12s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: active ? "var(--app-accent)" : "var(--app-text)" }}>{m.label}</span>
                {active && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={1.8} color="var(--app-accent)" />}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>{m.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Price details */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Price details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Price (₦)</label>
            <input
              type="number" min={0} style={inputStyle}
              value={offer.price_ngn}
              onChange={e => onUpdate({ price_ngn: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label style={labelStyle}>Compare-at (₦, optional)</label>
            <input
              type="number" min={0} style={inputStyle}
              value={offer.compare_at_ngn ?? ""}
              onChange={e => onUpdate({ compare_at_ngn: e.target.value ? parseInt(e.target.value) : null })}
            />
            <p style={{ fontSize: 10.5, color: "var(--app-text-quiet)", marginTop: 5 }}>Shows a &ldquo;save X&rdquo; badge on checkout.</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Billing interval</label>
            <select
              style={inputStyle}
              value={offer.billing_interval ?? "monthly"}
              onChange={e => onUpdate({ billing_interval: e.target.value as BillingInterval })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
            <p style={{ fontSize: 10.5, color: "var(--app-text-quiet)", marginTop: 5 }}>Only used when pricing model is Subscription.</p>
          </div>
          <div>
            <label style={labelStyle}>Charge currency</label>
            <select
              style={inputStyle}
              value={offer.currency_mode}
              onChange={e => onUpdate({ currency_mode: e.target.value as CurrencyMode })}
            >
              <option value="auto">Auto by location</option>
              <option value="ngn_only">Always ₦ NGN</option>
              <option value="usd_only">Always $ USD</option>
            </select>
          </div>
        </div>
      </div>

      {/* Trial */}
      {offer.pricing_model === "trial" && (
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Trial</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Trial length (days)</label>
              <input
                type="number" min={1} style={inputStyle}
                value={offer.trial_days ?? 7}
                onChange={e => onUpdate({ trial_days: parseInt(e.target.value) || 1 })}
              />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>
              Then bills {formatOfferPrice(offer.price_ngn)}/{(offer.billing_interval ?? "monthly").replace("ly", "")}
            </p>
          </div>
        </div>
      )}

      {/* Payment plan */}
      {offer.pricing_model === "payment_plan" && (
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Installments</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Number of installments</label>
              <input
                type="number" min={2} style={inputStyle}
                value={installments.count}
                onChange={e => {
                  const count = parseInt(e.target.value) || 2;
                  onUpdate({ installments: { count, amount_ngn: Math.ceil(offer.price_ngn / count) } });
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>Amount per installment (₦)</label>
              <input
                type="number" min={0} style={inputStyle}
                value={installments.amount_ngn}
                onChange={e => onUpdate({ installments: { ...installments, amount_ngn: parseInt(e.target.value) || 0 } })}
              />
            </div>
          </div>
        </div>
      )}

      {/* PWYW */}
      {offer.pricing_model === "pwyw" && (
        <div style={{ ...cardStyle, padding: 20 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Minimum price</h3>
          <div style={{ maxWidth: 220 }}>
            <label style={labelStyle}>Minimum (₦)</label>
            <input
              type="number" min={0} style={inputStyle}
              value={offer.pwyw_min_ngn ?? 0}
              onChange={e => onUpdate({ pwyw_min_ngn: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
      )}

      {/* Info row */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 16px", borderRadius: 10,
        background: "var(--app-surface)", border: "1px solid var(--app-border)",
      }}>
        <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.8} color="var(--app-info)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5 }}>
          When charge currency is &ldquo;Auto by location&rdquo;, buyers outside Nigeria are billed in USD at checkout using the live exchange
          rate; the price you set above is always the canonical ₦ amount stored against the offer.
        </p>
      </div>
    </div>
  );
}
