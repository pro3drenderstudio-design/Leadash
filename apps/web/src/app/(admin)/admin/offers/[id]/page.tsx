"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  EyeIcon,
  FloppyDiskIcon,
  ChartBarLineIcon,
  ShoppingBag01Icon,
  CreditCardIcon,
  Tag01Icon,
  Megaphone01Icon,
  Share08Icon,
  Settings02Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import type { Offer, OfferStatus } from "@/types/offers";
import SummaryRail from "./SummaryRail";
import GrantsTab from "./GrantsTab";
import PricingTab from "./PricingTab";
import CheckoutTab from "./CheckoutTab";
import BumpsTab from "./BumpsTab";
import PromotionTab from "./PromotionTab";
import SharingTab from "./SharingTab";
import SettingsTab from "./SettingsTab";
import { btnPrimary, btnGhost } from "./shared";

type BuilderTab = "grants" | "pricing" | "checkout" | "bumps" | "promotion" | "sharing" | "settings";

const TABS: { key: BuilderTab; label: string; icon: typeof ShoppingBag01Icon }[] = [
  { key: "grants", label: "What's included", icon: ShoppingBag01Icon },
  { key: "pricing", label: "Pricing", icon: CreditCardIcon },
  { key: "checkout", label: "Checkout page", icon: Tag01Icon },
  { key: "bumps", label: "Bumps & Upsells", icon: Megaphone01Icon },
  { key: "promotion", label: "Promotion", icon: GitBranchIcon },
  { key: "sharing", label: "Sharing & Funnel", icon: Share08Icon },
  { key: "settings", label: "Settings", icon: Settings02Icon },
];

// Fields the PATCH route accepts — keep in lock-step with PATCHABLE_FIELDS in
// /api/admin/offers/[id]/route.ts so "Save changes" never sends unknown keys.
const SAVE_FIELDS: (keyof Offer)[] = [
  "name", "status", "pricing_model", "price_ngn", "compare_at_ngn", "currency_mode",
  "billing_interval", "trial_days", "installments", "pwyw_min_ngn",
  "grants", "bumps", "upsell", "downsell", "checkout",
  "expires_at", "on_expire", "stock_limit", "recover_abandoned",
  "auto_grant", "manual_approval", "no_workspace_action", "after_purchase", "custom_url",
  "send_receipt", "send_whatsapp", "notify_admin", "refund_window_days",
  "funnel_ids", "slug",
];

export default function OfferBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const offerId = params.id;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BuilderTab>("grants");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}`);
      const d = await res.json();
      if (res.ok) setOffer(d.offer);
      else showToast(d.error ?? "Failed to load offer");
    } finally {
      setLoading(false);
    }
  }, [offerId, showToast]);

  useEffect(() => { load(); }, [load]);

  function updateOffer(patch: Partial<Offer>) {
    setOffer(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  async function saveChanges() {
    if (!offer) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      for (const key of SAVE_FIELDS) body[key] = offer[key];
      const res = await fetch(`/api/admin/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Failed to save"); return; }
      setOffer(d.offer);
      setDirty(false);
      showToast("Offer saved");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: OfferStatus) {
    if (!offer) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Failed to update status"); return; }
      setOffer(d.offer);
      showToast(status === "active" ? "Offer published" : "Offer paused");
    } finally {
      setSaving(false);
    }
  }

  function previewCheckout() {
    if (!offer) return;
    window.open(`/o/${offer.slug}?preview=1`, "_blank", "noopener,noreferrer");
  }

  if (loading || !offer) {
    return (
      <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)", padding: "60px 28px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--app-text-quiet)" }}>Loading offer…</p>
      </div>
    );
  }

  const statusChip = offer.status === "active"
    ? { label: "Live", bg: "rgba(52,211,153,0.1)", color: "var(--app-success)", border: "rgba(52,211,153,0.25)" }
    : offer.status === "paused"
      ? { label: "Paused", bg: "rgba(251,191,36,0.1)", color: "var(--app-warning)", border: "rgba(251,191,36,0.25)" }
      : { label: "Draft", bg: "var(--app-surface)", color: "var(--app-text-muted)", border: "var(--app-border)" };

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--app-border)", padding: "18px 28px", background: "var(--app-bg-sunken)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <button
              onClick={() => router.push("/admin/offers")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, color: "var(--app-text-muted)",
                background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--app-text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-muted)")}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />
              All offers
            </button>
            <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginBottom: 4 }}>
              Monetization / Offers / {offer.name}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--app-text)" }}>{offer.name}</h1>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                color: statusChip.color, background: statusChip.bg, border: `1px solid ${statusChip.border}`,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>{statusChip.label}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => router.push(`/admin/offers/${offerId}/analytics`)} style={btnGhost}>
              <HugeiconsIcon icon={ChartBarLineIcon} size={13} strokeWidth={1.8} />
              View analytics
            </button>
            <button onClick={previewCheckout} style={btnGhost}>
              <HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={1.8} />
              Preview checkout
            </button>
            <button
              onClick={() => setStatus(offer.status === "active" ? "paused" : "active")}
              disabled={saving}
              className="app-btn app-btn-secondary"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {offer.status === "active" ? "Pause" : "Publish"}
            </button>
            <button onClick={saveChanges} disabled={!dirty || saving} style={{ ...btnPrimary, opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? "not-allowed" : "pointer" }}>
              <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginTop: 18, overflowX: "auto" }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--app-text)" : "var(--app-text-muted)",
                  background: "transparent", border: "none",
                  borderBottom: active ? "2px solid var(--app-accent)" : "2px solid transparent",
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", marginBottom: -1,
                  transition: "color 0.15s ease",
                }}
              >
                <HugeiconsIcon icon={t.icon} size={14} strokeWidth={1.8} />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main style={{ padding: "24px 28px" }}>
        {tab === "checkout" ? (
          <CheckoutTab offer={offer} onUpdate={updateOffer} />
        ) : (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tab === "grants" && (
                <GrantsTab grants={offer.grants} onChange={grants => updateOffer({ grants })} />
              )}
              {tab === "pricing" && (
                <PricingTab offer={offer} onUpdate={updateOffer} />
              )}
              {tab === "bumps" && (
                <BumpsTab offer={offer} onUpdate={updateOffer} />
              )}
              {tab === "promotion" && (
                <PromotionTab offerId={offerId} offer={offer} onUpdate={updateOffer} showToast={showToast} />
              )}
              {tab === "sharing" && (
                <SharingTab offer={offer} onUpdate={updateOffer} showToast={showToast} />
              )}
              {tab === "settings" && (
                <SettingsTab offerId={offerId} offer={offer} onUpdate={updateOffer} showToast={showToast} />
              )}
            </div>
            <SummaryRail offer={offer} onPreview={previewCheckout} />
          </div>
        )}
      </main>

      {/* Toast */}
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
