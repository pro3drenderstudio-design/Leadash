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
  reorderBlockItem,
  setColumnPreset,
} from "@/lib/funnel-blocks/tree";
import { Icon, BlockIcon, LABELS, LIB_GROUPS } from "@/lib/funnel-blocks/render/icons";
import { BlockTree } from "@/lib/funnel-blocks/render/BlockTree";
import { interpolateFunnelVariables } from "@/lib/funnel-blocks/variables";
import type { BlockRenderContext } from "@/lib/funnel-blocks/render/BlockRenderer";
import { ICON_TYPE_LIST } from "@/lib/funnel-blocks/render/BlockRenderer";
import { FunnelIcon, FUNNEL_ICON_LIST } from "@/lib/funnel-blocks/render/funnel-icons";
import { PATTERN_PRESETS } from "@/lib/funnel-blocks/render/wrappers";
import { createClient } from "@/lib/supabase/client";

const AC = "#f97316";

const GOOGLE_FONTS_SANS    = ["Inter","Poppins","Montserrat","Lato","Open Sans","Raleway","Nunito","DM Sans","Plus Jakarta Sans","Outfit","Sora","Manrope","Figtree","Mulish"];
const GOOGLE_FONTS_SERIF   = ["Playfair Display","Merriweather","Lora","EB Garamond","Libre Baskerville"];
const GOOGLE_FONTS_DISPLAY = ["Space Grotesk","Oswald","Anton","Bebas Neue","Bricolage Grotesque"];

// ── Gradient builder ──────────────────────────────────────────────────────────

type GStop = { color: string; pos: number };
type GConfig = { type: "linear"|"radial"|"conic"; angle: number; radialShape: "circle"|"ellipse"; radialPos: string; stops: GStop[] };

const G_DEFAULT: GConfig = { type:"linear", angle:135, radialShape:"circle", radialPos:"center", stops:[{color:"#f97316",pos:0},{color:"#7c3aed",pos:100}] };

const G_QUICK_STARTS: GConfig[] = [
  { ...G_DEFAULT, stops:[{color:"#f97316",pos:0},{color:"#dc2626",pos:100}] },
  { ...G_DEFAULT, stops:[{color:"#7c3aed",pos:0},{color:"#4f46e5",pos:100}] },
  { ...G_DEFAULT, stops:[{color:"#059669",pos:0},{color:"#0891b2",pos:100}] },
  { ...G_DEFAULT, stops:[{color:"#db2777",pos:0},{color:"#f97316",pos:100}] },
  { ...G_DEFAULT, angle:180, stops:[{color:"#111827",pos:0},{color:"#0c0c0f",pos:100}] },
  { ...G_DEFAULT, stops:[{color:"#1e2433",pos:0},{color:"#0c0c0f",pos:100}] },
  { ...G_DEFAULT, type:"radial", radialShape:"ellipse", radialPos:"top", stops:[{color:"#1e2433",pos:0},{color:"#0c0c0f",pos:100}] },
  { ...G_DEFAULT, stops:[{color:"#134e4a",pos:0},{color:"#1e3a5f",pos:100}] },
];

function buildGCss(cfg: GConfig): string {
  const s = cfg.stops.map(s => `${s.color} ${s.pos.toFixed(0)}%`).join(", ");
  if (cfg.type === "radial") return `radial-gradient(${cfg.radialShape} at ${cfg.radialPos}, ${s})`;
  if (cfg.type === "conic") return `conic-gradient(from ${cfg.angle}deg, ${s})`;
  return `linear-gradient(${cfg.angle}deg, ${s})`;
}

function parseGStops(str: string): GStop[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.map((p, i) => {
    const m = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/);
    if (m) return { color: m[1].trim(), pos: parseFloat(m[2]) };
    return { color: p.trim(), pos: Math.round((i / Math.max(parts.length - 1, 1)) * 100) };
  });
}

function parseGCss(css: string): GConfig {
  if (!css) return G_DEFAULT;
  try {
    const lin = css.match(/^linear-gradient\((\d+(?:\.\d+)?)deg,(.+)\)$/);
    if (lin) return { ...G_DEFAULT, type:"linear", angle:parseFloat(lin[1]), stops:parseGStops(lin[2]) };
    const rad = css.match(/^radial-gradient\((circle|ellipse)(?:\s+at\s+([^,]+))?,(.+)\)$/);
    if (rad) return { ...G_DEFAULT, type:"radial", radialShape:rad[1] as "circle"|"ellipse", radialPos:(rad[2]?.trim()||"center"), stops:parseGStops(rad[3]) };
    const con = css.match(/^conic-gradient\(from\s+(\d+(?:\.\d+)?)deg,(.+)\)$/);
    if (con) return { ...G_DEFAULT, type:"conic", angle:parseFloat(con[1]), stops:parseGStops(con[2]) };
  } catch {}
  return G_DEFAULT;
}

const IS_G = "bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-orange-500/40 font-mono";

function GradientBuilder({ value, onChange }: { value: string; onChange: (css: string) => void }) {
  const [cfg, setCfg] = React.useState<GConfig>(() => parseGCss(value));

  function apply(next: GConfig) { setCfg(next); onChange(buildGCss(next)); }
  function upd(patch: Partial<GConfig>) { apply({ ...cfg, ...patch }); }
  function updStop(idx: number, patch: Partial<GStop>) {
    apply({ ...cfg, stops: cfg.stops.map((s, i) => i === idx ? { ...s, ...patch } : s) });
  }
  function addStop() {
    const mid = Math.round((cfg.stops[0].pos + cfg.stops[cfg.stops.length - 1].pos) / 2);
    apply({ ...cfg, stops: [...cfg.stops, { color: "#ffffff", pos: mid }].sort((a, b) => a.pos - b.pos) });
  }
  function rmStop(idx: number) {
    if (cfg.stops.length <= 2) return;
    apply({ ...cfg, stops: cfg.stops.filter((_, i) => i !== idx) });
  }

  const preview = buildGCss(cfg);

  return (
    <div>
      {/* Preview strip + quick-starts */}
      <div style={{ height: 28, borderRadius: 7, background: preview, marginBottom: 8, border: "1px solid rgba(255,255,255,0.07)" }} />
      <div className="flex gap-1 flex-wrap mb-3">
        {G_QUICK_STARTS.map((qs, i) => (
          <button key={i} title="Use this preset" onMouseDown={e => { e.preventDefault(); apply(qs); }}
            style={{ width: 24, height: 24, borderRadius: 5, background: buildGCss(qs), border: "2px solid rgba(255,255,255,0.06)", cursor: "pointer", flexShrink: 0 }} />
        ))}
      </div>

      {/* Type tabs */}
      <div className="flex gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5 mb-3">
        {(["linear","radial","conic"] as const).map(t => (
          <button key={t} onClick={() => upd({ type:t })}
            className={`flex-1 py-1 rounded-md text-[10.5px] font-semibold cursor-pointer transition-colors border-none ${cfg.type===t?"bg-orange-500 text-white":"text-white/40 hover:text-white/60 bg-transparent"}`}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* Color stops */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10.5px] text-white/40">Color stops</span>
          <button onClick={addStop} className="text-[10px] text-orange-400 cursor-pointer bg-transparent border-none hover:text-orange-300 p-0">+ Add stop</button>
        </div>
        {cfg.stops.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1.5">
            <div className="relative w-7 h-7 rounded-md border border-white/10 shrink-0 overflow-hidden" style={{ background: s.color }}>
              <input type="color" value={s.color} onChange={e => updStop(i, { color: e.target.value })}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </div>
            <input value={s.color} onChange={e => updStop(i, { color: e.target.value })} className={IS_G + " w-[82px]"} />
            <input type="number" min={0} max={100} value={s.pos}
              onChange={e => updStop(i, { pos: Math.min(100, Math.max(0, +e.target.value)) })}
              className={IS_G + " w-11 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"} />
            <span className="text-[10px] text-white/25">%</span>
            <button onClick={() => rmStop(i)} disabled={cfg.stops.length <= 2}
              className="border-none bg-transparent text-white/25 cursor-pointer hover:text-white/60 disabled:opacity-20 disabled:cursor-not-allowed text-base p-0 ml-auto leading-none">×</button>
          </div>
        ))}
      </div>

      {/* Angle (linear / conic) */}
      {(cfg.type === "linear" || cfg.type === "conic") && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10.5px] text-white/40 flex-1">Angle</span>
            <input type="number" min={0} max={360} value={cfg.angle} onChange={e => upd({ angle: +e.target.value })}
              className="w-10 bg-transparent text-[10.5px] text-white/60 font-mono text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-[9.5px] text-white/25 font-mono w-3 shrink-0">°</span>
          </div>
          <input type="range" min={0} max={360} value={cfg.angle} onChange={e => upd({ angle: +e.target.value })}
            className="w-full accent-orange-500" />
        </div>
      )}

      {/* Radial options */}
      {cfg.type === "radial" && (
        <>
          <div className="flex gap-1 mb-2">
            {(["circle","ellipse"] as const).map(sh => (
              <button key={sh} onClick={() => upd({ radialShape: sh })}
                className={`flex-1 py-1 rounded-md text-[10.5px] border cursor-pointer transition-colors bg-transparent ${cfg.radialShape===sh?"border-orange-500 text-orange-400":"border-white/10 text-white/40 hover:text-white/60"}`}>
                {sh.charAt(0).toUpperCase()+sh.slice(1)}
              </button>
            ))}
          </div>
          <select value={cfg.radialPos} onChange={e => upd({ radialPos: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-orange-500/40 mb-2">
            {["center","top","bottom","left","right","top left","top right","bottom left","bottom right"].map(v => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>
            ))}
          </select>
        </>
      )}

      <button onClick={() => onChange("")}
        className="w-full py-1.5 text-[10.5px] text-white/30 border border-white/10 rounded-md cursor-pointer bg-transparent hover:text-white/50 mt-1">
        Clear gradient
      </button>
    </div>
  );
}

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
  { label: "100",      widths: [100] },
  { label: "50·50",    widths: [50, 50] },
  { label: "33·33·33", widths: [33.33, 33.33, 33.34] },
  { label: "30·70",    widths: [30, 70] },
  { label: "70·30",    widths: [70, 30] },
  { label: "25×4",     widths: [25, 25, 25, 25] },
  { label: "20×5",     widths: [20, 20, 20, 20, 20] },
  { label: "16×6",     widths: [16.67, 16.67, 16.66, 16.67, 16.67, 16.66] },
];

