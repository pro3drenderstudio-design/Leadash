"use client";

/**
 * Compact CTA editor for an academy_sections row.
 *
 * The student-side rendering of section-level CTAs is deferred to the next
 * iteration of the curriculum view; the API + storage are wired so authors
 * can populate the fields now and the player will pick them up the moment
 * the rendering ships.
 */

import { useEffect, useState } from "react";

interface Props {
  sectionId: string;
  initialCta: { text: string | null; url: string | null };
  onSaved?:   (next: { cta_text: string | null; cta_url: string | null }) => void;
}

export default function SectionSettingsEditor({ sectionId, initialCta, onSaved }: Props) {
  const [text, setText]   = useState(initialCta.text ?? "");
  const [url,  setUrl]    = useState(initialCta.url  ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);

  useEffect(() => {
    setText(initialCta.text ?? "");
    setUrl(initialCta.url ?? "");
  }, [sectionId, initialCta.text, initialCta.url]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/academy/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sectionId,
        cta_text: text || null,
        cta_url:  url  || null,
      }),
    }).then(r => r.json());
    setSaving(false);
    if (res.section) {
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 1800);
      onSaved?.({
        cta_text: res.section.cta_text ?? null,
        cta_url:  res.section.cta_url  ?? null,
      });
    } else {
      setMsg(res.error ?? "Failed");
    }
  }

  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--app-surface)",
      borderLeft: "2px solid var(--app-border-strong)",
      borderRadius: 4,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--app-text-quiet)", fontWeight: 600 }}>
          Section CTA
        </span>
        {msg && <span style={{ fontSize: 10, color: "#34d399" }}>{msg}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label className="ac-label">Label</label>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Continue to next module" className="ac-input" />
        </div>
        <div>
          <label className="ac-label">URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… or /academy/…" className="ac-input" />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} disabled={saving} className="app-btn app-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>
          {saving ? "Saving…" : "Save CTA"}
        </button>
      </div>
    </div>
  );
}
