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

  const label = "block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1";
  const input = "w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Course banner</span>
        {msg && <span className="text-xs text-emerald-400">{msg}</span>}
      </div>

      <div>
        <label className={label}>Image URL (optional)</label>
        <input
          value={fields.banner_image_url ?? ""}
          onChange={e => setFields(f => ({ ...f, banner_image_url: e.target.value }))}
          placeholder="https://…/banner.jpg"
          className={input}
        />
      </div>

      <div>
        <label className={label}>Headline</label>
        <input
          value={fields.banner_headline ?? ""}
          onChange={e => setFields(f => ({ ...f, banner_headline: e.target.value }))}
          placeholder="Welcome to the challenge"
          className={input}
        />
      </div>

      <div>
        <label className={label}>Subtitle</label>
        <textarea
          rows={2}
          value={fields.banner_sub ?? ""}
          onChange={e => setFields(f => ({ ...f, banner_sub: e.target.value }))}
          placeholder="Short context line that sits under the headline."
          className={input + " resize-none"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>CTA text</label>
          <input
            value={fields.banner_cta_text ?? ""}
            onChange={e => setFields(f => ({ ...f, banner_cta_text: e.target.value }))}
            placeholder="Start the challenge"
            className={input}
          />
        </div>
        <div>
          <label className={label}>CTA URL</label>
          <input
            value={fields.banner_cta_url ?? ""}
            onChange={e => setFields(f => ({ ...f, banner_cta_url: e.target.value }))}
            placeholder="https://… or /academy/…"
            className={input}
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded"
        >
          {saving ? "Saving…" : "Save banner"}
        </button>
      </div>
    </div>
  );
}
