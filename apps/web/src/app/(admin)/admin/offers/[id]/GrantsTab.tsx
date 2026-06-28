"use client";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { OfferGrant, OfferGrantType } from "@/types/offers";
import { GRANT_TYPES, GRANT_LABELS, GRANT_COLORS, defaultGrant, grantLine } from "@/types/offers";
import SortableList, { DragHandle } from "../../academy/SortableList";
import { cardStyle, inputStyle, labelStyle } from "./shared";
import { GRANT_ICONS, GRANT_HINTS } from "../grantIcons";

interface AcademyProductOption { id: string; name: string; product_type?: string }

interface Props {
  grants: OfferGrant[];
  onChange: (next: OfferGrant[]) => void;
}

export default function GrantsTab({ grants, onChange }: Props) {
  const [academyProducts, setAcademyProducts] = useState<AcademyProductOption[]>([]);
  const [loadingAcademy, setLoadingAcademy] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/academy", { signal: ac.signal })
      .then(r => r.json())
      .then(d => { if (!ac.signal.aborted) setAcademyProducts(d.products ?? []); })
      .catch(() => {})
      .finally(() => { if (!ac.signal.aborted) setLoadingAcademy(false); });
    return () => ac.abort();
  }, []);

  function updateGrant(id: string, patch: Partial<OfferGrant>) {
    onChange(grants.map(g => (g.id === id ? ({ ...g, ...patch } as OfferGrant) : g)));
  }

  function removeGrant(id: string) {
    onChange(grants.filter(g => g.id !== id));
  }

  function addGrant(type: OfferGrantType) {
    onChange([...grants, defaultGrant(type)]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>What&apos;s included</h2>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "var(--app-text-muted)",
            background: "var(--app-surface-strong)", borderRadius: 999, padding: "2px 8px",
          }}>{grants.length} grant{grants.length === 1 ? "" : "s"}</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          The stack of things a buyer receives when they complete checkout. Drag to reorder how they appear on the checkout page.
        </p>
      </div>

      {grants.length === 0 ? (
        <div style={{ ...cardStyle, padding: "32px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--app-text-quiet)" }}>No grants yet — add one below to build the offer.</p>
        </div>
      ) : (
        <SortableList
          items={grants}
          onReorder={onChange}
          renderItem={(grant, handle) => (
            <GrantCard
              grant={grant}
              dragListeners={handle.listeners}
              academyProducts={academyProducts}
              loadingAcademy={loadingAcademy}
              onUpdate={patch => updateGrant(grant.id, patch)}
              onRemove={() => removeGrant(grant.id)}
            />
          )}
          className="offer-grant-list"
        />
      )}

      {/* Add a grant */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Add a grant</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {GRANT_TYPES.map(type => {
            const color = GRANT_COLORS[type];
            const Icon = GRANT_ICONS[type];
            return (
              <button
                key={type}
                onClick={() => addGrant(type)}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: "1.5px solid var(--app-border)",
                  background: "var(--app-surface)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "border-color 0.12s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: `${color}1a`, border: `1px solid ${color}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.8} color={color} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--app-text)" }}>{GRANT_LABELS[type]}</span>
                <span style={{ fontSize: 10.5, color: "var(--app-text-quiet)", lineHeight: 1.4 }}>{GRANT_HINTS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Single grant card ──────────────────────────────────────────────────────────

function GrantCard({
  grant, dragListeners, academyProducts, loadingAcademy, onUpdate, onRemove,
}: {
  grant: OfferGrant;
  dragListeners: Record<string, unknown> | undefined;
  academyProducts: AcademyProductOption[];
  loadingAcademy: boolean;
  onUpdate: (patch: Partial<OfferGrant>) => void;
  onRemove: () => void;
}) {
  const color = GRANT_COLORS[grant.type];
  const Icon = GRANT_ICONS[grant.type];

  return (
    <div style={{ ...cardStyle, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <DragHandle listeners={dragListeners} label="Reorder grant" />
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `${color}1a`, border: `1px solid ${color}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.8} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>{GRANT_LABELS[grant.type]}</span>
            {grant.type === "custom" ? (
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                color: "var(--app-warning)", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>Manual fulfillment</span>
            ) : (
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                color: "var(--app-success)", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>Auto-fulfilled</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginBottom: 12 }}>{grantLine(grant)}</p>

          <GrantControls grant={grant} academyProducts={academyProducts} loadingAcademy={loadingAcademy} onUpdate={onUpdate} />
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove grant"
          style={{ background: "transparent", border: "none", color: "var(--app-text-quiet)", cursor: "pointer", padding: 2, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--app-danger)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-quiet)")}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function GrantControls({
  grant, academyProducts, loadingAcademy, onUpdate,
}: {
  grant: OfferGrant;
  academyProducts: AcademyProductOption[];
  loadingAcademy: boolean;
  onUpdate: (patch: Partial<OfferGrant>) => void;
}) {
  switch (grant.type) {
    case "plan":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 360 }}>
          <div>
            <label style={labelStyle}>Tier</label>
            <select style={inputStyle} value={grant.tier} onChange={e => onUpdate({ tier: e.target.value as "starter" | "growth" | "scale" })}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="scale">Scale</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Months</label>
            <input type="number" min={1} style={inputStyle} value={grant.months} onChange={e => onUpdate({ months: parseInt(e.target.value) || 1 })} />
          </div>
        </div>
      );
    case "inbox":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, maxWidth: 480 }}>
          <div>
            <label style={labelStyle}>Qty</label>
            <input type="number" min={1} style={inputStyle} value={grant.qty} onChange={e => onUpdate({ qty: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <label style={labelStyle}>Free months</label>
            <input type="number" min={0} style={inputStyle} value={grant.freeMonths} onChange={e => onUpdate({ freeMonths: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={labelStyle}>After free period</label>
            <select style={inputStyle} value={grant.after} onChange={e => onUpdate({ after: e.target.value as "bill" | "free" | "cancel" })}>
              <option value="bill">Customer pays</option>
              <option value="free">Stays free</option>
              <option value="cancel">Cancel</option>
            </select>
          </div>
        </div>
      );
    case "credits":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 360 }}>
          <div>
            <label style={labelStyle}>Qty</label>
            <input type="number" min={1} style={inputStyle} value={grant.qty} onChange={e => onUpdate({ qty: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <label style={labelStyle}>Recurrence</label>
            <select style={inputStyle} value={grant.recurring ? "recurring" : "once"} onChange={e => onUpdate({ recurring: e.target.value === "recurring" })}>
              <option value="once">One-time</option>
              <option value="recurring">Monthly recurring</option>
            </select>
          </div>
        </div>
      );
    case "seats":
      return (
        <div style={{ maxWidth: 160 }}>
          <label style={labelStyle}>Qty</label>
          <input type="number" min={1} style={inputStyle} value={grant.qty} onChange={e => onUpdate({ qty: parseInt(e.target.value) || 1 })} />
        </div>
      );
    case "community":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 480 }}>
          <div>
            <label style={labelStyle}>Invite URL</label>
            <input style={inputStyle} value={grant.inviteUrl} onChange={e => onUpdate({ inviteUrl: e.target.value })} placeholder="https://chat.whatsapp.com/…" />
          </div>
          <div>
            <label style={labelStyle}>Label</label>
            <input style={inputStyle} value={grant.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Private community" />
          </div>
        </div>
      );
    case "academy": {
      const isOrphaned = !loadingAcademy && !!grant.productId && !academyProducts.some(p => p.id === grant.productId);
      return (
        <div style={{ maxWidth: 360 }}>
          <label style={labelStyle}>Academy product</label>
          <select
            style={inputStyle}
            value={grant.productId}
            disabled={loadingAcademy}
            onChange={e => {
              const product = academyProducts.find(p => p.id === e.target.value);
              onUpdate({ productId: e.target.value, label: product?.name ?? grant.label });
            }}
          >
            <option value="">{loadingAcademy ? "Loading…" : "Select a product…"}</option>
            {isOrphaned && <option value={grant.productId}>⚠ Unknown product ({grant.productId})</option>}
            {academyProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {isOrphaned && (
            <p style={{ fontSize: 12, color: "var(--app-warning, #f59e0b)", marginTop: 6 }}>
              This product no longer exists. Re-select a product or this grant will fail to fulfil at checkout.
            </p>
          )}
        </div>
      );
    }
    case "ip":
      return (
        <div style={{ maxWidth: 360 }}>
          <label style={labelStyle}>Label</label>
          <input style={inputStyle} value={grant.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Dedicated sending IP" />
        </div>
      );
    case "custom":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
          <div>
            <label style={labelStyle}>Label</label>
            <input style={inputStyle} value={grant.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="Custom perk" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
              value={grant.description}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="What does this include, and how will it be fulfilled?"
            />
          </div>
        </div>
      );
  }
}
