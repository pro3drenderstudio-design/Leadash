"use client";
import React, { useEffect, useState, useReducer, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { DndContext, DragOverlay, useDraggable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Block, BlockType } from "@/lib/funnel-blocks/types";
import {
  defaultBlock,
  findBlock,
  walkBlocks,
  normalizeLegacyBlocks,
  insertBlock as treeInsertBlock,
  moveBlock as treeMoveBlock,
  removeBlock as treeRemoveBlock,
  duplicateBlock as treeDuplicateBlock,
  updateBlockProps,
  updateBlockLayout,
  updateBlockItem,
  addBlockItem,
  removeBlockItem,
  setColumnPreset,
} from "@/lib/funnel-blocks/tree";
import { Icon, BlockIcon, LABELS, LIB_GROUPS } from "@/lib/funnel-blocks/render/icons";
import { BlockTree } from "@/lib/funnel-blocks/render/BlockTree";
import type { BlockRenderContext } from "@/lib/funnel-blocks/render/BlockRenderer";
import { createClient } from "@/lib/supabase/client";

const AC = "#f97316";

// ── Design system background tokens ───────────────────────────────────────────
// #0c0c0f  main app background
// #111     header / top bar
// #1a1a1a  side panels
// #0f0f0f  page canvas background

type Device = "desktop" | "tablet" | "mobile";

interface PageData {
  id: string; funnel_id: string; name: string; slug: string;
  step_order: number; page_type: string; status: "draft" | "published";
  blocks: Block[]; settings: Record<string, unknown>;
  connection: { type?: string; plan_id?: string; product?: string; url?: string };
}

// ── History reducer ────────────────────────────────────────────────────────────

type HistState = { blocks: Block[]; past: Block[][]; future: Block[][] };
type HistAction =
  | { type: "commit"; next: Block[] }
  | { type: "setLive"; next: Block[] }
  | { type: "undo" }
  | { type: "redo" };

function histReducer(s: HistState, a: HistAction): HistState {
  switch (a.type) {
    case "commit":  return { blocks: a.next, past: [...s.past, s.blocks].slice(-60), future: [] };
    case "setLive": return { ...s, blocks: a.next };
    case "undo":    return s.past.length ? { blocks: s.past[s.past.length-1], past: s.past.slice(0,-1), future: [s.blocks, ...s.future] } : s;
    case "redo":    return s.future.length ? { blocks: s.future[0], past: [...s.past, s.blocks], future: s.future.slice(1) } : s;
    default: return s;
  }
}

function genId() { return `b_${Math.random().toString(36).slice(2,9)}`; }

const COLUMN_PRESETS: { label: string; widths: number[] }[] = [
  { label: "1",        widths: [100] },
  { label: "50/50",    widths: [50, 50] },
  { label: "33/33/33", widths: [33.33, 33.33, 33.34] },
  { label: "30/70",    widths: [30, 70] },
  { label: "70/30",    widths: [70, 30] },
];

// ── Main Builder ───────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const params    = useParams();
  const router    = useRouter();
  const funnelId  = params.id     as string;
  const pageId    = params.pageId as string;

  const [page,       setPage]       = useState<PageData|null>(null);
  const [funnelName, setFunnelName] = useState("");
  const [funnelSlug, setFunnelSlug] = useState("");
  const [loading,    setLoading]    = useState(true);

  const [hist, dispatch] = useReducer(histReducer, { blocks:[], past:[], future:[] });
  const { blocks } = hist;

  const [selectedId,  setSelectedId]  = useState<string|null>(null);
  const [device,      setDevice]      = useState<Device>("desktop");
  const [zoom,        setZoom]        = useState(1);
  const [preview,     setPreview]     = useState(false);
  const [ab,          setAb]          = useState(false);
  const [leftTab,     setLeftTab]     = useState<"blocks"|"layers">("blocks");
  const [search,      setSearch]      = useState("");
  const [toast,       setToastMsg]    = useState<string|null>(null);
  const [saveStatus,  setSaveStatus]  = useState<"idle"|"saved">("idle");
  const [activeDrag,  setActiveDrag]  = useState<{ label: string } | null>(null);

  const toastTimer       = useRef<ReturnType<typeof setTimeout>|null>(null);
  const previewSessionId = useRef(`preview_${genId()}`);
  void funnelSlug;

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [pr, fr] = await Promise.all([
        fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}`),
        fetch(`/api/admin/funnels/${funnelId}`),
      ]);
      const pd = await pr.json() as { page?: PageData };
      if (pd.page) {
        setPage(pd.page);
        dispatch({ type:"commit", next: normalizeLegacyBlocks((pd.page.blocks??[]) as unknown[]) });
      }
      if (fr.ok) {
        const fd = await fr.json() as { funnel?: { slug:string; name:string } };
        setFunnelSlug(fd.funnel?.slug??"");
        setFunnelName(fd.funnel?.name??"");
      }
      setLoading(false);
    }
    load();
  }, [funnelId, pageId]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  // ── Block mutation helpers ─────────────────────────────────────────────────
  const commitBlocks = useCallback((next: Block[]) => dispatch({ type:"commit", next }), []);
  const setLive      = useCallback((next: Block[]) => dispatch({ type:"setLive", next }), []);

  function addBlock(type: BlockType) {
    const block = defaultBlock(type);
    commitBlocks(treeInsertBlock(blocks, null, blocks.length, block));
    setSelectedId(block.id);
    showToast(`${LABELS[type]} added`);
  }

  function quickInsert(parentId: string | null, index: number, type: BlockType = "body-text") {
    const block = defaultBlock(type);
    commitBlocks(treeInsertBlock(blocks, parentId, index, block));
    setSelectedId(block.id);
  }

  function nudgeBlock(id: string, dir: -1 | 1) {
    let foundParent: string | null = null;
    walkBlocks(blocks, (b, _d, pid) => { if (b.id === id) foundParent = pid; });
    const parentOf = foundParent;
    const siblings = parentOf === null ? blocks : (findBlock(blocks, parentOf)?.children ?? []);
    const i = siblings.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    commitBlocks(treeMoveBlock(blocks, id, parentOf, j));
  }

  function duplicateBlockHandler(id: string) {
    const { tree, newId } = treeDuplicateBlock(blocks, id);
    commitBlocks(tree);
    if (newId) setSelectedId(newId);
    showToast("Block duplicated");
  }

  function removeBlockHandler(id: string) {
    commitBlocks(treeRemoveBlock(blocks, id));
    if (selectedId===id) setSelectedId(null);
  }

  function setProps(id: string, patch: Record<string, unknown>) {
    setLive(updateBlockProps(blocks, id, patch));
  }

  function setLayout(id: string, patch: Record<string, unknown>) {
    setLive(updateBlockLayout(blocks, id, patch));
  }

  function commitProp(id: string, key: string, val: string) {
    commitBlocks(updateBlockProps(blocks, id, { [key]: val }));
  }

  function commitItem(id: string, idx: number, field: string|null, val: string) {
    commitBlocks(updateBlockItem(blocks, id, idx, field, val));
  }

  function addItem(id: string, item: unknown) {
    commitBlocks(addBlockItem(blocks, id, item));
  }

  function removeItem(id: string, idx: number) {
    commitBlocks(removeBlockItem(blocks, id, idx));
  }

  function applyColumnPreset(rowId: string, widths: number[]) {
    commitBlocks(setColumnPreset(blocks, rowId, widths));
  }

  function setPageField(patch: Partial<PageData>) {
    setPage(prev => prev ? {...prev,...patch} : prev);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save(silent=false) {
    if (!page) return;
    await fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ blocks, name:page.name, slug:page.slug, settings:page.settings, connection:page.connection }),
    });
    if (!silent) { setSaveStatus("saved"); setTimeout(()=>setSaveStatus("idle"), 2500); }
  }

  async function publish() {
    if (!page) return;
    await save(true);
    await fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}/publish`, { method:"POST" });
    setPage(prev => prev ? {...prev, status:"published"} : prev);
    showToast("Page published — live now");
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { kind: "new"; type: BlockType } | { kind: "move"; id: string } | undefined;
    if (!data) return;
    if (data.kind === "new") setActiveDrag({ label: LABELS[data.type] });
    else {
      const blk = findBlock(blocks, data.id);
      setActiveDrag({ label: blk ? LABELS[blk.type] : "Block" });
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { kind: "new"; type: BlockType } | { kind: "move"; id: string } | undefined;
    const overData = over.data.current as { parentId: string | null; index: number } | undefined;
    if (!activeData || !overData) return;
    if (activeData.kind === "new") {
      const block = defaultBlock(activeData.type);
      commitBlocks(treeInsertBlock(blocks, overData.parentId, overData.index, block));
      setSelectedId(block.id);
    } else {
      commitBlocks(treeMoveBlock(blocks, activeData.id, overData.parentId, overData.index));
    }
  }

  const deviceW = { desktop:980, tablet:800, mobile:390 }[device];

  const layersFlat = useMemo(() => {
    const out: { block: Block; depth: number }[] = [];
    walkBlocks(blocks, (b, depth) => out.push({ block: b, depth }));
    return out;
  }, [blocks]);

  const videoBlocks = useMemo(
    () => layersFlat.filter(({ block }) => block.type === "video").map(({ block }, i) => ({ id: block.id, label: (block.props.caption as string) || `Video ${i + 1}` })),
    [layersFlat],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center">
        <span className="text-white/20 text-sm">Loading builder…</span>
      </div>
    );
  }
  if (!page) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center">
        <span className="text-white/20 text-sm">Page not found</span>
      </div>
    );
  }

  const canUndo = hist.past.length > 1;
  const canRedo = hist.future.length > 0;
  const selectedBlock = selectedId ? findBlock(blocks, selectedId) : null;
  const isDraft = page.status !== "published";
  const pageLayout = (page.settings?.layout as { width_mode?: "boxed"|"full"; max_width?: number }) ?? {};
  const pageMaxWidth = pageLayout.max_width ?? 1100;

  const blockCtx: BlockRenderContext = {
    mode: preview ? "live" : "edit",
    pageMaxWidth,
    selectedId,
    pageId: page.id,
    sessionId: previewSessionId.current,
    onCommitProp: commitProp,
    onCommitItem: commitItem,
    onSelect: setSelectedId,
    onDuplicate: duplicateBlockHandler,
    onRemove: removeBlockHandler,
    onMoveUp: id => nudgeBlock(id, -1),
    onMoveDown: id => nudgeBlock(id, 1),
    onQuickInsert: quickInsert,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <div className="flex flex-col h-screen w-full bg-[#0c0c0f] overflow-hidden" style={{ fontFamily: "'Geist','Segoe UI',system-ui,sans-serif", color: "#f0f0f0" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="h-[53px] shrink-0 flex items-center gap-3 px-3 bg-[#111] border-b border-white/[0.06] z-40 relative">

        {/* Left cluster */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <button onClick={() => router.push(`/admin/funnels/${funnelId}`)}
            className="w-[30px] h-[30px] flex items-center justify-center border-none bg-white/[0.05] text-white/50 rounded-lg cursor-pointer hover:text-white/80 transition-colors">
            <Icon paths={["M15 18l-6-6 6-6"]} size={17} sw={1.9} />
          </button>
          <div className="w-px h-6 bg-white/[0.08]" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[10.5px] text-white/30 tracking-wide whitespace-nowrap">{funnelName || "Funnel"}</span>
            <span className="text-[13.5px] font-semibold text-white whitespace-nowrap">{page.name}</span>
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full tracking-widest uppercase ${
            isDraft
              ? "bg-amber-500/[0.14] text-amber-400 border border-amber-500/30"
              : "bg-emerald-500/[0.14] text-emerald-400 border border-emerald-500/30"
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {page.status}
          </span>
        </div>

        {/* Center cluster */}
        <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
          {/* Device picker */}
          <div className="flex bg-[#0c0c0f] border border-white/[0.07] rounded-xl p-0.5 gap-0.5">
            {([["desktop",["M3 4h18v12H3z","M8 20h8","M12 16v4"]],["tablet",["M5 3h14v18H5z","M11 18h2"]],["mobile",["M7 3h10v18H7z","M11 18h2"]]] as const).map(([d, paths]) => (
              <button key={d} onClick={() => setDevice(d as Device)} title={d}
                className={`flex items-center justify-center px-2.5 py-1.5 border-none rounded-lg cursor-pointer transition-colors ${
                  device === d ? "bg-white/10 text-white" : "bg-transparent text-white/30 hover:text-white/60"
                }`}>
                <Icon paths={paths as unknown as string[]} size={16} />
              </button>
            ))}
          </div>
          {/* Zoom */}
          <div className="flex items-center bg-[#0c0c0f] border border-white/[0.07] rounded-xl p-0.5 gap-0.5">
            <button onClick={() => setZoom(z => Math.max(.5, Math.round((z-.1)*10)/10))} title="Zoom out"
              className="w-[26px] h-[26px] flex items-center justify-center border-none bg-transparent text-white/40 rounded-lg cursor-pointer hover:text-white/80 transition-colors">
              <Icon paths={["M5 12h14"]} size={15} sw={2} />
            </button>
            <button onClick={() => setZoom(1)} title="Reset zoom"
              className="min-w-[46px] text-xs font-mono text-white/60 bg-transparent border-none cursor-pointer">
              {Math.round(zoom*100)}%
            </button>
            <button onClick={() => setZoom(z => Math.min(1.5, Math.round((z+.1)*10)/10))} title="Zoom in"
              className="w-[26px] h-[26px] flex items-center justify-center border-none bg-transparent text-white/40 rounded-lg cursor-pointer hover:text-white/80 transition-colors">
              <Icon paths={["M12 5v14","M5 12h14"]} size={15} sw={2} />
            </button>
          </div>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Undo / Redo */}
          <div className="flex gap-1">
            {([[[canUndo,"undo"],["M9 14L4 9l5-5","M4 9h10a6 6 0 0 1 0 12h-3"]],[[canRedo,"redo"],["M15 14l5-5-5-5","M20 9H10a6 6 0 0 0 0 12h3"]]] as [[boolean,string],string[]][]).map(([[enabled,action],paths]) => (
              <button key={action} onClick={() => dispatch({type:action as "undo"|"redo"})} disabled={!enabled} title={action}
                className={`w-[30px] h-[30px] flex items-center justify-center border-none bg-white/[0.05] rounded-lg transition-colors ${
                  enabled ? "text-white/60 cursor-pointer hover:text-white" : "text-white/20 cursor-default"
                }`}>
                <Icon paths={paths} size={16} sw={2} />
              </button>
            ))}
          </div>
          {/* A/B toggle */}
          <button onClick={() => setAb(x => !x)} title="A/B test"
            className={`inline-flex items-center gap-1.5 px-3 py-[7px] border rounded-lg cursor-pointer text-[13px] font-medium transition-all ${
              ab ? "border-orange-500/50 bg-orange-500/[0.1] text-orange-300" : "border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/70"
            }`}>
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={15} sw={1.8} />A/B
          </button>
          {/* External preview */}
          <button onClick={() => window.open(`/funnel-preview/${funnelId}/${pageId}`, "_blank", "noopener,noreferrer")} title="Open preview in new tab"
            className="inline-flex items-center gap-1.5 px-3 py-[7px] border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/70 rounded-lg cursor-pointer text-[13px] font-medium transition-colors">
            <Icon paths={["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6","M15 3h6v6","M10 14L21 3"]} size={15} sw={2} />
          </button>
          {/* Preview toggle */}
          <button onClick={() => { setPreview(x => !x); if (!preview) setSelectedId(null); }} title="Preview"
            className={`inline-flex items-center gap-1.5 px-3 py-[7px] border rounded-lg cursor-pointer text-[13px] font-medium transition-all ${
              preview ? "border-orange-500/50 bg-orange-500/[0.1] text-orange-300" : "border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/70"
            }`}>
            <Icon paths={preview
              ? ["M3 3l18 18","M10.6 10.6a2 2 0 0 0 2.8 2.8","M9.4 5.2A9 9 0 0 1 21 12a16 16 0 0 1-2.3 3.1","M6.6 6.6A16 16 0 0 0 3 12a9 9 0 0 0 12 6.7"]
              : ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]
            } size={15} />
            {preview ? "Exit" : "Preview"}
          </button>
          {/* Saved indicator */}
          <div className={`flex items-center gap-1 text-emerald-400 text-[11.5px] font-medium px-1 transition-opacity ${saveStatus === "saved" ? "opacity-100" : "opacity-0"}`}>
            <Icon paths={["M5 12l4 4 10-10"]} size={14} sw={2.4} /> Saved
          </div>
          {/* Publish */}
          <button onClick={publish}
            className="inline-flex items-center gap-1.5 text-white font-semibold text-[13px] px-4 py-2 border-none rounded-lg cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(180deg,#fb923c,#f97316)", boxShadow: "0 4px 14px -4px rgba(249,115,22,.55),inset 0 1px 0 rgba(255,255,255,.2)" }}>
            <Icon paths={["M12 19V5","M5 12l7-7 7 7"]} size={15} sw={2} /> Publish
          </button>
        </div>
      </header>

      {/* ── A/B strip ──────────────────────────────────────────────────────── */}
      {ab && (
        <div className="shrink-0 flex items-center gap-3.5 px-4 py-2.5 bg-[#111] border-b border-white/[0.06]">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-300">
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={14} sw={1.8} /> A/B Test
          </span>
          <div className="flex gap-2 items-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/[0.1] border border-orange-500/40 rounded-lg">
              <span className="text-xs font-semibold text-white">Variant A</span>
              <span className="text-[11px] text-orange-300 font-mono">50%</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-white/[0.09] rounded-lg">
              <span className="text-xs font-semibold text-white/50">Variant B</span>
              <span className="text-[11px] text-white/30 font-mono">50%</span>
            </div>
            <button onClick={() => showToast("New variant created")}
              className="inline-flex items-center gap-1 px-3 py-1 bg-transparent border border-dashed border-white/20 rounded-lg text-white/40 text-xs cursor-pointer hover:text-white/60 transition-colors">
              <Icon paths={["M12 5v14","M5 12h14"]} size={13} sw={2.2} /> Add variant
            </button>
          </div>
          <div className="flex-1" />
          <span className="text-[11.5px] text-white/30">Split traffic evenly · 0 visitors so far</span>
          <button onClick={() => showToast("Winner declared")}
            className="px-3 py-1 bg-white/[0.05] border border-white/[0.09] rounded-lg text-white/50 text-xs font-medium cursor-pointer hover:text-white/70 transition-colors">
            Declare winner
          </button>
        </div>
      )}

      {/* ── Three-panel body ─────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative">

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        {!preview && (
          <aside className="w-[270px] shrink-0 bg-[#1a1a1a] border-r border-white/[0.06] flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex border-b border-white/[0.06] px-2">
              {(["blocks","layers"] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-transparent border-none cursor-pointer capitalize text-[12.5px] font-semibold transition-colors ${
                    leftTab === tab
                      ? "text-white border-b-2 border-orange-500"
                      : "text-white/30 border-b-2 border-transparent hover:text-white/60"
                  }`}>
                  {tab}
                </button>
              ))}
            </div>

            {leftTab === "blocks" ? (
              <div className="flex-1 overflow-auto p-3">
                {/* Search */}
                <div className="relative mb-3.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                    <Icon paths={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M20 20l-3.5-3.5"]} size={15} />
                  </span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search blocks"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/40 transition-colors" />
                </div>
                {LIB_GROUPS.map(g => {
                  const q = search.trim().toLowerCase();
                  const items = g.types.filter(t => !q || LABELS[t].toLowerCase().includes(q));
                  if (!items.length) return null;
                  return (
                    <div key={g.group} className="mb-4">
                      <div className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2 pl-0.5">{g.group}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {items.map(type => (
                          <PaletteSwatch key={type} type={type} onClick={() => addBlock(type)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-2.5">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2.5 px-1">Page structure</div>
                <div className="flex flex-col gap-0.5">
                  {layersFlat.map(({ block: b, depth }) => {
                    const sel = selectedId === b.id;
                    return (
                      <div key={b.id} onClick={() => setSelectedId(b.id)}
                        className={`flex items-center gap-2 py-2 rounded-lg cursor-pointer transition-colors ${
                          sel
                            ? "bg-orange-500/[0.12] border border-orange-500/40"
                            : "border border-transparent hover:bg-white/[0.04]"
                        }`}
                        style={{ paddingLeft: 9 + depth * 16, paddingRight: 9 }}
                        onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span style={{ color: sel ? AC : undefined }} className={sel ? "" : "text-white/35"}>
                          <BlockIcon type={b.type} size={15} />
                        </span>
                        <span className={`flex-1 text-[12.5px] truncate ${sel ? "text-white font-semibold" : "text-white/50"}`}>
                          {LABELS[b.type]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ── CANVAS ─────────────────────────────────────────────────────── */}
        <div
          onClick={() => setSelectedId(null)}
          className="flex-1 min-w-0 overflow-auto relative"
          style={{ background: "radial-gradient(120% 80% at 50% 0,#1a1a1a 0%,#0c0c0f 55%)" }}
        >
          <div className={`min-h-full flex justify-center items-start ${preview ? "" : "p-[34px_34px_140px]"}`}>
            <div style={{ width: preview ? "100%" : deviceW, transform: `scale(${zoom})`, transformOrigin: "top center", transition: "width .28s ease" }}>
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: "#0c0c0f",
                  borderRadius: preview ? 0 : device === "mobile" ? 30 : device === "tablet" ? 20 : 14,
                  overflow: "hidden",
                  boxShadow: preview ? "none" : "0 40px 90px -28px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,0.07)",
                  minHeight: 400,
                }}
              >
                <BlockTree blocks={blocks} ctx={blockCtx} />
              </div>
            </div>
          </div>

          {preview && (
            <button onClick={() => setPreview(false)}
              className="absolute top-3.5 right-3.5 z-50 inline-flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] border border-white/[0.14] text-white rounded-xl text-[13px] font-medium cursor-pointer shadow-2xl">
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={15} /> Exit preview
            </button>
          )}
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        {!preview && (
          <aside className="w-[304px] shrink-0 bg-[#1a1a1a] border-l border-white/[0.06] flex flex-col min-h-0">
            <RightPanel
              selectedBlock={selectedBlock}
              page={page}
              onDeselect={() => setSelectedId(null)}
              onSetProps={setProps}
              onSetLayout={setLayout}
              onSetPage={setPageField}
              onCommitItem={commitItem}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onColumnPreset={applyColumnPreset}
              onSave={() => save()}
              funnelId={funnelId}
              videoBlocks={videoBlocks}
            />
          </aside>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-2xl z-[60] flex items-center gap-2 whitespace-nowrap">
          <span style={{ color: AC }}><Icon paths={["M5 12l4 4 10-10"]} size={15} sw={2.4} /></span>
          {toast}
        </div>
      )}
    </div>
    <DragOverlay>
      {activeDrag && (
        <div className="px-3.5 py-2 bg-[#1a1a1a] border border-orange-500/50 rounded-lg text-white text-[12.5px] font-semibold shadow-2xl">
          {activeDrag.label}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

// ── Palette swatch (dnd-kit draggable) ────────────────────────────────────────

function PaletteSwatch({ type, onClick }: { type: BlockType; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "new", type },
  });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onClick}
      title="Click to add or drag to position"
      className={`group flex flex-col items-center gap-1.5 p-3 bg-white/[0.025] border border-white/[0.06] rounded-xl cursor-grab transition-all hover:bg-orange-500/[0.08] hover:border-orange-500/40 ${isDragging ? "opacity-40" : ""}`}>
      <div className="text-white/50 group-hover:text-orange-400 transition-colors">
        <BlockIcon type={type} size={19} />
      </div>
      <span className="text-[11px] text-white/40 group-hover:text-white/70 font-medium text-center leading-tight transition-colors">
        {LABELS[type]}
      </span>
    </div>
  );
}

// ── Image upload field ─────────────────────────────────────────────────────────

function ImageUploadField({ value, onChange, funnelId }: { value?: string; onChange: (url: string) => void; funnelId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { setError("Unsupported file type"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("File exceeds 5MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("funnel_id", funnelId);
      const res = await fetch("/api/admin/funnels/media/upload", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-white/10">
          <img src={value} alt="" className="w-full h-[110px] object-cover block" />
          <div className="absolute top-1.5 right-1.5 flex gap-1.5">
            <button onClick={() => inputRef.current?.click()} disabled={uploading}
              className="px-2 py-1 bg-[rgba(10,14,22,0.85)] border border-white/20 rounded-md text-white text-[11px] font-medium cursor-pointer">
              {uploading ? "…" : "Replace"}
            </button>
            <button onClick={() => onChange("")}
              className="px-2 py-1 bg-[rgba(10,14,22,0.85)] border border-white/20 rounded-md text-white text-[11px] font-medium cursor-pointer">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 py-5 bg-white/[0.025] border border-dashed border-white/20 rounded-lg text-white/40 text-[12.5px] cursor-pointer hover:border-white/30 hover:text-white/60 transition-colors">
          {uploading ? "Uploading…" : "Click to upload image"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

// ── Video upload field ────────────────────────────────────────────────────────

const VIDEO_MIME = ["video/mp4", "video/webm"];
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;

function VideoUploadField({ value, onChange, funnelId }: { value?: string; onChange: (url: string) => void; funnelId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!VIDEO_MIME.includes(file.type)) { setError("Unsupported file type — use MP4 or WebM"); return; }
    if (file.size > VIDEO_MAX_BYTES) { setError("File exceeds 500MB"); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-");
      const path = `${funnelId}/video-${Date.now()}-${safeName}`;
      const { error: uploadErr } = await supabase.storage.from("funnel-media").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: pub } = supabase.storage.from("funnel-media").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const isPlayable = Boolean(value) && !/youtu\.?be/.test(value!);

  return (
    <div>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black">
          {isPlayable ? (
            <video src={value} controls className="w-full h-[110px] object-cover block" />
          ) : (
            <div className="h-[110px] flex items-center justify-center text-white/30 text-[11.5px] px-3 text-center">
              External video URL set
            </div>
          )}
          <div className="absolute top-1.5 right-1.5 flex gap-1.5">
            <button onClick={() => inputRef.current?.click()} disabled={uploading}
              className="px-2 py-1 bg-[rgba(10,14,22,0.85)] border border-white/20 rounded-md text-white text-[11px] font-medium cursor-pointer">
              {uploading ? "…" : "Replace"}
            </button>
            <button onClick={() => onChange("")}
              className="px-2 py-1 bg-[rgba(10,14,22,0.85)] border border-white/20 rounded-md text-white text-[11px] font-medium cursor-pointer">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 py-5 bg-white/[0.025] border border-dashed border-white/20 rounded-lg text-white/40 text-[12.5px] cursor-pointer hover:border-white/30 hover:text-white/60 transition-colors">
          {uploading ? "Uploading…" : "Click to upload video (MP4/WebM, up to 500MB)"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/mp4,video/webm" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

// ── Right-panel helpers (module-level → stable references across renders) ─────

function RPField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function RPSL({ text }: { text: string }) {
  return (
    <div className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mt-1 mb-3 pb-2 border-b border-white/[0.06]">
      {text}
    </div>
  );
}

// Shared input className
const IS = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/40 transition-colors";

// ── Right Panel ───────────────────────────────────────────────────────────────

interface RPProps {
  selectedBlock: Block|null; page: PageData; funnelId: string;
  onDeselect: ()=>void;
  onSetProps: (id:string, patch:Record<string,unknown>)=>void;
  onSetLayout: (id:string, patch:Record<string,unknown>)=>void;
  onSetPage: (patch:Partial<PageData>)=>void;
  onCommitItem: (id:string, idx:number, field:string|null, val:string)=>void;
  onAddItem: (id:string, item:unknown)=>void;
  onRemoveItem: (id:string, idx:number)=>void;
  onColumnPreset: (rowId:string, widths:number[])=>void;
  onSave: ()=>void;
  videoBlocks: { id:string; label:string }[];
}

function RightPanel({ selectedBlock:b, page, funnelId, onDeselect, onSetProps, onSetLayout, onSetPage, onCommitItem, onAddItem, onRemoveItem, onColumnPreset, onSave, videoBlocks }: RPProps) {
  const [rpTab, setRpTab] = useState<"content"|"layout">("content");

  const Field = RPField;
  const SL    = RPSL;

  function textCtl(key: string) {
    if (!b) return null;
    return <input value={(b.props[key] as string)??""} onChange={e => onSetProps(b.id, {[key]: e.target.value})} className={IS} />;
  }
  function areaCtl(key: string, rows=3) {
    if (!b) return null;
    return <textarea value={(b.props[key] as string)??""} onChange={e => onSetProps(b.id, {[key]: e.target.value})} rows={rows} className={IS} style={{ resize: "vertical", lineHeight: 1.5 }} />;
  }
  function colorCtl(key: string) {
    if (!b) return null;
    const v = (b.props[key] as string) ?? "#0c0c0f";
    const safe = v === "transparent" ? "#0c0c0f" : v;
    return (
      <div className="flex gap-2 items-center">
        <div className="relative w-[34px] h-[34px] rounded-lg border border-white/10 shrink-0" style={{ background: safe }}>
          <input type="color" value={safe} onChange={e => onSetProps(b.id, {[key]: e.target.value})}
            className="absolute inset-0 opacity-0 w-full h-full border-none p-0 cursor-pointer" />
        </div>
        <input value={v} onChange={e => onSetProps(b.id, {[key]: e.target.value})} className={IS + " font-mono text-xs"} />
      </div>
    );
  }
  function alignCtl() {
    if (!b) return null;
    const cur = (b.props.align as string) ?? "left";
    const opts: [string, string[]][] = [
      ["left",   ["M4 6h16","M4 12h10","M4 18h13"]],
      ["center", ["M4 6h16","M7 12h10","M5 18h14"]],
      ["right",  ["M4 6h16","M10 12h10","M7 18h13"]],
    ];
    return (
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
        {opts.map(([a, paths]) => (
          <button key={a} onClick={() => onSetProps(b.id, { align: a })}
            className={`flex-1 flex justify-center py-1.5 border-none rounded-md cursor-pointer transition-colors ${
              cur === a ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
            }`}>
            <Icon paths={paths} size={16} />
          </button>
        ))}
      </div>
    );
  }
  function numCtl(key: string, opts?: { min?:number; max?:number; default?:number; suffix?:string }) {
    if (!b) return null;
    const min = opts?.min ?? 8, max = opts?.max ?? 160, def = opts?.default ?? 48, suffix = opts?.suffix ?? "px";
    const val = (b.props[key] as number) ?? def;
    return (
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={val} onChange={e => onSetProps(b.id, {[key]: +e.target.value})} className="flex-1 accent-orange-500" />
        <span className="text-xs text-white/50 font-mono min-w-[46px] text-right">{val}{suffix}</span>
      </div>
    );
  }
  function ctaSizeCtl() {
    if (!b) return null;
    const opts: ["sm"|"md"|"lg", string][] = [["sm","S"],["md","M"],["lg","L"]];
    const cur = (b.props.size as string) ?? "md";
    return (
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
        {opts.map(([v, l]) => (
          <button key={v} onClick={() => onSetProps(b.id, { size: v })}
            className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${
              cur === v ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
            }`}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function headlineSizeCtl() {
    if (!b) return null;
    const remOpts: [number, string][] = [[1.5,"S"],[1.875,"M"],[2.25,"L"],[3,"XL"]];
    const cur = b.props.size as { value:number; unit:string } | undefined;
    const curVal = cur?.value ?? 2.25;
    return (
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
        {remOpts.map(([v, l]) => (
          <button key={l} onClick={() => onSetProps(b.id, { size: { value: v, unit: "rem" } })}
            className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${
              curVal === v ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
            }`}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function toggleCtl(key: string) {
    if (!b) return null;
    const on = Boolean(b.props[key]);
    return (
      <button onClick={() => onSetProps(b.id, {[key]: !on})}
        className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-0">
        <span className={`relative w-[34px] h-[19px] rounded-full transition-colors shrink-0 ${on ? "bg-orange-500" : "bg-white/15"}`}>
          <span className={`absolute top-[2px] w-[15px] h-[15px] rounded-full bg-white transition-all ${on ? "left-[17px]" : "left-[2px]"}`} />
        </span>
        <span className="text-[12.5px] text-white/60">{on ? "On" : "Off"}</span>
      </button>
    );
  }
  function revealCtl() {
    if (!b) return null;
    const sourceId = b.layout?.reveal_source_block_id ?? "";
    const seconds  = b.layout?.reveal_after_seconds ?? 300;
    return (
      <div>
        <select className={IS} value={sourceId}
          onChange={e => onSetLayout(b.id, { reveal_source_block_id: e.target.value || undefined, reveal_after_seconds: e.target.value ? seconds : undefined })}>
          <option value="">Always visible</option>
          {videoBlocks.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {Boolean(sourceId) && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-white/40 whitespace-nowrap">after</span>
            <input type="number" min={0} value={seconds}
              onChange={e => onSetLayout(b.id, { reveal_after_seconds: +e.target.value||0 })}
              className={IS} style={{ width: 80 }} />
            <span className="text-[11px] text-white/40 whitespace-nowrap">seconds</span>
          </div>
        )}
        {videoBlocks.length === 0 && (
          <p className="text-[10.5px] text-white/25 mt-1.5 leading-relaxed">Add a video block to the page to enable a timed reveal.</p>
        )}
      </div>
    );
  }
  function layoutToggleCtl(key: "boxed") {
    if (!b) return null;
    const on = Boolean(b.layout?.[key]);
    return (
      <button onClick={() => onSetLayout(b.id, {[key]: !on})}
        className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-0">
        <span className={`relative w-[34px] h-[19px] rounded-full transition-colors shrink-0 ${on ? "bg-orange-500" : "bg-white/15"}`}>
          <span className={`absolute top-[2px] w-[15px] h-[15px] rounded-full bg-white transition-all ${on ? "left-[17px]" : "left-[2px]"}`} />
        </span>
        <span className="text-[12.5px] text-white/60">{on ? "Boxed" : "Full width"}</span>
      </button>
    );
  }
  function layoutColorCtl(key: "border_color"|"bg_overlay_color", fallback: string) {
    if (!b) return null;
    const v = (b.layout?.[key] as string) ?? fallback;
    return (
      <div className="flex gap-2 items-center">
        <div className="relative w-[34px] h-[34px] rounded-lg border border-white/10 shrink-0" style={{ background: v }}>
          <input type="color" value={v} onChange={e => onSetLayout(b.id, {[key]: e.target.value})}
            className="absolute inset-0 opacity-0 w-full h-full border-none p-0 cursor-pointer" />
        </div>
        <input value={v} onChange={e => onSetLayout(b.id, {[key]: e.target.value})} className={IS + " font-mono text-xs"} />
      </div>
    );
  }
  function layoutRangeRow(label: string, val: number, onChange: (v: number) => void, min=0, max=100, fmt=(v: number) => `${v}px`) {
    return (
      <div className="mb-2.5">
        <div className="flex justify-between mb-1">
          <span className="text-[10.5px] text-white/40">{label}</span>
          <span className="text-[11px] text-white/50 font-mono">{fmt(val)}</span>
        </div>
        <input type="range" min={min} max={max} value={val} onChange={e => onChange(+e.target.value)} className="w-full accent-orange-500" />
      </div>
    );
  }
  function paddingCtl() {
    if (!b) return null;
    const pt = b.layout?.padding_top?.value ?? 0;
    const pb = b.layout?.padding_bottom?.value ?? 0;
    return (
      <div>
        {layoutRangeRow("Top",    pt, v => onSetLayout(b.id, { padding_top:    { value: v, unit: "px" } }), 0, 200)}
        {layoutRangeRow("Bottom", pb, v => onSetLayout(b.id, { padding_bottom: { value: v, unit: "px" } }), 0, 200)}
      </div>
    );
  }
  function borderCtl() {
    if (!b) return null;
    const bw = b.layout?.border_width ?? 0;
    const br = b.layout?.border_radius ?? 0;
    return (
      <div>
        <Field label="Color">{layoutColorCtl("border_color", "#2a2a2a")}</Field>
        {layoutRangeRow("Width",  bw, v => onSetLayout(b.id, { border_width:  v }), 0, 12)}
        {layoutRangeRow("Radius", br, v => onSetLayout(b.id, { border_radius: v }), 0, 40)}
      </div>
    );
  }
  function bgOverlayCtl() {
    if (!b) return null;
    const op = b.layout?.bg_overlay_opacity ?? 0.4;
    return (
      <div>
        <Field label="Overlay color">{layoutColorCtl("bg_overlay_color", "#000000")}</Field>
        {layoutRangeRow("Overlay opacity", op, v => onSetLayout(b.id, { bg_overlay_opacity: v }), 0, 1, v => `${Math.round(v*100)}%`)}
      </div>
    );
  }
  function fieldsCtl() {
    if (!b) return null;
    const fields = (b.props.fields as Array<{type:string;label:string;required:boolean}>) ?? [];
    function update(idx: number, patch: Partial<{type:string;label:string;required:boolean}>) {
      const next = fields.map((f, i) => i === idx ? {...f, ...patch} : f);
      onSetProps(b!.id, { fields: next });
    }
    function remove(idx: number) {
      onSetProps(b!.id, { fields: fields.filter((_, i) => i !== idx) });
    }
    function add() {
      onSetProps(b!.id, { fields: [...fields, { type: `field_${fields.length+1}`, label: "New field", required: false }] });
    }
    return (
      <div>
        <div className="flex flex-col gap-2 mb-2">
          {fields.map((f, idx) => (
            <div key={idx} className="flex flex-col gap-1.5 p-2.5 bg-white/5 border border-white/[0.07] rounded-lg">
              <div className="flex gap-1.5 items-center">
                <input value={f.label} onChange={e => update(idx, { label: e.target.value })} placeholder="Label"
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500/40" />
                <button onClick={() => remove(idx)} className="border-none bg-transparent text-white/30 cursor-pointer p-0.5 hover:text-white/60">
                  <Icon paths={["M5 12h14"]} size={15} sw={2} />
                </button>
              </div>
              <div className="flex gap-1.5 items-center">
                <input value={f.type} onChange={e => update(idx, { type: e.target.value })} placeholder="field_key"
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500/40" />
                <label className="flex items-center gap-1 text-[11px] text-white/40 whitespace-nowrap">
                  <input type="checkbox" checked={f.required} onChange={e => update(idx, { required: e.target.checked })} />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>
        <button onClick={add}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-orange-500/[0.08] border border-dashed border-orange-500/35 rounded-lg text-orange-500 text-xs font-semibold cursor-pointer hover:bg-orange-500/[0.14] transition-colors">
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add field
        </button>
        <p className="text-[10.5px] text-white/25 mt-2 leading-relaxed">
          Use &quot;email&quot; as the field key to render an email input. The key is used as the data field name on submission.
        </p>
      </div>
    );
  }
  function itemsCtl(kind: "stats"|"faq"|"list"|"pricing") {
    if (!b) return null;
    const items = (b.props.items as unknown[]) ?? [];
    const blank = kind === "stats" ? { value: "0", label: "Label" } : kind === "faq" ? { q: "New question?", a: "Answer." } : { text: "New item" };
    return (
      <div>
        <div className="flex flex-col gap-1.5 mb-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2.5 py-2 bg-white/5 border border-white/[0.07] rounded-lg">
              <span className="flex-1 text-xs text-white/45 truncate">
                {kind === "stats"
                  ? `${(it as {value:string;label:string}).value} · ${(it as {value:string;label:string}).label}`
                  : kind === "faq"
                  ? (it as {q:string}).q
                  : (it as {text:string}).text}
              </span>
              <button onClick={() => onRemoveItem(b.id, idx)} className="border-none bg-transparent text-white/25 cursor-pointer p-0.5 hover:text-white/60">
                <Icon paths={["M5 12h14"]} size={15} sw={2} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => onAddItem(b.id, typeof blank === "string" ? blank : {...blank as object})}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-orange-500/[0.08] border border-dashed border-orange-500/35 rounded-lg text-orange-500 text-xs font-semibold cursor-pointer hover:bg-orange-500/[0.14] transition-colors">
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add item
        </button>
        <p className="text-[10.5px] text-white/25 mt-2 leading-relaxed">Edit item text directly on the canvas.</p>
      </div>
    );
  }
  function columnPresetCtl() {
    if (!b) return null;
    const current = (b.children ?? []).map(c => c.layout?.width?.value);
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {COLUMN_PRESETS.map(preset => {
          const active = current.length === preset.widths.length && current.every((w, i) => Math.abs((w??0) - preset.widths[i]) < 0.5);
          return (
            <button key={preset.label} onClick={() => onColumnPreset(b.id, preset.widths)}
              className={`py-2 px-1.5 border rounded-lg text-[11.5px] font-semibold cursor-pointer transition-all ${
                active
                  ? "border-orange-500 bg-orange-500/[0.12] text-orange-300"
                  : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
              }`}>
              {preset.label}
            </button>
          );
        })}
      </div>
    );
  }

  function BlockSettings() {
    if (!b) return null;
    const t = b.type;
    const hasStyle = t === "headline" || t === "body-text" || t === "countdown-timer" || t === "cta-button" || b.props.bg_color !== undefined;
    const evergreen = Boolean(b.props.evergreen);
    const noContent = ["section","row","column","divider"].includes(t);
    return (
      <div>
        {t === "row" && (
          <>
            <SL text="Columns" />
            {columnPresetCtl()}
            <div className="h-4" />
          </>
        )}
        <SL text="Content" />
        {t==="hero"&&<><Field label="Eyebrow">{textCtl("eyebrow")}</Field><Field label="Headline">{textCtl("headline")}</Field><Field label="Sub-headline">{areaCtl("subtext")}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Button URL">{textCtl("button_url")}</Field></>}
        {t==="countdown-timer"&&<><Field label="Label">{textCtl("label")}</Field><Field label="Evergreen (per-visitor timer)">{toggleCtl("evergreen")}</Field>{evergreen?<Field label="Duration (minutes)">{numCtl("duration_minutes")}</Field>:<Field label="Target date & time"><input type="datetime-local" value={(b.props.target_date as string)??""} onChange={e=>onSetProps(b.id,{target_date:e.target.value})} className={IS} /></Field>}</>}
        {t==="video"&&<><Field label="Video"><VideoUploadField value={b.props.url as string} onChange={url=>onSetProps(b.id,{url})} funnelId={funnelId} /></Field><Field label="Or paste a video / YouTube URL">{textCtl("url")}</Field><Field label="Caption">{textCtl("caption")}</Field></>}
        {t==="optin-form"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Form fields">{fieldsCtl()}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Fine print">{textCtl("fine_print")}</Field><Field label="Redirect URL after submit (optional)">{textCtl("redirect_url")}</Field></>}
        {t==="testimonial"&&<><Field label="Quote">{areaCtl("quote")}</Field><Field label="Author">{textCtl("name")}</Field><Field label="Role">{textCtl("role")}</Field><Field label="Video review (optional)"><VideoUploadField value={b.props.video_url as string} onChange={url=>onSetProps(b.id,{video_url:url})} funnelId={funnelId} /></Field>{Boolean(b.props.video_url)&&<Field label="Video caption">{textCtl("video_caption")}</Field>}</>}
        {(t==="headline"||t==="body-text")&&<Field label="Text">{areaCtl("text")}</Field>}
        {t==="cta-button"&&<><Field label="Button label">{textCtl("text")}</Field><Field label="Button URL">{textCtl("url")}</Field></>}
        {t==="pricing-card"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Price">{textCtl("price")}</Field><Field label="Period">{textCtl("period")}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Button URL">{textCtl("button_url")}</Field><Field label="Features">{itemsCtl("pricing")}</Field></>}
        {t==="stats-bar"&&<Field label="Stats">{itemsCtl("stats")}</Field>}
        {t==="faq-accordion"&&<Field label="Questions">{itemsCtl("faq")}</Field>}
        {t==="list"&&<Field label="Items">{itemsCtl("list")}</Field>}
        {t==="spacer"&&<Field label="Height">{numCtl("height")}</Field>}
        {t==="image"&&<><Field label="Image"><ImageUploadField value={b.props.src as string} onChange={url=>onSetProps(b.id,{src:url})} funnelId={funnelId} /></Field><Field label="Alt text">{textCtl("alt")}</Field><Field label="Corner radius">{numCtl("radius",{min:0,max:40,default:0})}</Field></>}
        {t==="custom-html"&&<Field label="HTML"><textarea value={(b.props.html as string)??""} onChange={e=>onSetProps(b.id,{html:e.target.value})} rows={6} className={IS} style={{resize:"vertical",fontFamily:"monospace"}} /></Field>}
        {noContent && <p className="text-xs text-white/40 leading-relaxed mb-2">This block has no text content. Use the Layout tab to adjust spacing and style.</p>}
        {hasStyle && (
          <>
            <div className="h-4" />
            <SL text="Style" />
            {t==="headline"&&<Field label="Size">{headlineSizeCtl()}</Field>}
            {(t==="headline"||t==="body-text")&&<><Field label="Alignment">{alignCtl()}</Field><Field label="Text color">{colorCtl("color")}</Field></>}
            {t==="cta-button"&&<><Field label="Size">{ctaSizeCtl()}</Field><Field label="Full width">{toggleCtl("full_width")}</Field><Field label="Text color">{colorCtl("text_color")}</Field></>}
            {(t==="countdown-timer"||t==="cta-button"||t==="pricing-card"||t==="list")&&<Field label="Accent color">{colorCtl("accent_color")}</Field>}
            {b.props.bg_color !== undefined && <Field label="Background">{colorCtl("bg_color")}</Field>}
          </>
        )}
      </div>
    );
  }

  function LayoutSettings() {
    if (!b) return null;
    const t = b.type;
    const isRow = t === "section" || t === "row";
    const isContainer = isRow || t === "column";
    return (
      <div>
        <SL text="Spacing" />
        <Field label="Padding">{paddingCtl()}</Field>
        {isRow && (
          <>
            <div className="h-4" />
            <SL text="Width" />
            <Field label="Width">{layoutToggleCtl("boxed")}</Field>
            <div className="h-4" />
            <SL text="Background" />
            <Field label="Background image">
              <ImageUploadField value={b.layout?.bg_image} onChange={url => onSetLayout(b.id, { bg_image: url || undefined })} funnelId={funnelId} />
            </Field>
            {Boolean(b.layout?.bg_image) && bgOverlayCtl()}
          </>
        )}
        {isContainer && (
          <>
            <div className={isRow ? "h-1.5" : "h-4"} />
            <SL text="Border" />
            {borderCtl()}
          </>
        )}
        <div className="h-4" />
        <SL text="Visibility" />
        <Field label="Reveal after video reaches…">{revealCtl()}</Field>
      </div>
    );
  }

  function PageSettings() {
    const s = page.settings ?? {};
    const layout = (s.layout as { width_mode?: "boxed"|"full"; max_width?: number }) ?? {};
    const bgVal  = (s.bg_color as string) ?? "#0c0c0f";
    return (
      <div>
        <SL text="SEO & sharing" />
        <Field label="Page title">
          <input value={page.name} onChange={e => onSetPage({ name: e.target.value })} className={IS} />
        </Field>
        <Field label="Meta description">
          <textarea value={(s.description as string)??""} onChange={e => onSetPage({ settings: {...s, description: e.target.value} })} rows={3} className={IS} style={{ resize: "vertical", lineHeight: 1.5 }} />
        </Field>
        <Field label="URL slug">
          <div className="flex items-center">
            <span className="text-xs text-white/30 font-mono bg-[#0f0f0f] border border-white/10 border-r-0 rounded-l-lg px-2 py-2">/</span>
            <input value={page.slug} onChange={e => onSetPage({ slug: e.target.value })}
              className="flex-1 bg-white/5 border border-white/10 rounded-r-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-orange-500/40 transition-colors" />
          </div>
        </Field>
        <div className="h-4" />
        <SL text="Layout" />
        <Field label="Page width">
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
            {(["boxed","full"] as const).map(m => (
              <button key={m} onClick={() => onSetPage({ settings: {...s, layout: {...layout, width_mode: m}} })}
                className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold capitalize transition-colors ${
                  (layout.width_mode ?? "boxed") === m ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
                }`}>
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Max width (px)">
          <input type="number" value={layout.max_width ?? 1100}
            onChange={e => onSetPage({ settings: {...s, layout: {...layout, max_width: +e.target.value}} })}
            className={IS} />
        </Field>
        <div className="h-4" />
        <SL text="Style" />
        <Field label="Background color">
          <div className="flex gap-2 items-center">
            <div className="relative w-[34px] h-[34px] rounded-lg border border-white/10 shrink-0" style={{ background: bgVal }}>
              <input type="color" value={bgVal} onChange={e => onSetPage({ settings: {...s, bg_color: e.target.value} })}
                className="absolute inset-0 opacity-0 w-full h-full border-none p-0 cursor-pointer" />
            </div>
            <input value={bgVal} onChange={e => onSetPage({ settings: {...s, bg_color: e.target.value} })}
              className={IS + " font-mono text-xs"} />
          </div>
        </Field>
        <div className="h-4" />
        <SL text="Tracking" />
        <Field label="Analytics / pixel ID">
          <input value={(s.tracking_id as string)??""}
            onChange={e => onSetPage({ settings: {...s, tracking_id: e.target.value} })}
            className={IS} />
        </Field>
        <div className="h-4" />
        <button onClick={onSave}
          className="w-full py-2.5 bg-orange-500/[0.1] border border-orange-500/30 rounded-lg text-orange-400 text-[13px] font-semibold cursor-pointer hover:bg-orange-500/[0.16] transition-colors">
          Save page settings
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Panel header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] shrink-0">
        {b ? (
          <>
            <div className="w-[30px] h-[30px] rounded-lg bg-orange-500/[0.12] flex items-center justify-center text-orange-500 shrink-0">
              <BlockIcon type={b.type} size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-white">{LABELS[b.type]}</div>
              <div className="text-[10.5px] text-white/30">Block settings</div>
            </div>
            <button onClick={onDeselect} className="border-none bg-transparent text-white/25 cursor-pointer p-1 hover:text-white/60 transition-colors">
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="w-[30px] h-[30px] rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 shrink-0">
              <Icon paths={["M4 5h16v14H4z","M4 9h16"]} size={16} sw={1.7} />
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-white">Page settings</div>
              <div className="text-[10.5px] text-white/30">Select a block to edit it</div>
            </div>
          </>
        )}
      </div>

      {/* Content / Layout tabs */}
      {b && (
        <div className="flex border-b border-white/[0.06] px-2 shrink-0">
          {(["content","layout"] as const).map(tab => (
            <button key={tab} onClick={() => setRpTab(tab)}
              className={`flex-1 flex items-center justify-center py-2.5 bg-transparent border-none cursor-pointer capitalize text-[12.5px] font-semibold transition-colors ${
                rpTab === tab
                  ? "text-white border-b-2 border-orange-500"
                  : "text-white/30 border-b-2 border-transparent hover:text-white/60"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto p-4">
        {b ? (rpTab === "content" ? BlockSettings() : LayoutSettings()) : PageSettings()}
      </div>
    </>
  );
}
