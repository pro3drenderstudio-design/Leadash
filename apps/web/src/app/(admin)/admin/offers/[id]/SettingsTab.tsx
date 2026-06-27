"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Delete02Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import type { AfterPurchaseAction, NoWorkspaceAction, Offer } from "@/types/offers";
import { cardStyle, inputStyle, labelStyle, Toggle, btnPrimary, btnGhost } from "./shared";

interface Props {
  offerId: string;
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
  showToast: (msg: string) => void;
}

export default function SettingsTab({ offerId, offer, onUpdate, showToast }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleStatus() {
    const next = offer.status === "active" ? "paused" : "active";
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Failed to update status"); return; }
      onUpdate({ status: d.offer.status });
      showToast(next === "active" ? "Offer published" : "Offer paused");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/duplicate`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Failed to duplicate"); return; }
      router.push(`/admin/offers/${d.offer.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${offer.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? "Failed to delete"); return; }
      router.push("/admin/offers");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Settings</h2>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          Fulfillment behavior, post-purchase flow, and notifications.
        </p>
      </div>

      {/* Fulfillment */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Fulfillment</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text)" }}>Auto-grant on payment</p>
              <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>Grants are applied automatically the moment payment succeeds.</p>
            </div>
            <Toggle on={offer.auto_grant} onChange={v => onUpdate({ auto_grant: v })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text)" }}>Manual approval</p>
              <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>
                When enabled, fulfillment is held for admin review — useful for offers with custom grants.
              </p>
            </div>
            <Toggle on={offer.manual_approval} onChange={v => onUpdate({ manual_approval: v })} />
          </div>
          <div>
            <label style={labelStyle}>When buyer has no workspace</label>
            <select
              style={inputStyle}
              value={offer.no_workspace_action}
              onChange={e => onUpdate({ no_workspace_action: e.target.value as NoWorkspaceAction })}
            >
              <option value="create">Create one &amp; send login</option>
              <option value="invite">Send signup invite</option>
              <option value="attach_by_email">Attach to existing by email</option>
            </select>
          </div>
        </div>
      </div>

      {/* After purchase */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>After purchase</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Redirect buyer to</label>
            <select
              style={inputStyle}
              value={offer.after_purchase}
              onChange={e => onUpdate({ after_purchase: e.target.value as AfterPurchaseAction })}
            >
              <option value="confirmation">Confirmation page (default)</option>
              <option value="custom_url">Custom URL</option>
              <option value="dashboard">Straight to dashboard</option>
            </select>
          </div>
          {offer.after_purchase === "custom_url" && (
            <div>
              <label style={labelStyle}>Custom URL</label>
              <input
                style={inputStyle}
                value={offer.custom_url ?? ""}
                onChange={e => onUpdate({ custom_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
          )}
          {([
            { key: "send_receipt", label: "Send email receipt" },
            { key: "send_whatsapp", label: "Send WhatsApp confirmation" },
            { key: "notify_admin", label: "Notify admin on sale" },
          ] as { key: keyof Offer; label: string }[]).map(row => (
            <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--app-text)" }}>{row.label}</span>
              <Toggle on={Boolean(offer[row.key])} onChange={v => onUpdate({ [row.key]: v } as Partial<Offer>)} />
            </div>
          ))}
        </div>
      </div>

      {/* Refunds & access */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Refunds &amp; access</h3>
        <div>
          <label style={labelStyle}>Refund window</label>
          <select
            style={inputStyle}
            value={offer.refund_window_days}
            onChange={e => onUpdate({ refund_window_days: parseInt(e.target.value, 10) })}
          >
            <option value={0}>No refunds</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 10, lineHeight: 1.5 }}>
          When a purchase is refunded within this window, granted access (plans, inboxes, credits, seats) is automatically revoked.
          Refunds outside the window must be handled manually.
        </p>
      </div>

      {/* Danger zone / status actions */}
      <div style={{ ...cardStyle, padding: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={toggleStatus} disabled={busy} style={btnPrimary}>
          {offer.status === "active" ? "Pause offer" : "Publish offer"}
        </button>
        <button onClick={duplicate} disabled={busy} style={btnGhost}>
          <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
          Duplicate
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={remove} disabled={busy} style={{ ...btnGhost, color: "var(--app-danger)" }}>
          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.8} />
          Delete offer
        </button>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 10,
        background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.2)",
      }}>
        <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} color="var(--app-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11.5, color: "var(--app-text-muted)", lineHeight: 1.5 }}>
          Deleting an offer does not refund or revoke access for existing buyers — it only removes the offer and its checkout page.
        </p>
      </div>
    </div>
  );
}
