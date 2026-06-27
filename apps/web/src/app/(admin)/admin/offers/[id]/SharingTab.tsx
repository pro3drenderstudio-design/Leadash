"use client";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, QrCodeIcon, Download01Icon, Share08Icon } from "@hugeicons/core-free-icons";
import type { Offer } from "@/types/offers";
import { cardStyle, btnGhost } from "./shared";

interface FunnelOption { id: string; name: string; status: string }

interface Props {
  offer: Offer;
  onUpdate: (patch: Partial<Offer>) => void;
  showToast: (msg: string) => void;
}

export default function SharingTab({ offer, onUpdate, showToast }: Props) {
  const [funnels, setFunnels] = useState<FunnelOption[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/funnels", { signal: ac.signal })
      .then(r => r.json())
      .then(d => { if (!ac.signal.aborted) setFunnels(d.funnels ?? []); })
      .catch(() => {})
      .finally(() => { if (!ac.signal.aborted) setLoadingFunnels(false); });
    return () => ac.abort();
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => showToast(`Copied ${label}`));
  }

  function toggleFunnel(id: string) {
    const set = new Set(offer.funnel_ids);
    if (set.has(id)) set.delete(id); else set.add(id);
    onUpdate({ funnel_ids: Array.from(set) });
  }

  const links = [
    { label: "Public checkout", value: `${origin}/o/${offer.slug}` },
    { label: "Pre-filled contact link", value: `${origin}/o/${offer.slug}?c={contact_id}` },
    { label: "Embed snippet", value: `<script src="${origin}/embed.js" data-offer="${offer.id}"></script>` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Sharing &amp; funnel</h2>
        <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", marginTop: 4 }}>
          Where this offer is sold, and how to share it.
        </p>
      </div>

      {/* Checkout links */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Checkout links</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {links.map(l => (
            <div key={l.label}>
              <p style={{ fontSize: 10.5, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>{l.label}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{
                  flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 8,
                  background: "var(--app-bg)", border: "1px solid var(--app-border-strong)",
                  fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: "var(--app-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{l.value}</div>
                <button onClick={() => copy(l.value, l.label)} style={btnGhost}>
                  <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Used in funnels */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>Used in funnels</h3>
        {loadingFunnels ? (
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>Loading…</p>
        ) : funnels.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>No funnels exist yet — create one from the Funnels page.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {funnels.map(f => {
              const active = offer.funnel_ids.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFunnel(f.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 12px", borderRadius: 999,
                    border: `1.5px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
                    background: active ? "var(--app-accent-soft)" : "var(--app-surface)",
                    color: active ? "var(--app-accent)" : "var(--app-text-muted)",
                    fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {f.name}
                  <span style={{ fontSize: 10, color: active ? "var(--app-accent)" : "var(--app-text-quiet)", opacity: 0.8 }}>{f.status}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* QR & social */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>QR &amp; social</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10, flexShrink: 0,
            background: "var(--app-surface)", border: "1px solid var(--app-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HugeiconsIcon icon={QrCodeIcon} size={26} strokeWidth={1.5} color="var(--app-text-quiet)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => showToast("Coming soon")} style={btnGhost}>
              <HugeiconsIcon icon={Download01Icon} size={13} strokeWidth={1.8} />
              Download QR
            </button>
            <button onClick={() => showToast("Coming soon")} style={btnGhost}>
              <HugeiconsIcon icon={Share08Icon} size={13} strokeWidth={1.8} />
              Social card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
