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

  const input = "w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500";
  const label = "block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="px-4 py-3 bg-gray-900/30 border-l-2 border-gray-700 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Section CTA</span>
        {msg && <span className="text-[10px] text-emerald-400">{msg}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Label</label>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Continue to next module" className={input} />
        </div>
        <div>
          <label className={label}>URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… or /academy/…" className={input} />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-2.5 py-1 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded">
          {saving ? "Saving…" : "Save CTA"}
        </button>
      </div>
    </div>
  );
}
