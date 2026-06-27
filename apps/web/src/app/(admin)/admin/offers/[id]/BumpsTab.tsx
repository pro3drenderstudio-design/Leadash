"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { Offer, OfferBump, OfferGrantType, OfferUpsell } from "@/types/offers";
import { GRANT_TYPES, GRANT_LABELS, GRANT_COLORS, defaultGrant, formatOfferPrice } from "@/types/offers";
import { cardStyle, inputStyle, labelStyle, Toggle, btnGhost } from "./shared";
import { GRANT_ICONS } from "../grantIcons";

interface Props {
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function pickGrantType(promptLabel: string, fallback: OfferGrantType): OfferGrantType {
  const choices = GRANT_TYPES.map((t, i) => `${i + 1}. ${GRANT_LABELS[t]}`).join("\n");
  const raw = window.prompt(`${promptLabel}\n\n${choices}\n\nEnter a number (default ${fallback}):`);
  if (!raw) return fallback;
  const idx = parseInt(raw.trim(), 10) - 1;
  return GRANT_TYPES[idx] ?? fallback;
}

export default function BumpsTab({ offer, onUpdate }: Props) {
  function addBump() {
    const label = window.prompt("Bump label", "Add dedicated sending IP");
    if (!label) return;
    const priceRaw = window.prompt("Bump price (₦)", "15000");
    const price_ngn = parseInt(priceRaw ?? "0", 10) || 0;
    const type = pickGrantType("What does this bump grant?", "ip");
    const bump: OfferBump = {
      id: newId(),
      grant: defaultGrant(type),
      label,
      price_ngn,
      recurring: false,
      is_active: true,
    };
    onUpdate({ bumps: [...offer.bumps, bump] });
  }

  function updateBump(id: string, patch: Partial<OfferBump>) {
    onUpdate({ bumps: offer.bumps.map(b => (b.id === id ? { ...b, ...patch } : b)) });
  }

  function removeBump(id: string) {
    onUpdate({ bumps: offer.bumps.filter(b => b.id !== id) });
  }

  function addUpsellOrDownsell(kind: "upsell" | "downsell") {
    const fresh: OfferUpsell = { id: newId(), label: "", description: "", price_ngn: 0, grant: null, kind, is_active: true };
    onUpdate(kind === "upsell" ? { upsell: fresh } : { downsell: fresh });
  }

  function updateUpsell(kind: "upsell" | "downsell", patch: Partial<OfferUpsell>) {
    const current = kind === "upsell" ? offer.upsell : offer.downsell;
    if (!current) return;
    onUpdate(kind === "upsell" ? { upsell: { ...current, ...patch } } : { downsell: { ...current, ...patch } });
  }

  function addGrantToUpsell(kind: "upsell" | "downsell") {
    const type = pickGrantType("What does this offer grant?", "credits");
    updateUpsell(kind, { grant: defaultGrant(type) });
  }

  function removeUpsell(kind: "upsell" | "downsell") {
    onUpdate(kind === "upsell" ? { upsell: null } : { downsell: null });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Bumps &amp; upsells</h2>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          Extra revenue opportunities at checkout and immediately after purchase.
        </p>
      </div>

      {/* Order bump */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>Order bump</h3>
          <button onClick={addBump} style={btnGhost}>
            <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
            Add another bump
          </button>
        </div>
        {offer.bumps.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No order bumps yet. A bump is a one-click add-on shown right on the checkout page.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {offer.bumps.map(b => {
              const color = GRANT_COLORS[b.grant.type];
              const Icon = GRANT_ICONS[b.grant.type];
              return (
                <div key={b.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 9, background: "var(--app-surface)", border: "1px solid var(--app-border)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: `${color}1a`, border: `1px solid ${color}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.8} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</p>
                    <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>{formatOfferPrice(b.price_ngn)}{b.recurring ? "/mo" : ""}</p>
                  </div>
                  <Toggle on={b.is_active} onChange={v => updateBump(b.id, { is_active: v })} />
                  <button onClick={() => removeBump(b.id)} aria-label="Remove bump" style={{ background: "transparent", border: "none", color: "var(--app-text-quiet)", cursor: "pointer", padding: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--app-danger)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-quiet)")}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upsell */}
      <UpsellCard
        title="One-click upsell"
        subtitle="Shown immediately after purchase, before the confirmation page."
        upsell={offer.upsell}
        onCreate={() => addUpsellOrDownsell("upsell")}
        onUpdate={patch => updateUpsell("upsell", patch)}
        onAddGrant={() => addGrantToUpsell("upsell")}
        onRemove={() => removeUpsell("upsell")}
        muted={false}
      />

      {/* Downsell */}
      <UpsellCard
        title="Downsell"
        subtitle="Shown if the buyer declines the upsell above — a softer, usually cheaper offer."
        upsell={offer.downsell}
        onCreate={() => addUpsellOrDownsell("downsell")}
        onUpdate={patch => updateUpsell("downsell", patch)}
        onAddGrant={() => addGrantToUpsell("downsell")}
        onRemove={() => removeUpsell("downsell")}
        muted
      />
    </div>
  );
}

function UpsellCard({
  title, subtitle, upsell, onCreate, onUpdate, onAddGrant, onRemove, muted,
}: {
  title: string;
  subtitle: string;
  upsell: OfferUpsell | null;
  onCreate: () => void;
  onUpdate: (patch: Partial<OfferUpsell>) => void;
  onAddGrant: () => void;
  onRemove: () => void;
  muted: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: 20, opacity: muted && !upsell ? 0.85 : 1 }}>
      <div style={{ marginBottom: upsell ? 16 : 12 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, color: muted ? "var(--app-text-muted)" : "var(--app-text)" }}>{title}</h3>
        <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 4 }}>{subtitle}</p>
      </div>

      {!upsell ? (
        <button onClick={onCreate} className="app-btn app-btn-ghost">
          <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
          Add {title.toLowerCase()}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Label</label>
              <input style={inputStyle} value={upsell.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Upgrade to the Pro bundle" />
            </div>
            <div>
              <label style={labelStyle}>Price (₦)</label>
              <input type="number" min={0} style={inputStyle} value={upsell.price_ngn} onChange={e => onUpdate({ price_ngn: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={upsell.description} onChange={e => onUpdate({ description: e.target.value })} placeholder="One short sentence on why they should accept" />
          </div>

          <div>
            <label style={labelStyle}>Grant</label>
            {upsell.grant ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                <HugeiconsIcon icon={GRANT_ICONS[upsell.grant.type]} size={14} strokeWidth={1.8} color={GRANT_COLORS[upsell.grant.type]} />
                <span style={{ fontSize: 12.5, color: "var(--app-text)" }}>{GRANT_LABELS[upsell.grant.type]}</span>
                <button onClick={onAddGrant} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--app-text-quiet)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
              </div>
            ) : (
              <button onClick={onAddGrant} style={btnGhost}>
                <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                Add a grant to this {upsell.kind}
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--app-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>Active</span>
              <Toggle on={upsell.is_active} onChange={v => onUpdate({ is_active: v })} />
            </div>
            <button onClick={onRemove} style={{ ...btnGhost, color: "var(--app-danger)" }}>
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
              Remove {title.toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
