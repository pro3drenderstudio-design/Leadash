"use client";

/**
 * Admin authoring widget for the per-course banner that renders at the top
 * of the student's course landing page.
 *
 * Talks to PATCH /api/admin/academy/products with the banner_* fields.
 * All fields are optional — partial banners (no image, just headline + CTA)
 * are valid.
 */

import { useEffect, useState } from "react";

type BannerFields = {
  banner_image_url:  string | null;
  banner_headline:   string | null;
  banner_sub:        string | null;
  banner_cta_text:   string | null;
  banner_cta_url:    string | null;
};

interface Props {
  productId: string;
  initial:   Partial<BannerFields>;
  onSaved?:  (next: BannerFields) => void;
}

export default function CourseBannerEditor({ productId, initial, onSaved }: Props) {
  const [fields, setFields] = useState<BannerFields>({
    banner_image_url: initial.banner_image_url ?? "",
    banner_headline:  initial.banner_headline  ?? "",
    banner_sub:       initial.banner_sub       ?? "",
    banner_cta_text:  initial.banner_cta_text  ?? "",
    banner_cta_url:   initial.banner_cta_url   ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);

  // Re-seed when the parent loads a different product.
  useEffect(() => {
    setFields({
      banner_image_url: initial.banner_image_url ?? "",
      banner_headline:  initial.banner_headline  ?? "",
      banner_sub:       initial.banner_sub       ?? "",
      banner_cta_text:  initial.banner_cta_text  ?? "",
      banner_cta_url:   initial.banner_cta_url   ?? "",
    });
  }, [productId, initial.banner_image_url, initial.banner_headline, initial.banner_sub, initial.banner_cta_text, initial.banner_cta_url]);

  async function save() {
    setSaving(true);
    setMsg(null);
    // Convert empty strings → null so the DB row has explicit unset values
    // instead of empty strings that the renderer would still treat as "set".
    const payload: Partial<BannerFields> & { id: string } = {
      id: productId,
      banner_image_url: fields.banner_image_url || null,
      banner_headline:  fields.banner_headline  || null,
      banner_sub:       fields.banner_sub       || null,
      banner_cta_text:  fields.banner_cta_text  || null,
      banner_cta_url:   fields.banner_cta_url   || null,
    };
    const res = await fetch("/api/admin/academy/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json());
    setSaving(false);
    if (res.product) {
      setMsg("Banner saved.");
      setTimeout(() => setMsg(null), 2000);
      onSaved?.({
        banner_image_url: res.product.banner_image_url ?? null,
        banner_headline:  res.product.banner_headline  ?? null,
        banner_sub:       res.product.banner_sub       ?? null,
        banner_cta_text:  res.product.banner_cta_text  ?? null,
        banner_cta_url:   res.product.banner_cta_url   ?? null,
      });
    } else {
      setMsg(res.error ?? "Failed to save");
    }
  }

  return (
    <div style={{
      background: "var(--app-bg-elevated)",
      border: "1px solid var(--app-border)",
      borderRadius: "var(--app-radius-lg)",
      padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)" }}>Course banner</span>
        {msg && <span style={{ fontSize: 12, color: "#34d399" }}>{msg}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="ac-label">Image URL (optional)</label>
          <input
            value={fields.banner_image_url ?? ""}
            onChange={e => setFields(f => ({ ...f, banner_image_url: e.target.value }))}
            placeholder="https://…/banner.jpg"
            className="ac-input"
          />
        </div>

        <div>
          <label className="ac-label">Headline</label>
          <input
            value={fields.banner_headline ?? ""}
            onChange={e => setFields(f => ({ ...f, banner_headline: e.target.value }))}
            placeholder="Welcome to the challenge"
            className="ac-input"
          />
        </div>

        <div>
          <label className="ac-label">Subtitle</label>
          <textarea
            rows={2}
            value={fields.banner_sub ?? ""}
            onChange={e => setFields(f => ({ ...f, banner_sub: e.target.value }))}
            placeholder="Short context line that sits under the headline."
            className="ac-textarea"
            style={{ resize: "none" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="ac-label">CTA text</label>
            <input
              value={fields.banner_cta_text ?? ""}
              onChange={e => setFields(f => ({ ...f, banner_cta_text: e.target.value }))}
              placeholder="Start the challenge"
              className="ac-input"
            />
          </div>
          <div>
            <label className="ac-label">CTA URL</label>
            <input
              value={fields.banner_cta_url ?? ""}
              onChange={e => setFields(f => ({ ...f, banner_cta_url: e.target.value }))}
              placeholder="https://… or /academy/…"
              className="ac-input"
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
          <button onClick={save} disabled={saving} className="app-btn app-btn-primary">
            {saving ? "Saving…" : "Save banner"}
          </button>
        </div>
      </div>
    </div>
  );
}
