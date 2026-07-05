"use client";
import { useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { Offer, OfferDiscountCode, OnExpireBehavior } from "@/types/offers";
import { cardStyle, inputStyle, labelStyle, Toggle, btnGhost } from "./shared";

interface Props {
  offerId: string;
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
  showToast: (msg: string) => void;
}

function discountLabel(c: OfferDiscountCode): string {
  return c.kind === "percent" ? `${c.value}% off` : `₦${c.value.toLocaleString("en-NG")} off`;
}

export default function PromotionTab({ offerId, offer, onUpdate, showToast }: Props) {
  const [codes, setCodes] = useState<OfferDiscountCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);

  const loadCodes = useCallback(async () => {
    setLoadingCodes(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/discount-codes`);
      const d = await res.json();
      setCodes(d.codes ?? []);
    } finally {
      setLoadingCodes(false);
    }
  }, [offerId]);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  async function createCode() {
    const code = window.prompt("Discount code (e.g. LAUNCH25)");
    if (!code) return;
    const kindRaw = window.prompt("Type: 'percent' or 'fixed'", "percent");
    const kind = kindRaw === "fixed" ? "fixed" : "percent";
    const valueRaw = window.prompt(kind === "percent" ? "Percent off (e.g. 25)" : "Amount off in ₦ (e.g. 5000)", kind === "percent" ? "25" : "5000");
    const value = parseInt(valueRaw ?? "0", 10);
    if (!value || value <= 0) { showToast("Enter a valid value"); return; }
    const res = await fetch(`/api/admin/offers/${offerId}/discount-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, kind, value }),
    });
    const d = await res.json();
    if (!res.ok) { showToast(d.error ?? "Failed to create code"); return; }
    setCodes(prev => [d.code, ...prev]);
    showToast("Discount code created");
  }

  async function toggleCode(id: string, is_active: boolean) {
    const res = await fetch(`/api/admin/offers/${offerId}/discount-codes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active }),
    });
    const d = await res.json();
    if (res.ok) setCodes(prev => prev.map(c => (c.id === id ? d.code : c)));
  }

  async function deleteCode(id: string) {
    if (!window.confirm("Delete this discount code?")) return;
    const res = await fetch(`/api/admin/offers/${offerId}/discount-codes?id=${id}`, { method: "DELETE" });
    if (res.ok) { setCodes(prev => prev.filter(c => c.id !== id)); showToast("Code deleted"); }
  }

  const expiringEnabled = offer.expires_at != null;
  const stockEnabled = offer.stock_limit != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Promotion</h2>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          Discount codes, urgency, and scarcity mechanics for this offer.
        </p>
      </div>

      {/* Discount codes */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>Discount codes</h3>
          <button onClick={createCode} style={btnGhost}>
            <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
            New code
          </button>
        </div>
        {loadingCodes ? (
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>Loading…</p>
        ) : codes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No discount codes yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {codes.map(c => (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 9, background: "var(--app-surface)", border: "1px solid var(--app-border)",
              }}>
                <span style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, fontWeight: 700,
                  color: "var(--app-accent)", padding: "4px 9px", borderRadius: 6, border: "1px dashed var(--app-accent-line)",
                }}>{c.code}</span>
                <span style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>{discountLabel(c)}</span>
                <span style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>
                  {c.redemptions} redemption{c.redemptions === 1 ? "" : "s"}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
                </span>
                <div style={{ flex: 1 }} />
                <Toggle on={c.is_active} onChange={v => toggleCode(c.id, v)} />
                <button onClick={() => deleteCode(c.id)} aria-label="Delete code" style={{ background: "transparent", border: "none", color: "var(--app-text-quiet)", cursor: "pointer", padding: 2 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--app-danger)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-quiet)")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expiring offer */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>Expiring offer</p>
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>Hide or change the offer after a deadline.</p>
          </div>
          <Toggle
            on={expiringEnabled}
            onChange={v => onUpdate({ expires_at: v ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null })}
          />
        </div>
        {expiringEnabled && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--app-border)" }}>
            <div>
              <label style={labelStyle}>Expires at</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={offer.expires_at ? offer.expires_at.slice(0, 16) : ""}
                onChange={e => onUpdate({ expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
            <div>
              <label style={labelStyle}>When expired</label>
              <select
                style={inputStyle}
                value={offer.on_expire}
                onChange={e => onUpdate({ on_expire: e.target.value as OnExpireBehavior })}
              >
                <option value="hide_button">Hide buy button</option>
                <option value="waitlist">Redirect to waitlist</option>
                <option value="full_price">Show full price</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Stock limit */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>Stock limit</p>
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>Cap the number of sales for scarcity.</p>
          </div>
          <Toggle on={stockEnabled} onChange={v => onUpdate({ stock_limit: v ? 100 : null })} />
        </div>
        {stockEnabled && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--app-border)", maxWidth: 200 }}>
            <label style={labelStyle}>Limit</label>
            <input
              type="number" min={1} style={inputStyle}
              value={offer.stock_limit ?? 100}
              onChange={e => onUpdate({ stock_limit: parseInt(e.target.value) || 1 })}
            />
          </div>
        )}
      </div>

      {/* Abandoned checkout recovery */}
      <div style={{ ...cardStyle, padding: 20, opacity: 0.65 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>Abandoned checkout recovery</p>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--app-text-quiet)", background: "var(--app-border)", padding: "2px 7px", borderRadius: 999 }}>Soon</span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>Follow up with buyers who started but didn&apos;t complete checkout.</p>
          </div>
          <Toggle on={false} onChange={() => {}} />
        </div>
      </div>
    </div>
  );
}
