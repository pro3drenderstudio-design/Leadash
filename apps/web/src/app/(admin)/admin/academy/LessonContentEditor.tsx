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
import SortableList, { DragHandle } from "./SortableList";
import { useAcademyDialog } from "./AcademyDialog";

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
  const dialog = useAcademyDialog();

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
    const ok = await dialog.askConfirm("Delete this block?", { danger: true });
    if (!ok) return;
    await fetch(`/api/admin/academy/lesson-blocks?id=${id}`, { method: "DELETE" });
    setBlocks(bs => bs.filter(b => b.id !== id));
  }

  /** Persist a reordered list of blocks — optimistic local update first,
   *  then PATCH every row carrying its new position. */
  async function reorderBlocks(next: Block[]) {
    setBlocks(next);
    await Promise.all(next.map((b, i) =>
      b.id
        ? fetch("/api/admin/academy/lesson-blocks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: b.id, position: i }),
          })
        : Promise.resolve(),
    ));
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
    const ok = await dialog.askConfirm("Delete this resource?", { danger: true });
    if (!ok) return;
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
  if (loading) return <div style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>Loading lesson content…</div>;

  const cardStyle: React.CSSProperties = {
    background: "var(--app-bg-elevated)",
    border: "1px solid var(--app-border)",
    borderRadius: "var(--app-radius)",
    padding: 14,
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 24,
      marginTop: 24, paddingTop: 24,
      borderTop: "1px solid var(--app-border)",
    }}>
      {msg && <div style={{ fontSize: 12, color: "#34d399" }}>{msg}</div>}

      {/* Blocks */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>Text blocks</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => addBlock("rich_text")} className="app-btn app-btn-ghost" style={{ fontSize: 11 }}>+ Text</button>
            <button onClick={() => addBlock("callout")}   className="app-btn app-btn-ghost" style={{ fontSize: 11 }}>+ Callout</button>
            <button onClick={() => addBlock("code")}      className="app-btn app-btn-ghost" style={{ fontSize: 11 }}>+ Code</button>
          </div>
        </div>
        {blocks.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", fontStyle: "italic" }}>
            No blocks yet. Add a text/callout/code block to surface content below the video.
          </p>
        ) : (
          <SortableList<{ id: string; position: number; block_type: Block["block_type"]; content: string }>
            items={blocks.filter((b): b is Block & { id: string } => !!b.id)}
            onReorder={next => reorderBlocks(next)}
            renderItem={(b, handle) => {
              const i = blocks.findIndex(x => x.id === b.id);
              return (
                <div style={{ ...cardStyle, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <DragHandle listeners={handle.listeners} label="Reorder block" />
                      <select
                        value={b.block_type}
                        onChange={e => setBlocks(bs => bs.map((x, j) => j === i ? { ...x, block_type: e.target.value as Block["block_type"] } : x))}
                        className="ac-select"
                        style={{ width: 120 }}
                      >
                        <option value="rich_text">Rich text</option>
                        <option value="callout">Callout</option>
                        <option value="code">Code</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => saveBlock(b)} className="app-btn app-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>Save</button>
                      <button onClick={() => b.id && deleteBlock(b.id)} className="app-btn app-btn-ghost" style={{ fontSize: 11, color: "#f87171" }}>Delete</button>
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
                      placeholder={b.block_type === "code" ? "// code" : "Highlighted note for students"}
                      className="ac-textarea"
                      style={{
                        resize: "none",
                        fontFamily: b.block_type === "code" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
                      }}
                    />
                  )}
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Resources */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>Resources</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => addResource("file")} className="app-btn app-btn-ghost" style={{ fontSize: 11 }}>+ File</button>
            <button onClick={() => addResource("link")} className="app-btn app-btn-ghost" style={{ fontSize: 11 }}>+ Link</button>
          </div>
        </div>
        {resources.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", fontStyle: "italic" }}>
            No resources yet. Attach a file URL (Supabase Storage) or external link.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resources.map((r, i) => (
              <div key={r.id ?? i} style={cardStyle}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label className="ac-label">Label</label>
                    <input value={r.label}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="ac-input" />
                  </div>
                  <div>
                    <label className="ac-label">Type</label>
                    <select value={r.resource_type}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, resource_type: e.target.value as Resource["resource_type"] } : x))}
                      className="ac-select">
                      <option value="file">File</option>
                      <option value="link">Link</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label className="ac-label">URL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={r.url}
                      onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder={r.resource_type === "file" ? "Upload below or paste a URL" : "https://"}
                      className="ac-input" style={{ flex: 1 }} />
                    {r.resource_type === "file" && (
                      <FileUploadButton onPick={file => uploadFileForResource(i, file)} />
                    )}
                  </div>
                  {r.resource_type === "file" && r.file_bytes && (
                    <p style={{ fontSize: 10, color: "var(--app-text-quiet)", marginTop: 4 }}>
                      {r.file_mime ?? "file"} · {r.file_bytes > 1024 * 1024
                        ? `${(r.file_bytes / 1024 / 1024).toFixed(1)} MB`
                        : `${(r.file_bytes / 1024).toFixed(0)} KB`}
                    </p>
                  )}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label className="ac-label">Description (optional)</label>
                  <input value={r.description ?? ""}
                    onChange={e => setResources(rs => rs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    className="ac-input" />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button onClick={() => saveResource(r)} className="app-btn app-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>Save</button>
                  <button onClick={() => r.id && deleteResource(r.id)} className="app-btn app-btn-ghost" style={{ fontSize: 11, color: "#f87171" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog.node}
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
        className="app-btn app-btn-secondary"
        style={{ fontSize: 12, whiteSpace: "nowrap" }}
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