// ── Main Builder ───────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const params    = useParams();
  const router    = useRouter();
  const funnelId  = params.id     as string;
  const pageId    = params.pageId as string;

  const [page,       setPage]       = useState<PageData|null>(null);
  const [funnelName,     setFunnelName]     = useState("");
  const [funnelSlug,     setFunnelSlug]     = useState("");
  const [funnelTracking, setFunnelTracking] = useState<Record<string, string>>({});
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
  // Resolved merge-variable values ({next_active_cohort_date}, …) for the live preview.
  const [varValues,   setVarValues]   = useState<Record<string, string>>({});

  const toastTimer       = useRef<ReturnType<typeof setTimeout>|null>(null);
  const previewSessionId = useRef(`preview_${genId()}`);
  void funnelSlug;

  useEffect(() => {
    fetch("/api/admin/funnels/variables")
      .then(r => r.json())
      .then(d => setVarValues(d.values ?? {}))
      .catch(() => {});
  }, []);

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
        const fd = await fr.json() as { funnel?: { slug: string; name: string; settings?: Record<string, unknown> } };
        setFunnelSlug(fd.funnel?.slug ?? "");
        setFunnelName(fd.funnel?.name ?? "");
        setFunnelTracking((fd.funnel?.settings?.tracking as Record<string, string>) ?? {});
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

  function reorderItem(id: string, from: number, to: number) {
    commitBlocks(reorderBlockItem(blocks, id, from, to));
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

  async function saveFunnelTracking(patch: Record<string, string>) {
    const updated = { ...funnelTracking, ...patch };
    // Remove empty strings so the saved object stays clean
    for (const k of Object.keys(updated)) { if (!updated[k]) delete updated[k]; }
    setFunnelTracking(updated);
    await fetch(`/api/admin/funnels/${funnelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { tracking: updated } }),
    });
    showToast("Tracking settings saved");
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
    device,
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
                <BlockTree blocks={preview ? interpolateFunnelVariables(blocks, varValues) : blocks} ctx={blockCtx} />
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
              device={device}
              onDeselect={() => setSelectedId(null)}
              onSetProps={setProps}
              onSetLayout={setLayout}
              onSetPage={setPageField}
              onCommitItem={commitItem}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onReorderItem={reorderItem}
              onColumnPreset={applyColumnPreset}
              onSave={() => save()}
              funnelId={funnelId}
              videoBlocks={videoBlocks}
              funnelTracking={funnelTracking}
              onSaveFunnelTracking={saveFunnelTracking}
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
  device: Device;
  onDeselect: ()=>void;
  onSetProps: (id:string, patch:Record<string,unknown>)=>void;
  onSetLayout: (id:string, patch:Record<string,unknown>)=>void;
  onSetPage: (patch:Partial<PageData>)=>void;
  onCommitItem: (id:string, idx:number, field:string|null, val:string)=>void;
  onAddItem: (id:string, item:unknown)=>void;
  onRemoveItem: (id:string, idx:number)=>void;
  onReorderItem: (id:string, from:number, to:number)=>void;
  onColumnPreset: (rowId:string, widths:number[])=>void;
  onSave: ()=>void;
  videoBlocks: { id:string; label:string }[];
  funnelTracking: Record<string, string>;
  onSaveFunnelTracking: (tracking: Record<string, string>) => void;
}

function RightPanel({ selectedBlock:b, page, funnelId, device, onDeselect, onSetProps, onSetLayout, onSetPage, onCommitItem, onAddItem, onRemoveItem, onReorderItem, onColumnPreset, onSave, videoBlocks, funnelTracking, onSaveFunnelTracking }: RPProps) {
  const [rpTab, setRpTab] = useState<"content"|"layout">("content");
  const [openIconPicker, setOpenIconPicker] = useState<number | null>(null);
  useEffect(() => { setOpenIconPicker(null); }, [b?.id]);

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
  // ── Device-aware prop helpers ──────────────────────────────────────────────
  // When in mobile/tablet mode, reads from layout.props_mobile/tablet (falling back to desktop)
  // and writes to those override buckets instead of block.props.
  function dpLayoutKey() {
    return device === "mobile" ? "props_mobile" : device === "tablet" ? "props_tablet" : "";
  }
  function dpOverrides() {
    const lk = dpLayoutKey();
    return lk ? (((b?.layout as Record<string,unknown>)?.[lk] ?? {}) as Record<string,unknown>) : {};
  }
  function getDP(key: string): unknown {
    if (!b) return undefined;
    const lk = dpLayoutKey();
    if (!lk) return b.props[key];
    const ov = ((b.layout as Record<string,unknown>)?.[lk] ?? {}) as Record<string,unknown>;
    return key in ov ? ov[key] : b.props[key];
  }
  function setDP(key: string, value: unknown) {
    if (!b) return;
    const lk = dpLayoutKey();
    if (lk) {
      const existing = ((b.layout as Record<string,unknown>)?.[lk] ?? {}) as Record<string,unknown>;
      onSetLayout(b.id, { [lk]: { ...existing, [key]: value } });
    } else {
      onSetProps(b.id, { [key]: value });
    }
  }
  function isPropFallback(key: string): boolean {
    if (!b || !dpLayoutKey()) return false;
    return !(key in dpOverrides());
  }
  // ── End device-aware helpers ───────────────────────────────────────────────

  function colorCtl(key: string) {
    if (!b) return null;
    const isFallback = isPropFallback(key);
    const v = (getDP(key) as string) ?? "#0c0c0f";
    const isTransparent = v === "transparent";
    const safe = isTransparent ? "#0c0c0f" : v;
    return (
      <div className="flex gap-2 items-center">
        {/* Checkerboard transparent toggle */}
        <button
          onClick={() => setDP(key, isTransparent ? "#0c0c0f" : "transparent")}
          title={isTransparent ? "Transparent (click to use solid color)" : "Set transparent"}
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0, cursor: "pointer",
            border: isTransparent ? "2px solid #f97316" : "1px solid rgba(255,255,255,0.12)",
            backgroundImage: "linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0,0 4px,4px -4px,-4px 0px",
            backgroundColor: "#999",
            position: "relative", overflow: "hidden",
          }}>
          {isTransparent && (
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#f97316", textShadow: "0 0 4px rgba(0,0,0,0.8)" }}>✓</span>
          )}
        </button>
        {/* Color swatch */}
        <div className="relative w-[34px] h-[34px] rounded-lg shrink-0"
          style={{ background: safe, border: isFallback ? "1px dashed rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.1)", opacity: isFallback ? 0.6 : 1 }}>
          <input type="color" value={safe} onChange={e => setDP(key, e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full border-none p-0 cursor-pointer" />
        </div>
        <input value={v} onChange={e => setDP(key, e.target.value)} className={IS + " font-mono text-xs"} />
      </div>
    );
  }
  function alignCtl() {
    if (!b) return null;
    const isFallback = isPropFallback("align");
    const cur = (getDP("align") as string) ?? "left";
    const opts: [string, string[]][] = [
      ["left",   ["M4 6h16","M4 12h10","M4 18h13"]],
      ["center", ["M4 6h16","M7 12h10","M5 18h14"]],
      ["right",  ["M4 6h16","M10 12h10","M7 18h13"]],
    ];
    return (
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5" style={{ opacity: isFallback ? 0.55 : 1 }}>
        {opts.map(([a, paths]) => (
          <button key={a} onClick={() => setDP("align", a)}
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
    const isFallback = isPropFallback(key);
    const val = (getDP(key) as number) ?? def;
    return (
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={val} onChange={e => setDP(key, +e.target.value)}
          className={`flex-1 accent-orange-500${isFallback ? " opacity-40" : ""}`} />
        <span className={`text-xs font-mono min-w-[46px] text-right${isFallback ? " text-white/25" : " text-white/50"}`}>
          {val}{suffix}{isFallback ? " ↩" : ""}
        </span>
      </div>
    );
  }
  function ctaSizeCtl() {
    if (!b) return null;
    const isFallback = isPropFallback("size");
    const cur = (getDP("size") as string) ?? "md";
    const opts: ["sm"|"md"|"lg", string][] = [["sm","S"],["md","M"],["lg","L"]];
    return (
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5" style={{ opacity: isFallback ? 0.55 : 1 }}>
        {opts.map(([v, l]) => (
          <button key={v} onClick={() => setDP("size", v)}
            className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${
              cur === v ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
            }`}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function fullWidthCtl() {
    if (!b) return null;
    const isFallback = isPropFallback("full_width");
    const on = Boolean(getDP("full_width"));
    return (
      <button onClick={() => setDP("full_width", !on)}
        className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-0" style={{ opacity: isFallback ? 0.6 : 1 }}>
        <span className={`relative w-[34px] h-[19px] rounded-full transition-colors shrink-0 ${on ? "bg-orange-500" : "bg-white/15"}`}>
          <span className={`absolute top-[2px] w-[15px] h-[15px] rounded-full bg-white transition-all ${on ? "left-[17px]" : "left-[2px]"}`} />
        </span>
        <span className="text-[12.5px] text-white/60">{on ? "On" : "Off"}{isFallback ? " ↩" : ""}</span>
      </button>
    );
  }
  function headlineSizeCtl() {
    if (!b) return null;
    const isFallback = isPropFallback("size");
    const cur = getDP("size") as { value: number; unit: string } | undefined;
    const curVal = cur?.value ?? 2.25;
    const curUnit = cur?.unit ?? "rem";
    const displayPx = curUnit === "rem" ? Math.round(curVal * 16) : Math.round(curVal);
    function setSize(sizeObj: { value: number; unit: string }) { setDP("size", sizeObj); }
    return (
      <div style={{ opacity: isFallback ? 0.6 : 1 }}>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5 mb-2">
          {([[1.5,"S"],[1.875,"M"],[2.25,"L"],[3,"XL"]] as [number,string][]).map(([v, l]) => (
            <button key={l} onClick={() => setSize({ value: v, unit: "rem" })}
              className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${
                !isFallback && curUnit === "rem" && Math.abs(curVal - v) < 0.01 ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
              }`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-white/35 whitespace-nowrap">custom{isFallback ? " ↩" : ""}:</span>
          <input type="number" min={8} max={200} value={displayPx}
            onChange={e => setSize({ value: +e.target.value, unit: "px" })}
            className="w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-orange-500/40" />
          <span className="text-[10.5px] text-white/35">px</span>
        </div>
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
  function layoutRangeRow(label: string, val: number, onChange: (v: number) => void, min=0, max=100, _fmt?: (v: number) => string, isFallback?: boolean) {
    const isPercent = max <= 1;
    const step = isPercent ? 0.01 : 1;
    const displayNum = isPercent ? Math.round(val * 100) : Math.round(val);
    const unit = isPercent ? "%" : "px";
    return (
      <div className="mb-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[10.5px] flex-1 ${isFallback ? "text-white/20 italic" : "text-white/40"}`}>{label}{isFallback ? " ↩" : ""}</span>
          <input type="number" value={displayNum} step={1}
            onChange={e => { const n = Number(e.target.value); onChange(isPercent ? n / 100 : n); }}
            className={`w-10 bg-transparent text-[10.5px] font-mono text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isFallback ? "text-white/25" : "text-white/60"}`} />
          <span className="text-[9.5px] text-white/25 font-mono w-4 shrink-0">{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={Math.min(Math.max(val, min), max)} onChange={e => onChange(+e.target.value)} className="w-full accent-orange-500" />
      </div>
    );
  }

  function paddingCtl() {
    if (!b) return null;
    // When in mobile/tablet mode, read the device-specific override (falling back to desktop).
    const sfx = device === "mobile" ? "_mobile" : device === "tablet" ? "_tablet" : "";
    const l = b.layout as Record<string, unknown> | undefined;
    function getVal(key: string): [number, boolean] {
      if (sfx && l?.[`${key}${sfx}`]) return [(l[`${key}${sfx}`] as { value: number }).value, false];
      return [(l?.[key] as { value: number } | undefined)?.value ?? 0, !!sfx];
    }
    function setKey(key: string) {
      return (v: number) => onSetLayout(b!.id, { [`${key}${sfx}`]: { value: v, unit: "px" } });
    }
    const [pt, ptFb] = getVal("padding_top");
    const [pr, prFb] = getVal("padding_right");
    const [pb, pbFb] = getVal("padding_bottom");
    const [pl, plFb] = getVal("padding_left");
    return (
      <div>
        {layoutRangeRow("Top",    pt, setKey("padding_top"),    0, 300, undefined, ptFb)}
        {layoutRangeRow("Right",  pr, setKey("padding_right"),  0, 300, undefined, prFb)}
        {layoutRangeRow("Bottom", pb, setKey("padding_bottom"), 0, 300, undefined, pbFb)}
        {layoutRangeRow("Left",   pl, setKey("padding_left"),   0, 300, undefined, plFb)}
      </div>
    );
  }

  function marginCtl() {
    if (!b) return null;
    const sfx = device === "mobile" ? "_mobile" : device === "tablet" ? "_tablet" : "";
    const l = b.layout as Record<string, unknown> | undefined;
    function getVal(key: string): [number, boolean] {
      if (sfx && l?.[`${key}${sfx}`]) return [(l[`${key}${sfx}`] as { value: number }).value, false];
      return [(l?.[key] as { value: number } | undefined)?.value ?? 0, !!sfx];
    }
    function setKey(key: string) {
      return (v: number) => onSetLayout(b!.id, { [`${key}${sfx}`]: { value: v, unit: "px" } });
    }
    const [mt, mtFb] = getVal("margin_top");
    const [mr, mrFb] = getVal("margin_right");
    const [mb, mbFb] = getVal("margin_bottom");
    const [ml, mlFb] = getVal("margin_left");
    return (
      <div>
        {layoutRangeRow("Top",    mt, setKey("margin_top"),    -200, 200, undefined, mtFb)}
        {layoutRangeRow("Right",  mr, setKey("margin_right"),  -200, 200, undefined, mrFb)}
        {layoutRangeRow("Bottom", mb, setKey("margin_bottom"), -200, 200, undefined, mbFb)}
        {layoutRangeRow("Left",   ml, setKey("margin_left"),   -200, 200, undefined, mlFb)}
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
        {layoutRangeRow("Overlay opacity", op, v => onSetLayout(b.id, { bg_overlay_opacity: v }), 0, 1)}
      </div>
    );
  }
  function fontCtl(keyFamily = "font_family", keySize: string | null = "font_size") {
    if (!b) return null;
    // Font family is not device-specific (keeps the same font across breakpoints)
    const famVal = (b.props[keyFamily] as string) ?? "";
    // Font size IS device-specific
    const isFsDeviceFallback = keySize ? isPropFallback(keySize) : false;
    const sizeVal = keySize ? ((getDP(keySize) as number) ?? 16) : 16;
    return (
      <>
        <Field label="Font family">
          <select value={famVal} onChange={e => onSetProps(b.id, { [keyFamily]: e.target.value || undefined })} className={IS}>
            <option value="">Default</option>
            <optgroup label="Sans-serif">{GOOGLE_FONTS_SANS.map(f => <option key={f} value={f}>{f}</option>)}</optgroup>
            <optgroup label="Serif">{GOOGLE_FONTS_SERIF.map(f => <option key={f} value={f}>{f}</option>)}</optgroup>
            <optgroup label="Display">{GOOGLE_FONTS_DISPLAY.map(f => <option key={f} value={f}>{f}</option>)}</optgroup>
          </select>
        </Field>
        {keySize && (
          <Field label="Font size">
            <div className="flex items-center gap-2">
              <input type="range" min={10} max={80} value={sizeVal}
                onChange={e => setDP(keySize, +e.target.value)}
                className={`flex-1 accent-orange-500${isFsDeviceFallback ? " opacity-40" : ""}`} />
              <span className={`text-xs font-mono min-w-[46px] text-right${isFsDeviceFallback ? " text-white/25" : " text-white/50"}`}>
                {sizeVal}px{isFsDeviceFallback ? " ↩" : ""}
              </span>
            </div>
          </Field>
        )}
      </>
    );
  }
  function iconTypeCtl(key = "icon_type") {
    if (!b) return null;
    const cur = (b.props[key] as string) ?? "check";
    return (
      <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 p-1.5 bg-white/[0.02]">
        <div className="grid grid-cols-7 gap-0.5">
          {FUNNEL_ICON_LIST.map(name => (
            <button key={name} title={name} onClick={() => onSetProps(b.id, { [key]: name })}
              style={{ color: "currentColor" }}
              className={`flex items-center justify-center h-7 w-full rounded cursor-pointer border transition-colors ${cur === name ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-transparent bg-transparent text-white/40 hover:text-white/80 hover:bg-white/8"}`}>
              <FunnelIcon name={name} size={14} color="currentColor" strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <div className="mt-1.5 px-0.5 text-[9.5px] text-white/25 font-mono">{cur}</div>
      </div>
    );
  }
  function gradientCtl() {
    if (!b) return null;
    return (
      <GradientBuilder
        key={b.id + "-grad"}
        value={(b.layout?.bg_gradient as string) ?? ""}
        onChange={css => onSetLayout(b.id, { bg_gradient: css || undefined })}
      />
    );
  }
  function patternCtl() {
    if (!b) return null;
    const cur = (b.layout?.bg_pattern as string) ?? "";
    const opacity = (b.layout?.bg_pattern_opacity as number) ?? 0.15;
    const color = (b.layout?.bg_pattern_color as string) ?? "#ffffff";
    return (
      <div>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {Object.entries(PATTERN_PRESETS).map(([key, pat]) => {
            const active = cur === key;
            return (
              <button key={key} title={pat.label}
                onMouseDown={e => { e.preventDefault(); onSetLayout(b.id, { bg_pattern: active ? undefined : key }); }}
                style={{
                  width: "100%", height: 36, borderRadius: 7, cursor: "pointer",
                  background: "#0c0c0f",
                  backgroundImage: pat.bg.replace(/PCOLOR/g, "rgba(255,255,255,0.3)"),
                  backgroundSize: pat.size ?? undefined,
                  border: active ? "2px solid #f97316" : "2px solid rgba(255,255,255,0.08)",
                  fontSize: 8, color: "rgba(255,255,255,0.35)", display: "flex",
                  alignItems: "flex-end", justifyContent: "center", paddingBottom: 3,
                }}
              >{pat.label}</button>
            );
          })}
        </div>
        {cur && (
          <>
            <Field label="Pattern color">
              <div className="flex gap-2 items-center">
                <div className="relative w-[34px] h-[34px] rounded-lg border border-white/10 shrink-0 overflow-hidden" style={{ background: color }}>
                  <input type="color" value={color}
                    onChange={e => onSetLayout(b.id, { bg_pattern_color: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                </div>
                <input value={color} onChange={e => onSetLayout(b.id, { bg_pattern_color: e.target.value })}
                  className={IS + " font-mono text-xs"} />
              </div>
            </Field>
            {layoutRangeRow("Pattern opacity", opacity, v => onSetLayout(b.id, { bg_pattern_opacity: v }), 0, 1)}
          </>
        )}
      </div>
    );
  }
  function imageSizeCtl() {
    if (!b) return null;
    const isFbAlign = isPropFallback("align");
    const isFbWidth = isPropFallback("width");
    const curAlign = (getDP("align") as string) ?? "center";
    const curWidth = (getDP("width") as string) ?? "100%";
    const alignOpts: [string, string][] = [["left","Left"],["center","Center"],["right","Right"]];
    return (
      <>
        <Field label="Alignment">
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5" style={{ opacity: isFbAlign ? 0.55 : 1 }}>
            {alignOpts.map(([v, l]) => (
              <button key={v} onClick={() => setDP("align", v)}
                className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${curAlign === v ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Width${isFbWidth ? " ↩" : ""}`}>
          <div className="flex gap-2">
            {["100%","75%","50%","auto"].map(w => (
              <button key={w} onClick={() => setDP("width", w)}
                className={`flex-1 py-1.5 border rounded-md cursor-pointer text-[11px] font-mono font-semibold transition-colors ${curWidth === w ? "border-orange-500 bg-orange-500/[0.12] text-orange-300" : "border-white/10 bg-white/5 text-white/40 hover:text-white/60"}`}>
                {w}
              </button>
            ))}
          </div>
          <input value={curWidth} onChange={e => setDP("width", e.target.value)}
            placeholder="e.g. 320px or 60%" className={IS + " mt-1.5 font-mono text-xs"} />
        </Field>
      </>
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
    const isIconList = kind === "list" && b.type === "icon-list";
    const isStats    = kind === "stats";
    const items = (b.props.items as unknown[]) ?? [];
    const blank = kind === "stats" ? { value: "0", label: "Label", icon: "" }
      : kind === "faq" ? { q: "New question?", a: "Answer." }
      : isIconList ? { text: "New item", icon_type: "check" }
      : { text: "New item" };
    return (
      <div>
        <div className="flex flex-col gap-1.5 mb-2">
          {items.map((it, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-1.5 px-2.5 py-2 bg-white/5 border border-white/[0.07] rounded-lg">
                {isIconList && (
                  <button
                    onClick={() => setOpenIconPicker(openIconPicker === idx ? null : idx)}
                    title="Change icon"
                    style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0, cursor: "pointer",
                      border: openIconPicker === idx ? "1.5px solid #f97316" : "1px solid rgba(255,255,255,0.12)",
                      background: openIconPicker === idx ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.04)",
                      color: openIconPicker === idx ? "#f97316" : "rgba(255,255,255,0.55)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                    <FunnelIcon name={(it as {icon_type?: string}).icon_type ?? "check"} size={13} color="currentColor" strokeWidth={2} />
                  </button>
                )}
                {isStats && (
                  <button
                    onClick={() => setOpenIconPicker(openIconPicker === idx ? null : idx)}
                    title="Change icon"
                    style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0, cursor: "pointer",
                      border: openIconPicker === idx ? "1.5px solid #f97316" : "1px solid rgba(255,255,255,0.12)",
                      background: openIconPicker === idx ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.04)",
                      color: openIconPicker === idx ? "#f97316" : "rgba(255,255,255,0.55)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                    {(it as {icon?: string}).icon
                      ? <FunnelIcon name={(it as {icon?: string}).icon!} size={13} color="currentColor" strokeWidth={2} />
                      : <Icon paths={["M12 4v16","M4 12h16"]} size={11} sw={2} />}
                  </button>
                )}
                <span className="flex-1 text-xs text-white/45 truncate">
                  {kind === "stats"
                    ? `${(it as {value:string;label:string}).value} · ${(it as {value:string;label:string}).label}`
                    : kind === "faq"
                    ? (it as {q:string}).q
                    : (it as {text:string}).text}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => { if (idx > 0) onReorderItem(b.id, idx, idx - 1); }}
                    disabled={idx === 0}
                    style={{ opacity: idx === 0 ? 0.2 : 1 }}
                    className="border-none bg-transparent text-white/30 cursor-pointer p-0.5 hover:text-white/70">
                    <Icon paths={["M12 19V5","M6 11l6-6 6 6"]} size={13} sw={2} />
                  </button>
                  <button
                    onClick={() => { if (idx < items.length - 1) onReorderItem(b.id, idx, idx + 1); }}
                    disabled={idx === items.length - 1}
                    style={{ opacity: idx === items.length - 1 ? 0.2 : 1 }}
                    className="border-none bg-transparent text-white/30 cursor-pointer p-0.5 hover:text-white/70">
                    <Icon paths={["M12 5v14","M6 13l6 6 6-6"]} size={13} sw={2} />
                  </button>
                  <button
                    onClick={() => { onRemoveItem(b.id, idx); if (openIconPicker === idx) setOpenIconPicker(null); }}
                    className="border-none bg-transparent text-white/25 cursor-pointer p-0.5 hover:text-white/60">
                    <Icon paths={["M5 12h14"]} size={14} sw={2} />
                  </button>
                </div>
              </div>
              {isIconList && openIconPicker === idx && (
                <div className="mt-0.5 p-1.5 bg-[#1a1a1a] border border-orange-500/30 rounded-lg shadow-xl">
                  <div className="grid grid-cols-7 gap-0.5 max-h-36 overflow-y-auto">
                    {FUNNEL_ICON_LIST.map(name => {
                      const cur = (it as {icon_type?: string}).icon_type ?? "check";
                      return (
                        <button key={name} title={name}
                          onClick={() => {
                            const updated = (items as Array<Record<string, unknown>>).map((item, i) =>
                              i === idx ? { ...item, icon_type: name } : item
                            );
                            onSetProps(b.id, { items: updated });
                            setOpenIconPicker(null);
                          }}
                          style={{ color: "currentColor" }}
                          className={`flex items-center justify-center h-7 w-full rounded cursor-pointer border transition-colors ${cur === name ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-transparent bg-transparent text-white/40 hover:text-white/80 hover:bg-white/8"}`}>
                          <FunnelIcon name={name} size={13} color="currentColor" strokeWidth={1.8} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 px-0.5 text-[9px] text-white/25 font-mono">
                    {(it as {icon_type?: string}).icon_type ?? "check"}
                  </div>
                </div>
              )}
              {isStats && openIconPicker === idx && (
                <div className="mt-0.5 p-1.5 bg-[#1a1a1a] border border-orange-500/30 rounded-lg shadow-xl">
                  <div className="grid grid-cols-7 gap-0.5 max-h-36 overflow-y-auto">
                    {FUNNEL_ICON_LIST.map(name => {
                      const cur = (it as {icon?: string}).icon ?? "";
                      return (
                        <button key={name} title={name}
                          onClick={() => {
                            const updated = (items as Array<Record<string, unknown>>).map((item, i) =>
                              i === idx ? { ...item, icon: name } : item
                            );
                            onSetProps(b.id, { items: updated });
                            setOpenIconPicker(null);
                          }}
                          style={{ color: "currentColor" }}
                          className={`flex items-center justify-center h-7 w-full rounded cursor-pointer border transition-colors ${cur === name ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-transparent bg-transparent text-white/40 hover:text-white/80 hover:bg-white/8"}`}>
                          <FunnelIcon name={name} size={13} color="currentColor" strokeWidth={1.8} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 px-0.5 flex items-center justify-between">
                    <span className="text-[9px] text-white/25 font-mono">{(it as {icon?: string}).icon || "none"}</span>
                    {(it as {icon?: string}).icon && (
                      <button className="text-[9px] text-white/35 hover:text-white/60 cursor-pointer bg-transparent border-none"
                        onClick={() => {
                          const updated = (items as Array<Record<string, unknown>>).map((item, i) =>
                            i === idx ? { ...item, icon: "" } : item
                          );
                          onSetProps(b.id, { items: updated });
                          setOpenIconPicker(null);
                        }}>
                        remove
                      </button>
                    )}
                  </div>
                </div>
              )}
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
    const cols = b.children ?? [];
    const current = cols.map(c => c.layout?.width?.value);

    function addColumn() {
      const n = cols.length + 1;
      const base = Math.floor(100 / n);
      const widths = Array(n).fill(base);
      widths[n - 1] = 100 - base * (n - 1);
      onColumnPreset(b!.id, widths);
    }
    function removeColumn(idx: number) {
      const remaining = cols.filter((_, i) => i !== idx).map(c => c.layout?.width?.value ?? Math.round(100 / cols.length));
      const sum = remaining.reduce((a, v) => a + v, 0);
      const normalized = remaining.map(w => parseFloat(((w * 100) / sum).toFixed(2)));
      normalized[normalized.length - 1] = parseFloat((100 - normalized.slice(0, -1).reduce((a, v) => a + v, 0)).toFixed(2));
      onColumnPreset(b!.id, normalized);
    }
    function updateColWidth(idx: number, pct: number) {
      const widths = cols.map((c, i) => i === idx ? pct : (c.layout?.width?.value ?? Math.round(100 / cols.length)));
      onColumnPreset(b!.id, widths);
    }

    return (
      <div>
        {/* Preset buttons */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {COLUMN_PRESETS.map(preset => {
            const active = current.length === preset.widths.length && current.every((w, i) => Math.abs((w??0) - preset.widths[i]) < 0.5);
            return (
              <button key={preset.label} onClick={() => onColumnPreset(b!.id, preset.widths)}
                className={`py-2 px-1.5 border rounded-lg text-[10.5px] font-semibold cursor-pointer transition-all ${
                  active
                    ? "border-orange-500 bg-orange-500/[0.12] text-orange-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
                }`}>
                {preset.label}
              </button>
            );
          })}
        </div>
        {/* Per-column width controls */}
        {cols.length > 0 && (
          <div className="mb-2.5">
            <div className="text-[10px] text-white/30 mb-1.5">Custom widths (%)</div>
            {cols.map((col, i) => (
              <div key={col.id} className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] text-white/40 w-12 shrink-0">Col {i + 1}</span>
                <input type="number" min={5} max={95} step={1}
                  value={Math.round(col.layout?.width?.value ?? Math.round(100 / cols.length))}
                  onChange={e => updateColWidth(i, +e.target.value)}
                  className="w-14 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-orange-500/40" />
                <span className="text-[11px] text-white/30">%</span>
                {cols.length > 1 && (
                  <button onClick={() => removeColumn(i)} title="Remove this column"
                    className="ml-auto text-red-400/50 hover:text-red-400 border-none bg-transparent cursor-pointer p-0.5">
                    <Icon paths={["M4 7h16","M6 7l1 13h10l1-13","M9 7V4h6v3"]} size={13} sw={1.8} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Add column */}
        <button onClick={addColumn}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-white/[0.03] border border-dashed border-white/15 rounded-lg text-white/40 text-[11.5px] cursor-pointer hover:border-orange-500/40 hover:text-orange-400 transition-colors">
          <Icon paths={["M12 5v14","M5 12h14"]} size={13} sw={2.4} /> Add Column
        </button>
      </div>
    );
  }

  function BlockSettings() {
    if (!b) return null;
    const t = b.type;
    const hasStyle = t === "headline" || t === "body-text" || t === "countdown-timer" || t === "cta-button" || t === "hero" || t === "stats-bar" || t === "faq-accordion" || t === "testimonial" || t === "optin-form" || t === "info-card" || t === "list" || t === "icon-list" || t === "icon" || t === "icon-box" || b.props.bg_color !== undefined;
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
        {t==="hero"&&<><Field label="Eyebrow tag">{textCtl("eyebrow")}</Field><Field label="Headline">{textCtl("headline")}</Field><Field label="Sub-headline">{areaCtl("subtext")}</Field><Field label="Primary button">{textCtl("button_text")}</Field><Field label="Primary button URL">{textCtl("button_url")}</Field><Field label="Secondary button (optional)">{textCtl("button2_text")}</Field><Field label="Secondary button URL">{textCtl("button2_url")}</Field><Field label="Anchor ID (for #link targets)">{textCtl("anchor_id")}</Field></>}
        {t==="countdown-timer"&&<><Field label="Label">{textCtl("label")}</Field><Field label="Evergreen (per-visitor timer)">{toggleCtl("evergreen")}</Field>{evergreen?<Field label="Duration (minutes)">{numCtl("duration_minutes")}</Field>:<Field label="Target date & time"><input type="datetime-local" value={(b.props.target_date as string)??""} onChange={e=>onSetProps(b.id,{target_date:e.target.value})} className={IS} /></Field>}</>}
        {t==="video"&&<>
          <Field label="Video"><VideoUploadField value={b.props.url as string} onChange={url=>onSetProps(b.id,{url})} funnelId={funnelId} /></Field>
          <Field label="Or paste a video / YouTube URL">{textCtl("url")}</Field>
          <Field label="Poster image URL (thumbnail before play)"><input value={(b.props.poster as string)||""} onChange={e=>onSetProps(b.id,{poster:e.target.value})} placeholder="https://... (leave blank for none)" className={IS} /></Field>
          <Field label="Caption">{textCtl("caption")}</Field>
          <Field label="Size">
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
              {(["s","m","l","xl"] as const).map(v => (
                <button key={v} onClick={() => onSetProps(b.id, { size: v })}
                  className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11.5px] font-semibold transition-colors ${
                    ((b.props.size as string)||"m") === v ? "bg-orange-500 text-white" : "bg-transparent text-white/35 hover:text-white/60"
                  }`}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-white/25 mt-1.5">S=480px · M=680px · L=860px · XL=full width</p>
          </Field>
          <Field label="Autoplay on page load">{toggleCtl("autoplay")}</Field>
          <p className="text-[10.5px] text-white/25 -mt-2">Plays muted as soon as the visitor lands on the page (browsers block unmuted autoplay) — they can unmute from the player controls.</p>
        </>}
        {t==="optin-form"&&<>
          <SL text="Section header" />
          <Field label="Section label (eyebrow)">{textCtl("section_label")}</Field>
          <Field label="Section heading">{textCtl("section_heading")}</Field>
          <Field label="Section subtext">{textCtl("section_subtext")}</Field>
          <SL text="Form card" />
          <Field label="Form heading">{textCtl("heading")}</Field>
          <Field label="Form subtext">{textCtl("subtext")}</Field>
          <Field label="Confirmation note">{textCtl("confirmation_note")}</Field>
          <SL text="Bank transfer" />
          <Field label="OPay account number">{textCtl("opay_account")}</Field>
          <Field label="Account name">{textCtl("opay_name")}</Field>
          <Field label="Amount (₦)">{textCtl("amount_ngn")}</Field>
          <SL text="WhatsApp" />
          <Field label="WhatsApp DM number (intl format, no +)">{textCtl("wa_number")}</Field>
          <Field label="WhatsApp group link (for success screen)">{textCtl("wa_group_link")}</Field>
          <SL text="Success screen" />
          <Field label="Success headline">{textCtl("success_headline")}</Field>
          <Field label="Success message">{areaCtl("success_message")}</Field>
          <Field label="Button text">{textCtl("success_button_text")}</Field>
          <Field label="Button icon (emoji)">{textCtl("success_button_icon")}</Field>
          <Field label="Group link label">{textCtl("success_group_label")}</Field>
          <Field label="Group link secondary text">{textCtl("success_group_text")}</Field>
          <SL text="Options" />
          <Field label="Show Paystack option">{toggleCtl("show_paystack")}</Field>
        </>}
        {t==="testimonial"&&<><Field label="Quote">{areaCtl("quote")}</Field><Field label="Author">{textCtl("name")}</Field><Field label="Role (shown when no result set)">{textCtl("role")}</Field><Field label="Result badge (e.g. '₦580k in first week')">{textCtl("result")}</Field><Field label="Initials (shown when no avatar)">{textCtl("initials")}</Field><Field label="Video review (optional)"><VideoUploadField value={b.props.video_url as string} onChange={url=>onSetProps(b.id,{video_url:url})} funnelId={funnelId} /></Field></>}
        {(t==="headline"||t==="body-text")&&<Field label="Text">{areaCtl("text")}</Field>}
        {t==="cta-button"&&<><Field label="Button label">{textCtl("text")}</Field><Field label="Button URL">{textCtl("url")}</Field></>}
        {t==="pricing-card"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Price">{textCtl("price")}</Field><Field label="Period">{textCtl("period")}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Button URL">{textCtl("button_url")}</Field><Field label="Features">{itemsCtl("pricing")}</Field></>}
        {t==="stats-bar"&&<>
          <Field label="Stats">{itemsCtl("stats")}</Field>
          <p className="text-[10.5px] text-white/25 leading-relaxed -mt-1">Click the icon button on each item to pick an icon. Toggle "Show icons" in Style to make them visible.</p>
        </>}
        {t==="faq-accordion"&&<><Field label="Questions">{itemsCtl("faq")}</Field><Field label="Show numbered badges">{toggleCtl("show_number")}</Field></>}
        {t==="list"&&<Field label="Items">{itemsCtl("list")}</Field>}
        {t==="icon-list"&&<Field label="Items">{itemsCtl("list")}</Field>}
        {t==="spacer"&&<Field label="Height">{numCtl("height")}</Field>}
        {t==="image"&&<><Field label="Image"><ImageUploadField value={b.props.src as string} onChange={url=>onSetProps(b.id,{src:url})} funnelId={funnelId} /></Field><Field label="Alt text">{textCtl("alt")}</Field>{imageSizeCtl()}<Field label="Corner radius">{numCtl("radius",{min:0,max:80,default:0})}</Field></>}
        {t==="icon-box"&&<>
          <Field label="Title">{textCtl("title")}</Field>
          <Field label="Body">{areaCtl("body")}</Field>
          <Field label="Link text (optional)">{textCtl("link_text")}</Field>
          <Field label="Link URL">{textCtl("link_url")}</Field>
        </>}
        {t==="custom-html"&&<Field label="HTML"><textarea value={(b.props.html as string)??""} onChange={e=>onSetProps(b.id,{html:e.target.value})} rows={6} className={IS} style={{resize:"vertical",fontFamily:"monospace"}} /></Field>}
        {t==="info-card"&&<>
          <Field label="Title">{textCtl("title")}</Field>
          <Field label="Body">{areaCtl("body")}</Field>
          <Field label="Link text (optional)">{textCtl("link_text")}</Field>
          <Field label="Link URL">{textCtl("link_url")}</Field>
        </>}
        {noContent && <p className="text-xs text-white/40 leading-relaxed mb-2">This block has no text content. Use the Layout tab to adjust spacing and style.</p>}
        {hasStyle && (
          <>
            <div className="h-4" />
            {/* Device badge for responsive style editing */}
            {device !== "desktop" && (() => {
              const dl = device === "mobile" ? "📱 Mobile" : "💻 Tablet";
              const dc = device === "mobile" ? "#3b82f6" : "#8b5cf6";
              return (
                <div style={{ background: `${dc}18`, border: `1px solid ${dc}44`, borderRadius: 8, padding: "7px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: dc }}>{dl}</span>
                  <span style={{ fontSize: 10, color: `${dc}99`, flex: 1 }}>Style overrides for {device} — ↩ means desktop fallback</span>
                </div>
              );
            })()}
            <SL text="Style" />
            {t==="headline"&&<><Field label="Size">{headlineSizeCtl()}</Field>{fontCtl("font_family", null)}</>}
            {(t==="headline"||t==="body-text")&&<><Field label="Alignment">{alignCtl()}</Field><Field label="Text color">{colorCtl("color")}</Field></>}
            {t==="body-text"&&fontCtl()}
            {t==="list"&&<>
              <Field label="Icon">{iconTypeCtl("icon_type")}</Field>
              <Field label="Icon color">{colorCtl("icon_color")}</Field>
              <Field label="Icon size">{numCtl("icon_size",{min:10,max:48,default:15})}</Field>
              <Field label="Text color">{colorCtl("text_color")}</Field>
              {fontCtl("font_family","text_size")}
            </>}
            {t==="icon-list"&&<>
              <Field label="Default icon (per-item overrides above)">{iconTypeCtl("icon_type")}</Field>
              <Field label="Icon color">{colorCtl("icon_color")}</Field>
              <Field label="Icon size">{numCtl("icon_size",{min:10,max:48,default:16})}</Field>
              <Field label="Text color">{colorCtl("text_color")}</Field>
              {fontCtl("font_family","text_size")}
            </>}
            {t==="cta-button"&&<><Field label="Size">{ctaSizeCtl()}</Field><Field label="Full width">{fullWidthCtl()}</Field><Field label="Text color">{colorCtl("text_color")}</Field></>}
            {t==="cta-button"&&fontCtl("font_family", null)}
            {(t==="countdown-timer"||t==="cta-button"||t==="pricing-card"||t==="hero"||t==="faq-accordion"||t==="optin-form")&&<Field label="Accent color">{colorCtl("accent_color")}</Field>}
            {t==="optin-form"&&fontCtl("font_family", null)}
            {t==="hero"&&<><Field label="Headline color">{colorCtl("color")}</Field><Field label="Subtext color">{colorCtl("subtext_color")}</Field></>}
            {t==="stats-bar"&&<>
              <Field label="Accent color (overrides value color)">{colorCtl("accent_color")}</Field>
              <Field label="Value color">{colorCtl("value_color")}</Field>
              <Field label="Label color">{colorCtl("label_color")}</Field>
              <Field label="Value font size">{numCtl("value_size",{min:16,max:96,default:34})}</Field>
              <Field label="Label font size">{numCtl("label_size",{min:9,max:28,default:12})}</Field>
              {fontCtl("font_family", null)}
              <Field label="Uppercase labels">{toggleCtl("label_uppercase")}</Field>
              <Field label="Show icons">{toggleCtl("show_icons")}</Field>
              <Field label="Dividers between stats">{toggleCtl("dividers")}</Field>
              <Field label="Counter animation on scroll">{toggleCtl("animate")}</Field>
            </>}
            {t==="faq-accordion"&&<><Field label="Item background">{colorCtl("item_bg")}</Field><Field label="Item border">{colorCtl("item_border")}</Field><Field label="Question color">{colorCtl("q_color")}</Field><Field label="Answer color">{colorCtl("a_color")}</Field></>}
            {t==="testimonial"&&<><Field label="Card background">{colorCtl("card_bg")}</Field><Field label="Card border">{colorCtl("card_border")}</Field><Field label="Quote color">{colorCtl("quote_color")}</Field><Field label="Name color">{colorCtl("name_color")}</Field><Field label="Result/role color">{colorCtl("role_color")}</Field></>}
            {t==="info-card"&&<>
              <Field label="Icon">{iconTypeCtl()}</Field>
              <Field label="Show icon">{toggleCtl("show_icon")}</Field>
              <Field label="Alignment">{alignCtl()}</Field>
              <Field label="Icon color">{colorCtl("icon_color")}</Field>
              <Field label="Title color">{colorCtl("title_color")}</Field>
              <Field label="Body color">{colorCtl("body_color")}</Field>
              <Field label="Card background">{colorCtl("card_bg")}</Field>
              <Field label="Card border">{colorCtl("card_border")}</Field>
              <Field label="Corner radius">{numCtl("radius",{min:0,max:40,default:12})}</Field>
            </>}
            {t==="icon"&&<>
              <Field label="Icon">{iconTypeCtl()}</Field>
              <Field label="Icon color">{colorCtl("icon_color")}</Field>
              <Field label="Icon size">{numCtl("icon_size",{min:16,max:120,default:48})}</Field>
              <Field label="Background color">{colorCtl("icon_bg")}</Field>
              <Field label="Background shape">
                <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
                  {(["circle","square","none"] as const).map(s => (
                    <button key={s} onClick={() => onSetProps(b.id, { icon_bg_shape: s })}
                      className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11px] font-semibold capitalize transition-colors ${((b.props.icon_bg_shape as string)||"circle")===s?"bg-orange-500 text-white":"bg-transparent text-white/35 hover:text-white/60"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Alignment">{alignCtl()}</Field>
            </>}
            {t==="icon-box"&&<>
              <Field label="Icon">{iconTypeCtl()}</Field>
              <Field label="Icon color">{colorCtl("icon_color")}</Field>
              <Field label="Icon size">{numCtl("icon_size",{min:16,max:80,default:32})}</Field>
              <Field label="Icon position">
                <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
                  {(["top","left","right"] as const).map(pos => (
                    <button key={pos} onClick={() => onSetProps(b.id, { icon_position: pos })}
                      className={`flex-1 py-1.5 border-none rounded-md cursor-pointer text-[11px] font-semibold capitalize transition-colors ${((b.props.icon_position as string)||"top")===pos?"bg-orange-500 text-white":"bg-transparent text-white/35 hover:text-white/60"}`}>
                      {pos}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Title color">{colorCtl("title_color")}</Field>
              <Field label="Title size">{numCtl("title_size",{min:12,max:56,default:18})}</Field>
              <Field label="Body color">{colorCtl("body_color")}</Field>
              <Field label="Body size">{numCtl("body_size",{min:10,max:32,default:15})}</Field>
            </>}
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
    const deviceLabel = device === "mobile" ? "📱 Mobile" : device === "tablet" ? "💻 Tablet" : null;
    const deviceColor = device === "mobile" ? "#3b82f6" : "#8b5cf6";
    const hiddenKey = device === "mobile" ? "hidden_mobile" : device === "tablet" ? "hidden_tablet" : "hidden_desktop";
    const isHidden = !!(b.layout as Record<string,unknown> | undefined)?.[hiddenKey];

    // Alignment options
    const alignH = b.layout?.align_h;
    const alignV = b.layout?.align_v;
    const hOpts: { v: typeof alignH; icon: string; title: string }[] = [
      { v: "left",   icon: "⬅", title: "Left" },
      { v: "center", icon: "↔", title: "Center" },
      { v: "right",  icon: "➡", title: "Right" },
    ];
    const vOpts: { v: typeof alignV; icon: string; title: string }[] = [
      { v: "top",    icon: "⬆", title: "Top" },
      { v: "center", icon: "↕", title: "Middle" },
      { v: "bottom", icon: "⬇", title: "Bottom" },
    ];

    return (
      <div>
        {/* Device indicator */}
        {deviceLabel && (
          <div style={{ background: `${deviceColor}18`, border: `1px solid ${deviceColor}44`, borderRadius: 8, padding: "7px 10px", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: deviceColor }}>{deviceLabel}</span>
            <span style={{ fontSize: 10, color: `${deviceColor}99`, flex: 1 }}>Edits below apply only to {device}</span>
            <button
              onClick={() => onSetLayout(b.id, { [hiddenKey]: !isHidden })}
              title={isHidden ? `Show on ${device}` : `Hide on ${device}`}
              style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: `1px solid ${deviceColor}55`, background: isHidden ? deviceColor : "transparent", color: isHidden ? "#fff" : deviceColor, cursor: "pointer" }}>
              {isHidden ? "Hidden" : "Hide"}
            </button>
          </div>
        )}
        {/* Visibility for desktop mode */}
        {device === "desktop" && (
          <>
            <SL text="Visibility" />
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {(["hidden_mobile","hidden_tablet","hidden_desktop"] as const).map(k => {
                const on = !!(b.layout as Record<string,unknown> | undefined)?.[k];
                const label = k === "hidden_mobile" ? "📱 Mobile" : k === "hidden_tablet" ? "💻 Tablet" : "🖥 Desktop";
                return (
                  <button key={k} onClick={() => onSetLayout(b.id, { [k]: !on })}
                    style={{ flex: 1, fontSize: 9.5, padding: "4px 4px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)", background: on ? "#ef4444" : "rgba(255,255,255,0.04)", color: on ? "#fff" : "#6b7280", cursor: "pointer" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {/* Alignment */}
        <SL text="Alignment" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: "#6b7280", minWidth: 14 }}>H</span>
          <div style={{ display: "flex", gap: 4 }}>
            {hOpts.map(o => (
              <button key={o.v} title={o.title} onClick={() => onSetLayout(b.id, { align_h: alignH === o.v ? undefined : o.v })}
                style={{ width: 28, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: alignH === o.v ? "#f97316" : "rgba(255,255,255,0.04)", color: alignH === o.v ? "#fff" : "#9aa3b0", fontSize: 12, cursor: "pointer" }}>
                {o.icon}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 10, color: "#6b7280", minWidth: 14, marginLeft: 6 }}>V</span>
          <div style={{ display: "flex", gap: 4 }}>
            {vOpts.map(o => (
              <button key={o.v} title={o.title} onClick={() => onSetLayout(b.id, { align_v: alignV === o.v ? undefined : o.v })}
                style={{ width: 28, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: alignV === o.v ? "#f97316" : "rgba(255,255,255,0.04)", color: alignV === o.v ? "#fff" : "#9aa3b0", fontSize: 12, cursor: "pointer" }}>
                {o.icon}
              </button>
            ))}
          </div>
        </div>
        <SL text="Padding" />
        {paddingCtl()}
        <div className="h-3" />
        <SL text="Margin" />
        {marginCtl()}
        {t === "row" && (
          <>
            <div className="h-4" />
            <SL text="Column gap" />
            {layoutRangeRow("Gap between columns", b.layout?.column_gap ?? 16, v => onSetLayout(b.id, { column_gap: v }), 0, 80, v => `${v}px`)}
          </>
        )}
        {t === "column" && (
          <>
            <div className="h-4" />
            <SL text="Responsive width" />
            <p className="text-[10.5px] text-white/30 mb-3 leading-relaxed">
              Override this column&apos;s width per device. Desktop width is set in the parent Row. Mobile defaults to full-width (stacked).
            </p>
            <Field label="Tablet width (%)">
              <input type="number" min={10} max={100} step={1}
                value={b.layout?.width_tablet?.value ?? ""}
                placeholder={`${Math.round(b.layout?.width?.value ?? 100)} (desktop)`}
                onChange={e => onSetLayout(b.id, { width_tablet: e.target.value ? { value: +e.target.value, unit: "%" } : undefined })}
                className={IS} />
            </Field>
            <Field label="Mobile width (%)">
              <input type="number" min={10} max={100} step={1}
                value={b.layout?.width_mobile?.value ?? ""}
                placeholder="100 (stacked by default)"
                onChange={e => onSetLayout(b.id, { width_mobile: e.target.value ? { value: +e.target.value, unit: "%" } : undefined })}
                className={IS} />
            </Field>
            <p className="text-[10.5px] text-white/25 mt-1 leading-relaxed">
              When no mobile override is set, all columns stack (100% wide) below 640px.
            </p>
          </>
        )}
        {isRow && (
          <>
            <div className="h-4" />
            <SL text="Width" />
            <Field label="Width">{layoutToggleCtl("boxed")}</Field>
          </>
        )}
        {isContainer && (
          <>
            <div className="h-4" />
            <SL text="Background" />
            <Field label="Background image">
              <ImageUploadField value={b.layout?.bg_image} onChange={url => onSetLayout(b.id, { bg_image: url || undefined })} funnelId={funnelId} />
            </Field>
            {!b.layout?.bg_image && (
              <>
                <Field label="Background gradient">
                  {gradientCtl()}
                </Field>
                <Field label="Background pattern">
                  {patternCtl()}
                </Field>
              </>
            )}
            {(b.layout?.bg_image || b.layout?.bg_gradient || b.layout?.bg_pattern) && (
              <>
                <div className="h-3" />
                <SL text="Color overlay" />
                {bgOverlayCtl()}
              </>
            )}
            <div className="h-1.5" />
            <SL text="Border" />
            {borderCtl()}
          </>
        )}
        {!isContainer && (
          <>
            <div className="h-4" />
            <SL text="Border & Radius" />
            {borderCtl()}
          </>
        )}
        <div className="h-4" />
        <SL text="Visibility" />
        <Field label="Reveal after video reaches…">{revealCtl()}</Field>
        <div className="h-4" />
        <SL text="Anchor" />
        <Field label="Anchor ID">
          <input
            value={(b.layout?.anchor_id) ?? ""}
            placeholder="e.g. join-form"
            onChange={e => onSetLayout(b.id, { anchor_id: e.target.value || undefined })}
            className={IS}
          />
        </Field>
        <p className="text-[10.5px] text-white/25 mt-1 leading-relaxed">
          Link buttons or text to this block using <span className="font-mono">#anchor-id</span> as the URL.
        </p>
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
        <button onClick={onSave}
          className="w-full py-2.5 bg-orange-500/[0.1] border border-orange-500/30 rounded-lg text-orange-400 text-[13px] font-semibold cursor-pointer hover:bg-orange-500/[0.16] transition-colors">
          Save page settings
        </button>
        <div className="h-6" />
        <SL text="Funnel Tracking" />
        <p className="text-[11px] text-white/30 mb-3 leading-relaxed">Pixel scripts fire on every page in this funnel. Saved per-funnel, not per-page.</p>
        {([
          { key: "meta_pixel_id",              label: "Meta Pixel ID",                ph: "e.g. 1234567890" },
          { key: "ga4_measurement_id",         label: "GA4 Measurement ID",           ph: "e.g. G-XXXXXXXXXX" },
          { key: "google_ads_conversion_id",   label: "Google Ads Conversion ID",     ph: "e.g. AW-XXXXXXXXXX" },
          { key: "google_ads_conversion_label",label: "Google Ads Conv. Label",       ph: "e.g. abc123XYZ" },
          { key: "gtm_container_id",           label: "GTM Container ID",             ph: "e.g. GTM-XXXXXXX" },
          { key: "tiktok_pixel_id",            label: "TikTok Pixel ID",             ph: "e.g. C3XXXXXXXXXX" },
        ] as Array<{ key: string; label: string; ph: string }>).map(({ key, label, ph }) => (
          <Field key={key} label={label}>
            <input
              value={(funnelTracking[key] as string) ?? ""}
              placeholder={ph}
              onChange={e => onSaveFunnelTracking({ ...funnelTracking, [key]: e.target.value })}
              className={IS}
            />
          </Field>
        ))}
        <div className="h-3" />
        <button onClick={() => onSaveFunnelTracking(funnelTracking)}
          className="w-full py-2.5 bg-white/[0.05] border border-white/10 rounded-lg text-white/60 text-[13px] font-semibold cursor-pointer hover:bg-white/[0.08] transition-colors">
          Save tracking settings
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
