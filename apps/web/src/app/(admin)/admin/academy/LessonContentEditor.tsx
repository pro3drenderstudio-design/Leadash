"use client";

/**
 * Admin authoring widget for one lesson's content extensions:
 *   • Ordered text blocks (rich_text / callout / code)
 *   • Resources (files + external links)
 *
 * Talks to:
 *   • /api/admin/academy/lesson-blocks       (CRUD)
 *   • /api/admin/academy/lesson-resources    (CRUD)
 *
 * Designed as a drop-in panel in the existing academy admin builder.
 * Keeps its own state per lesson — `useEffect` reloads when `lessonId`
 * changes so picking a different lesson resets the panel.
 *
 * Rich-text editing is a plain textarea for now (authors paste their
 * HTML / Markdown). A Tiptap upgrade can layer on top later without
 * changing the storage shape.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import TiptapEditor from "./TiptapEditor";

type Block = {
  id?: string;
  position: number;
  block_type: "rich_text" | "callout" | "code";
  content: string;
};

type Resource = {
  id?: string;
  position: number;
  resource_type: "file" | "link";
  label: string;
  description: string | null;
  url: string;
  file_mime: string | null;
  file_bytes: number | null;
};

export default function LessonContentEditor({ lessonId }: { lessonId: string }) {
  const [blocks, setBlocks]       = useState<Block[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, r] = await Promise.all([
      fetch(`/api/admin/academy/lesson-blocks?lesson_id=${lessonId}`).then(x => x.json()),
      fetch(`/api/admin/academy/lesson-resources?lesson_id=${lessonId}`).then(x => x.json()),
    ]);
    setBlocks(b.blocks    ?? []);
    setResources(r.resources ?? []);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { void load(); }, [load]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 2000);
  }

  // ── Blocks ─────────────────────────────────────────────────────────────
  async function addBlock(block_type: Block["block_type"]) {
    const res = await fetch("/api/admin/academy/lesson-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lessonId, block_type, content: "" }),
    }).then(r => r.json());
    if (res.block) {
      setBlocks(bs => [...bs, res.block]);
      flash("Block added.");
    }
  }

  async function saveBlock(block: Block) {
    if (!block.id) return;
    await fetch("/api/admin/academy/lesson-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id, block_type: block.block_type, content: block.content }),
    });
    flash("Block saved.");
  }

  async function deleteBlock(id: string) {
    if (!confirm("Delete this block?")) return;
    await fetch(`/api/admin/academy/lesson-blocks?id=${id}`, { method: "DELETE" });
    setBlocks(bs => bs.filter(b => b.id !== id));
  }

  async function moveBlock(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
    // Persist new positions (best-effort, fire-and-forget for both)
    await Promise.all([
      fetch("/api/admin/academy/lesson-blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: next[idx].id, position: idx }),
      }),
      fetch("/api/admin/academy/lesson-blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: next[target].id, position: target }),
      }),
    ]);
  }

  // ── Resources ───────────────────────────────────────────────────────────
  async function addResource(resource_type: Resource["resource_type"]) {
    const res = await fetch("/api/admin/academy/lesson-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_id: lessonId,
        resource_type,
        label: resource_type === "file" ? "New file" : "New link",
        url:   "",
      }),
    }).then(r => r.json());
    if (res.resource) {
      setResources(rs => [...rs, res.resource]);
      flash("Resource added.");
    }
  }

  async function saveResource(r: Resource) {
    if (!r.id) return;
    await fetch("/api/admin/academy/lesson-resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: r.id, label: r.label, description: r.description, url: r.url,
        resource_type: r.resource_type,
      }),
    });
    flash("Resource saved.");
  }

  async function deleteResource(id: string) {
    if (!confirm("Delete this resource?")) return;
    await fetch(`/api/admin/academy/lesson-resources?id=${id}`, { method: "DELETE" });
    setResources(rs => rs.filter(r => r.id !== id));
  }

  /**
   * Upload a file to Supabase Storage via the admin upload route, then
   * patch the in-progress resource with the returned url/mime/bytes.
   */
  async function uploadFileForResource(idx: number, file: File) {
    const r = resources[idx];
    if (!r) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("lesson_id", lessonId);
    setMsg("Uploading…");
    const res = await fetch("/api/admin/academy/upload", { method: "POST", body: fd }).then(x => x.json());
    if (res.url) {
      const next = { ...r, url: res.url, file_mime: res.file_mime, file_bytes: res.file_bytes };
      setResources(rs => rs.map((x, j) => j === idx ? next : x));
      // Auto-save the resource so the new URL persists without an extra click.
      if (next.id) {
        await fetch("/api/admin/academy/lesson-resources", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: next.id, url: next.url, file_mime: next.file_mime, file_bytes: next.file_bytes,
          }),
        });
      }
      flash("File uploaded.");
    } else {
      setMsg(res.error ?? "Upload failed");
      setTimeout(() => setMsg(null), 4000);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) return <div className="text-xs text-gray-500">Loading lesson content…</div>;

  const card  = "rounded-lg border border-gray-800 bg-gray-900/40 p-3";
  const label = "block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1";
  const input = "w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-6 mt-6 pt-6 border-t border-gray-800">
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      {/* Blocks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Text blocks</span>
          <div className="flex gap-2 text-xs">
            <button onClick={() => addBlock("rich_text")} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">+ Text</button>
            <button onClick={() => addBlock("callout")}   className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">+ Callout</button>
            <button onClick={() => addBlock("code")}      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">+ Code</button>
          </div>
        </div>
        {blocks.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No blocks yet. Add a text/callout/code block to surface content below the video.</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b, i) => (
              <div key={b.id ?? i} className={card}>
                <div className="flex items-center justify-between mb-2">
                  <select
                    value={b.block_type}
                    onChange={e => setBlocks(bs => bs.map((x, j) => j === i ? { ...x, block_type: e.target.value as Block["block_type"] } : x))}
                    className={input}
                    style={{ width: 110 }}
                  >
                    <option value="rich_text">Rich text</option>
                    <option value="callout">Callout</option>
                    <option value="code">Code</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">↑</button>
                    <button onClick={() => moveBlock(i,  1)} disabled={i === blocks.length - 1} className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">↓</button>
                    <button onClick={() => saveBlock(b)}    className="px-2 py-0.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded">Save</button>
                    <button onClick={() => b.id && deleteBlock(b.id)} className="px-2 py-0.5 text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
                {b.block_type === "rich_text" ? (
                  <TiptapEditor
                    value={b.content}
                    onChange={html => setBlocks(bs => bs.map((x, j) => j === i ? { ...x, content: html } : x))}
                    placeholder="Paragraph text — use the toolbar above for formatting."
                  />
                ) : (
                  <textarea
                    rows={b.block_type === "code" ? 5 : 4}
                    value={b.content}
                    onChange={e => setBlocks(bs => bs.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
                    placeholder={
                      b.block_type === "code"
                        ? "// code"
                        : "Highlighted note for students"
                    }
                    className={input + (b.block_type === "code" ? " font-mono" : "") + " resize-none"}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resources */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Resources</span>
          <div className="flex gap-2 text-xs">
            <button onClick={() => addResource("file")} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">+ File</button>
            <button onClick={() => addResource("link")} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">+ Link</button>
          </div>
        </div>
        {resources.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No resources yet. Attach a file URL (Supabase Storage) or external link.</p>
        ) : (
          <div className="space-y-2">
            {resources.map((r, i) => (
              <div key={r.id ?? i} className={card}>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className={label}>Label</label>
                    <input value={r.label}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className={input} />
                  </div>
                  <div>
                    <label className={label}>Type</label>
                    <select value={r.resource_type}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, resource_type: e.target.value as Resource["resource_type"] } : x))}
                      className={input}>
                      <option value="file">File</option>
                      <option value="link">Link</option>
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <label className={label}>URL</label>
                  <div className="flex gap-2">
                    <input value={r.url}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder={r.resource_type === "file" ? "Upload below or paste a URL" : "https://"}
                      className={input + " flex-1"} />
                    {r.resource_type === "file" && (
                      <FileUploadButton onPick={file => uploadFileForResource(i, file)} />
                    )}
                  </div>
                  {r.resource_type === "file" && r.file_bytes && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      {r.file_mime ?? "file"} · {r.file_bytes > 1024 * 1024
                        ? `${(r.file_bytes / 1024 / 1024).toFixed(1)} MB`
                        : `${(r.file_bytes / 1024).toFixed(0)} KB`}
                    </p>
                  )}
                </div>
                <div className="mb-2">
                  <label className={label}>Description (optional)</label>
                  <input value={r.description ?? ""}
                    onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    className={input} />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => saveResource(r)} className="px-2 py-0.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded">Save</button>
                  <button onClick={() => r.id && deleteResource(r.id)} className="px-2 py-0.5 text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small file-picker button that hides the native <input type="file"> and
 * forwards the picked file to the parent. Used inline next to the URL input
 * on file-type resources.
 */
function FileUploadButton({ onPick }: { onPick: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="px-2 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded whitespace-nowrap"
      >
        Upload
      </button>
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          // Reset so picking the same file twice still fires onChange.
          if (ref.current) ref.current.value = "";
        }}
      />
    </>
  );
}
