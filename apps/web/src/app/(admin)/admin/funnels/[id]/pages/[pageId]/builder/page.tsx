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
  { label: "1",     widths: [100] },
  { label: "50/50", widths: [50, 50] },
  { label: "33/33/33", widths: [33.33, 33.33, 33.34] },
  { label: "30/70", widths: [30, 70] },
  { label: "70/30", widths: [70, 30] },
];

// ── Main Builder ───────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const params    = useParams();
  const router    = useRouter();
  const funnelId  = params.id     as string;
  const pageId    = params.pageId as string;

  // Remote data
  const [page,       setPage]       = useState<PageData|null>(null);
  const [funnelName, setFunnelName] = useState("");
  const [funnelSlug, setFunnelSlug] = useState("");
  const [loading,    setLoading]    = useState(true);

  // Editor history state (blocks + undo/redo stacks)
  const [hist, dispatch] = useReducer(histReducer, { blocks:[], past:[], future:[] });
  const { blocks } = hist;

  // UI state
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

  const toastTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const previewSessionId = useRef(`preview_${genId()}`);

  // ── Load data ──────────────────────────────────────────────────────────────
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
    const flat: string[] = [];
    let parentOf: string | null = null;
    let foundParent: string | null = null;
    walkBlocks(blocks, (b, _d, pid) => { if (b.id === id) foundParent = pid; });
    parentOf = foundParent;
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

  // setProps = live update (no history push, for right-panel typing)
  function setProps(id: string, patch: Record<string, unknown>) {
    setLive(updateBlockProps(blocks, id, patch));
  }

  function setLayout(id: string, patch: Record<string, unknown>) {
    setLive(updateBlockLayout(blocks, id, patch));
  }

  // commitProp = push to history (for inline edit onBlur)
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

  // ── Page settings helpers ─────────────────────────────────────────────────
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

  // ── dnd-kit drag handlers ─────────────────────────────────────────────────
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

  // ── Device widths ─────────────────────────────────────────────────────────
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
      <div style={{minHeight:"100vh",background:"#0a0e16",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"rgba(255,255,255,0.2)",fontSize:14}}>Loading builder…</span>
      </div>
    );
  }
  if (!page) {
    return (
      <div style={{minHeight:"100vh",background:"#0a0e16",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"rgba(255,255,255,0.2)",fontSize:14}}>Page not found</span>
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
    <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100%",background:"#0a0e16",overflow:"hidden",fontFamily:"'Geist','Segoe UI',system-ui,sans-serif",color:"#e2e8f0"}}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{height:53,flex:"0 0 auto",display:"flex",alignItems:"center",gap:12,padding:"0 12px",background:"#0b1019",borderBottom:"1px solid rgba(255,255,255,0.06)",zIndex:40,position:"relative"}}>

        {/* Left cluster */}
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:"0 0 auto"}}>
          <button onClick={()=>router.push(`/admin/funnels/${funnelId}`)}
            style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"rgba(255,255,255,0.05)",color:"#aeb6c2",borderRadius:8,cursor:"pointer"}}>
            <Icon paths={["M15 18l-6-6 6-6"]} size={17} sw={1.9} />
          </button>
          <div style={{width:1,height:24,background:"rgba(255,255,255,0.08)"}} />
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.15,minWidth:0}}>
            <span style={{fontSize:10.5,color:"#5b6678",letterSpacing:".02em",whiteSpace:"nowrap"}}>{funnelName||"Funnel"}</span>
            <span style={{fontSize:13.5,fontWeight:600,color:"#eaeff6",whiteSpace:"nowrap"}}>{page.name}</span>
          </div>
          {/* Status pill */}
          <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10.5,fontWeight:600,padding:"3px 9px",borderRadius:999,letterSpacing:".03em",textTransform:"uppercase",background:isDraft?"rgba(245,158,11,.14)":"rgba(34,197,94,.14)",color:isDraft?"#fbbf24":"#4ade80",border:`1px solid ${isDraft?"rgba(245,158,11,.3)":"rgba(34,197,94,.3)"}`}}>
            <span style={{width:6,height:6,borderRadius:999,background:"currentColor"}} />
            {page.status}
          </span>
        </div>

        {/* Center cluster */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:10,minWidth:0}}>
          {/* Device segmented */}
          <div style={{display:"flex",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:3,gap:2}}>
            {([["desktop",["M3 4h18v12H3z","M8 20h8","M12 16v4"]],["tablet",["M5 3h14v18H5z","M11 18h2"]],["mobile",["M7 3h10v18H7z","M11 18h2"]]] as const).map(([d,paths])=>(
              <button key={d} onClick={()=>setDevice(d as Device)} title={d}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"5px 9px",border:"none",borderRadius:6,background:device===d?"rgba(255,255,255,0.1)":"transparent",color:device===d?"#eaeff6":"#6b7280",cursor:"pointer"}}>
                <Icon paths={paths as unknown as string[]} size={16} />
              </button>
            ))}
          </div>
          {/* Zoom */}
          <div style={{display:"flex",alignItems:"center",gap:2,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:3}}>
            <button onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))} title="Zoom out"
              style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",color:"#9aa4b2",borderRadius:6,cursor:"pointer"}}>
              <Icon paths={["M5 12h14"]} size={15} sw={2} />
            </button>
            <button onClick={()=>setZoom(1)} title="Reset zoom"
              style={{minWidth:46,fontSize:12,fontWeight:500,color:"#cbd2dc",background:"transparent",border:"none",cursor:"pointer",fontFamily:"monospace"}}>
              {Math.round(zoom*100)}%
            </button>
            <button onClick={()=>setZoom(z=>Math.min(1.5,Math.round((z+.1)*10)/10))} title="Zoom in"
              style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",color:"#9aa4b2",borderRadius:6,cursor:"pointer"}}>
              <Icon paths={["M12 5v14","M5 12h14"]} size={15} sw={2} />
            </button>
          </div>
        </div>

        {/* Right cluster */}
        <div style={{display:"flex",alignItems:"center",gap:8,flex:"0 0 auto"}}>
          {/* Undo/redo */}
          <div style={{display:"flex",gap:4}}>
            {([[[canUndo,"undo"],["M9 14L4 9l5-5","M4 9h10a6 6 0 0 1 0 12h-3"]],[[canRedo,"redo"],["M15 14l5-5-5-5","M20 9H10a6 6 0 0 0 0 12h3"]]] as [[boolean,string],string[]][]).map(([[enabled,action],paths])=>(
              <button key={action} onClick={()=>dispatch({type:action as "undo"|"redo"})} disabled={!enabled} title={action}
                style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"rgba(255,255,255,0.05)",color:enabled?"#cbd2dc":"#3a4252",borderRadius:8,cursor:enabled?"pointer":"default"}}>
                <Icon paths={paths} size={16} sw={2} />
              </button>
            ))}
          </div>
          {/* A/B toggle */}
          <button onClick={()=>setAb(x=>!x)} title="A/B test"
            style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 12px",border:`1px solid ${ab?AC+"88":"rgba(255,255,255,0.08)"}`,background:ab?AC+"1f":"rgba(255,255,255,0.04)",color:ab?"#fcd9b6":"#aeb6c2",borderRadius:9,cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit"}}>
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={15} sw={1.8} />A/B
          </button>
          {/* Preview toggle */}
          <button onClick={()=>{ setPreview(x=>!x); if(!preview) setSelectedId(null); }} title="Preview"
            style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 12px",border:`1px solid ${preview?AC+"88":"rgba(255,255,255,0.08)"}`,background:preview?AC+"1f":"rgba(255,255,255,0.04)",color:preview?"#fcd9b6":"#aeb6c2",borderRadius:9,cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit"}}>
            <Icon paths={preview?["M3 3l18 18","M10.6 10.6a2 2 0 0 0 2.8 2.8","M9.4 5.2A9 9 0 0 1 21 12a16 16 0 0 1-2.3 3.1","M6.6 6.6A16 16 0 0 0 3 12a9 9 0 0 0 12 6.7"]:["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]} size={15} />
            {preview?"Exit":"Preview"}
          </button>
          {/* Saved indicator */}
          <div style={{display:"flex",alignItems:"center",gap:5,color:"#4b9e6a",fontSize:11.5,fontWeight:500,padding:"0 4px",opacity:saveStatus==="saved"?1:0,transition:"opacity .3s"}}>
            <Icon paths={["M5 12l4 4 10-10"]} size={14} sw={2.4} /> Saved
          </div>
          {/* Publish */}
          <button onClick={publish}
            style={{display:"inline-flex",alignItems:"center",gap:7,background:"linear-gradient(180deg,#fb923c,#f97316)",color:"#fff",fontWeight:600,fontSize:13,padding:"8px 16px",border:"none",borderRadius:9,cursor:"pointer",boxShadow:"0 6px 16px -6px rgba(249,115,22,.6),inset 0 1px 0 rgba(255,255,255,.25)"}}>
            <Icon paths={["M12 19V5","M5 12l7-7 7 7"]} size={15} sw={2} /> Publish
          </button>
        </div>
      </header>

      {/* ── A/B strip ────────────────────────────────────────────────────── */}
      {ab && (
        <div style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:14,padding:"9px 16px",background:"#0e1320",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12,fontWeight:600,color:"#fcd9b6"}}>
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={14} sw={1.8} /> A/B Test
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",background:`${AC}22`,border:`1px solid ${AC}66`,borderRadius:8}}>
              <span style={{fontSize:12,fontWeight:600,color:"#eaeff6"}}>Variant A</span>
              <span style={{fontSize:11,color:"#fcd9b6",fontFamily:"monospace"}}>50%</span>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8}}>
              <span style={{fontSize:12,fontWeight:600,color:"#9aa4b2"}}>Variant B</span>
              <span style={{fontSize:11,color:"#7c8aa0",fontFamily:"monospace"}}>50%</span>
            </div>
            <button onClick={()=>showToast("New variant created")}
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"6px 11px",background:"transparent",border:"1px dashed rgba(255,255,255,0.18)",borderRadius:8,color:"#9aa4b2",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              <Icon paths={["M12 5v14","M5 12h14"]} size={13} sw={2.2} /> Add variant
            </button>
          </div>
          <div style={{flex:1}} />
          <span style={{fontSize:11.5,color:"#7c8aa0"}}>Split traffic evenly · 0 visitors so far</span>
          <button onClick={()=>showToast("Winner declared")}
            style={{padding:"6px 13px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,color:"#cbd2dc",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>
            Declare winner
          </button>
        </div>
      )}

      {/* ── Three-panel body ─────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",minHeight:0,position:"relative"}}>

        {/* LEFT PANEL */}
        {!preview && (
          <aside style={{width:270,flex:"0 0 270px",background:"#0b101a",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",minHeight:0}}>
            {/* Tabs */}
            <div style={{display:"flex",padding:"0 8px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              {(["blocks","layers"] as const).map(tab=>(
                <button key={tab} onClick={()=>setLeftTab(tab)}
                  style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",background:"transparent",border:"none",borderBottom:`2px solid ${leftTab===tab?AC:"transparent"}`,color:leftTab===tab?"#eaeff6":"#6b7280",fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
                  {tab}
                </button>
              ))}
            </div>

            {leftTab==="blocks" ? (
              <div style={{flex:1,overflow:"auto",padding:12}}>
                {/* Search */}
                <div style={{position:"relative",marginBottom:14}}>
                  <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#5b6678",pointerEvents:"none"}}>
                    <Icon paths={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M20 20l-3.5-3.5"]} size={15} />
                  </span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search blocks"
                    style={{width:"100%",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"9px 10px 9px 34px",color:"#e7ecf3",fontSize:13,fontFamily:"inherit",outline:"none"}} />
                </div>
                {LIB_GROUPS.map(g=>{
                  const q=search.trim().toLowerCase();
                  const items=g.types.filter(t=>!q||LABELS[t].toLowerCase().includes(q));
                  if(!items.length) return null;
                  return (
                    <div key={g.group} style={{marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",marginBottom:9,paddingLeft:2}}>{g.group}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {items.map(type=>(
                          <PaletteSwatch key={type} type={type} onClick={()=>addBlock(type)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{flex:1,overflow:"auto",padding:10}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",margin:"4px 4px 10px"}}>Page structure</div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {layersFlat.map(({block:b,depth})=>{
                    const sel=selectedId===b.id;
                    return (
                      <div key={b.id} onClick={()=>setSelectedId(b.id)}
                        style={{display:"flex",alignItems:"center",gap:9,padding:"8px 9px",paddingLeft:9+depth*16,borderRadius:8,cursor:"pointer",background:sel?`${AC}1f`:"transparent",border:`1px solid ${sel?`${AC}66`:"transparent"}`}}
                        onMouseEnter={e=>{if(!sel)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)";}}
                        onMouseLeave={e=>{if(!sel)(e.currentTarget as HTMLElement).style.background="transparent";}}>
                        <span style={{color:sel?AC:"#6b7280",flexShrink:0}}><BlockIcon type={b.type} size={15} /></span>
                        <span style={{flex:1,fontSize:12.5,color:sel?"#eaeff6":"#9aa4b2",fontWeight:sel?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{LABELS[b.type]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* CANVAS */}
        <div
          onClick={()=>setSelectedId(null)}
          style={{flex:"1 1 auto",minWidth:0,overflow:"auto",background:"radial-gradient(120% 80% at 50% 0,#11192b 0%,#0a0e16 55%)",position:"relative"}}
        >
          <div style={{minHeight:"100%",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:preview?"0":"34px 34px 140px"}}>
            <div style={{width:preview?"100%":deviceW,transform:`scale(${zoom})`,transformOrigin:"top center",transition:"width .28s ease"}}>
              <div
                onClick={e=>e.stopPropagation()}
                style={{background:"#0c0c0f",borderRadius:preview?0:device==="mobile"?30:device==="tablet"?20:14,overflow:"hidden",boxShadow:preview?"none":"0 40px 90px -28px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,0.07)",minHeight:400}}
              >
                <BlockTree blocks={blocks} ctx={blockCtx} />
              </div>
            </div>
          </div>

          {/* Preview exit button */}
          {preview && (
            <button onClick={()=>setPreview(false)}
              style={{position:"absolute",top:14,right:14,zIndex:50,display:"inline-flex",alignItems:"center",gap:7,padding:"9px 15px",background:"#161c28",border:"1px solid rgba(255,255,255,0.14)",color:"#eaeff6",borderRadius:10,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 10px 30px -8px rgba(0,0,0,.6)"}}>
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={15} /> Exit preview
            </button>
          )}
        </div>

        {/* RIGHT PANEL */}
        {!preview && (
          <aside style={{width:304,flex:"0 0 304px",background:"#0b101a",borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",minHeight:0}}>
            <RightPanel
              selectedBlock={selectedBlock}
              page={page}
              onDeselect={()=>setSelectedId(null)}
              onSetProps={setProps}
              onSetLayout={setLayout}
              onSetPage={setPageField}
              onCommitItem={commitItem}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onColumnPreset={applyColumnPreset}
              onSave={()=>save()}
              funnelId={funnelId}
              videoBlocks={videoBlocks}
            />
          </aside>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a2230",border:"1px solid rgba(255,255,255,0.12)",color:"#eaeff6",fontSize:13,fontWeight:500,padding:"10px 18px",borderRadius:10,boxShadow:"0 16px 40px -10px rgba(0,0,0,.6)",zIndex:60,display:"flex",alignItems:"center",gap:9,whiteSpace:"nowrap"}}>
          <span style={{color:AC}}><Icon paths={["M5 12l4 4 10-10"]} size={15} sw={2.4} /></span>
          {toast}
        </div>
      )}
    </div>
    <DragOverlay>
      {activeDrag && (
        <div style={{padding:"8px 14px",background:"#161c28",border:`1px solid ${AC}88`,borderRadius:8,color:"#eaeff6",fontSize:12.5,fontWeight:600,boxShadow:"0 10px 30px -8px rgba(0,0,0,.7)"}}>
          {activeDrag.label}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

// ── Palette swatch (dnd-kit draggable) ────────────────────────────────────────

function PaletteSwatch({ type, onClick }: { type: BlockType; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "new", type },
  });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      title="Click to add or drag to position"
      style={{
        display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"13px 6px",
        background: hover ? `${AC}14` : "rgba(255,255,255,0.025)",
        border:`1px solid ${hover ? `${AC}99` : "rgba(255,255,255,0.06)"}`,
        borderRadius:10,cursor:"grab",transition:"all .12s",opacity:isDragging?0.4:1,
      }}>
      <div style={{color:"#aeb6c2"}}><BlockIcon type={type} size={19} /></div>
      <span style={{fontSize:11,color:"#9aa4b2",fontWeight:500,textAlign:"center",lineHeight:1.2}}>{LABELS[type]}</span>
    </div>
  );
}

// ── Image upload field (Supabase Storage) ──────────────────────────────────────

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

  const smallBtn: React.CSSProperties = { padding:"4px 9px",background:"rgba(10,14,22,0.85)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:6,color:"#eaeff6",fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit" };

  return (
    <div>
      {value ? (
        <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"1px solid rgba(255,255,255,0.09)" }}>
          <img src={value} alt="" style={{ width:"100%", height:110, objectFit:"cover", display:"block" }} />
          <div style={{ position:"absolute", top:6, right:6, display:"flex", gap:6 }}>
            <button onClick={()=>inputRef.current?.click()} style={smallBtn} disabled={uploading}>{uploading?"…":"Replace"}</button>
            <button onClick={()=>onChange("")} style={smallBtn}>Remove</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>inputRef.current?.click()} disabled={uploading}
          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"22px 10px", background:"rgba(255,255,255,0.025)", border:"1px dashed rgba(255,255,255,0.18)", borderRadius:8, color:"#9aa4b2", fontSize:12.5, cursor:uploading?"default":"pointer", fontFamily:"inherit" }}>
          {uploading ? "Uploading…" : "Click to upload image"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:"none" }}
        onChange={e=>{ const f=e.target.files?.[0]; if (f) handleFile(f); e.target.value=""; }} />
      {error && <p style={{ fontSize:11, color:"#f87171", marginTop:6 }}>{error}</p>}
    </div>
  );
}

// ── Video upload field (direct browser → Supabase Storage, bypasses our API
// route since a real video file would exceed Vercel's function body/duration
// limits if proxied like ImageUploadField above) ───────────────────────────

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

  const smallBtn: React.CSSProperties = { padding:"4px 9px",background:"rgba(10,14,22,0.85)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:6,color:"#eaeff6",fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit" };
  const isPlayable = Boolean(value) && !/youtu\.?be/.test(value!);

  return (
    <div>
      {value ? (
        <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"1px solid rgba(255,255,255,0.09)", background:"#000" }}>
          {isPlayable ? (
            <video src={value} controls style={{ width:"100%", height:110, objectFit:"cover", display:"block" }} />
          ) : (
            <div style={{ height:110, display:"flex", alignItems:"center", justifyContent:"center", color:"#5b6678", fontSize:11.5, padding:"0 14px", textAlign:"center" }}>
              External video URL set
            </div>
          )}
          <div style={{ position:"absolute", top:6, right:6, display:"flex", gap:6 }}>
            <button onClick={()=>inputRef.current?.click()} style={smallBtn} disabled={uploading}>{uploading?"…":"Replace"}</button>
            <button onClick={()=>onChange("")} style={smallBtn}>Remove</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>inputRef.current?.click()} disabled={uploading}
          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"22px 10px", background:"rgba(255,255,255,0.025)", border:"1px dashed rgba(255,255,255,0.18)", borderRadius:8, color:"#9aa4b2", fontSize:12.5, cursor:uploading?"default":"pointer", fontFamily:"inherit" }}>
          {uploading ? "Uploading…" : "Click to upload video (MP4/WebM, up to 500MB)"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/mp4,video/webm" style={{ display:"none" }}
        onChange={e=>{ const f=e.target.files?.[0]; if (f) handleFile(f); e.target.value=""; }} />
      {error && <p style={{ fontSize:11, color:"#f87171", marginTop:6 }}>{error}</p>}
    </div>
  );
}

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
  const IS: React.CSSProperties = { width:"100%",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:"8px 10px",color:"#e7ecf3",fontSize:13,fontFamily:"inherit" };

  function Field({ label, children }: { label:string; children:React.ReactNode }) {
    return (
      <div style={{marginBottom:13}}>
        <label style={{display:"block",fontSize:11,color:"#7c8aa0",fontWeight:500,marginBottom:6}}>{label}</label>
        {children}
      </div>
    );
  }
  function SL({ text }: { text:string }) {
    return <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",margin:"4px 0 12px",paddingBottom:8,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>{text}</div>;
  }

  function textCtl(key:string) {
    if(!b) return null;
    return <input value={(b.props[key] as string)??""} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} style={IS} />;
  }
  function areaCtl(key:string,rows=3) {
    if(!b) return null;
    return <textarea value={(b.props[key] as string)??""} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} rows={rows} style={{...IS,resize:"vertical" as const,lineHeight:1.5}} />;
  }
  function colorCtl(key:string) {
    if(!b) return null;
    const v=(b.props[key] as string)??"#0c0c0f";
    const safe=v==="transparent"?"#0c0c0f":v;
    return (
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative",width:34,height:34,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",flexShrink:0,background:safe}}>
          <input type="color" value={safe} onChange={e=>onSetProps(b.id,{[key]:e.target.value})}
            style={{position:"absolute",inset:-4,width:42,height:42,border:"none",padding:0,cursor:"pointer",background:"transparent"}} />
        </div>
        <input value={v} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} style={{...IS,fontFamily:"monospace",fontSize:12}} />
      </div>
    );
  }
  function alignCtl() {
    if(!b) return null;
    const cur=(b.props.align as string)??"left";
    const opts:[string,string[]][]=[["left",["M4 6h16","M4 12h10","M4 18h13"]],["center",["M4 6h16","M7 12h10","M5 18h14"]],["right",["M4 6h16","M10 12h10","M7 18h13"]]];
    return (
      <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
        {opts.map(([a,paths])=>(
          <button key={a} onClick={()=>onSetProps(b.id,{align:a})}
            style={{flex:1,display:"flex",justifyContent:"center",padding:6,border:"none",borderRadius:6,background:cur===a?AC:"transparent",color:cur===a?"#fff":"#7c8aa0",cursor:"pointer"}}>
            <Icon paths={paths} size={16} />
          </button>
        ))}
      </div>
    );
  }
  function numCtl(key:string, opts?: { min?:number; max?:number; default?:number; suffix?:string }) {
    if(!b) return null;
    const min=opts?.min??8, max=opts?.max??160, def=opts?.default??48, suffix=opts?.suffix??"px";
    const val=(b.props[key] as number)??def;
    return (
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="range" min={min} max={max} value={val} onChange={e=>onSetProps(b.id,{[key]:+e.target.value})} style={{flex:1,accentColor:AC}} />
        <span style={{fontSize:12,color:"#9aa4b2",fontFamily:"monospace",minWidth:46,textAlign:"right"}}>{val}{suffix}</span>
      </div>
    );
  }
  function ctaSizeCtl() {
    if(!b) return null;
    const opts: ["sm"|"md"|"lg",string][] = [["sm","S"],["md","M"],["lg","L"]];
    const cur=(b.props.size as string)??"md";
    return (
      <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
        {opts.map(([v,l])=>(
          <button key={v} onClick={()=>onSetProps(b.id,{size:v})}
            style={{flex:1,padding:"6px 4px",border:"none",borderRadius:6,background:cur===v?AC:"transparent",color:cur===v?"#fff":"#7c8aa0",cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function headlineSizeCtl() {
    if(!b) return null;
    const remOpts: [number,string][] = [[1.5,"S"],[1.875,"M"],[2.25,"L"],[3,"XL"]];
    const cur = b.props.size as { value:number; unit:string } | undefined;
    const curVal = cur?.value ?? 2.25;
    return (
      <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
        {remOpts.map(([v,l])=>(
          <button key={l} onClick={()=>onSetProps(b.id,{size:{value:v,unit:"rem"}})}
            style={{flex:1,padding:"6px 4px",border:"none",borderRadius:6,background:curVal===v?AC:"transparent",color:curVal===v?"#fff":"#7c8aa0",cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function toggleCtl(key:string) {
    if(!b) return null;
    const on=Boolean(b.props[key]);
    return (
      <button onClick={()=>onSetProps(b.id,{[key]:!on})}
        style={{display:"flex",alignItems:"center",gap:8,border:"none",background:"transparent",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
        <span style={{width:34,height:19,borderRadius:999,background:on?AC:"#2a3142",position:"relative",transition:"background .15s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:on?17:2,width:15,height:15,borderRadius:999,background:"#fff",transition:"left .15s"}} />
        </span>
        <span style={{fontSize:12.5,color:"#cbd2dc"}}>{on?"On":"Off"}</span>
      </button>
    );
  }
  function revealCtl() {
    if(!b) return null;
    const sourceId = b.layout?.reveal_source_block_id ?? "";
    const seconds = b.layout?.reveal_after_seconds ?? 300;
    return (
      <div>
        <select style={IS} value={sourceId} onChange={e=>onSetLayout(b.id,{ reveal_source_block_id: e.target.value || undefined, reveal_after_seconds: e.target.value ? seconds : undefined })}>
          <option value="">Always visible</option>
          {videoBlocks.map(v=>(<option key={v.id} value={v.id}>{v.label}</option>))}
        </select>
        {Boolean(sourceId) && (
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"#7c8aa0",whiteSpace:"nowrap"}}>after</span>
            <input type="number" min={0} value={seconds} onChange={e=>onSetLayout(b.id,{reveal_after_seconds:+e.target.value||0})} style={{...IS,width:80}} />
            <span style={{fontSize:11,color:"#7c8aa0",whiteSpace:"nowrap"}}>seconds</span>
          </div>
        )}
        {videoBlocks.length===0 && <p style={{fontSize:10.5,color:"#5b6678",marginTop:6,lineHeight:1.4}}>Add a video block to the page to enable a timed reveal.</p>}
      </div>
    );
  }
  function layoutToggleCtl(key: "boxed") {
    if(!b) return null;
    const on = Boolean(b.layout?.[key]);
    return (
      <button onClick={()=>onSetLayout(b.id,{[key]:!on})}
        style={{display:"flex",alignItems:"center",gap:8,border:"none",background:"transparent",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
        <span style={{width:34,height:19,borderRadius:999,background:on?AC:"#2a3142",position:"relative",transition:"background .15s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:on?17:2,width:15,height:15,borderRadius:999,background:"#fff",transition:"left .15s"}} />
        </span>
        <span style={{fontSize:12.5,color:"#cbd2dc"}}>{on?"Boxed":"Full width"}</span>
      </button>
    );
  }
  function layoutColorCtl(key:"border_color"|"bg_overlay_color", fallback:string) {
    if(!b) return null;
    const v=(b.layout?.[key] as string)??fallback;
    return (
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative",width:34,height:34,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",flexShrink:0,background:v}}>
          <input type="color" value={v} onChange={e=>onSetLayout(b.id,{[key]:e.target.value})}
            style={{position:"absolute",inset:-4,width:42,height:42,border:"none",padding:0,cursor:"pointer",background:"transparent"}} />
        </div>
        <input value={v} onChange={e=>onSetLayout(b.id,{[key]:e.target.value})} style={{...IS,fontFamily:"monospace",fontSize:12}} />
      </div>
    );
  }
  function layoutRangeRow(label:string, val:number, onChange:(v:number)=>void, min=0, max=100, fmt=(v:number)=>`${v}px`) {
    return (
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:10.5,color:"#7c8aa0"}}>{label}</span>
          <span style={{fontSize:11,color:"#9aa4b2",fontFamily:"monospace"}}>{fmt(val)}</span>
        </div>
        <input type="range" min={min} max={max} value={val} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:AC}} />
      </div>
    );
  }
  function paddingCtl() {
    if(!b) return null;
    const pt=b.layout?.padding_top?.value??0;
    const pb=b.layout?.padding_bottom?.value??0;
    return (
      <div>
        {layoutRangeRow("Top", pt, v=>onSetLayout(b.id,{padding_top:{value:v,unit:"px"}}), 0, 200)}
        {layoutRangeRow("Bottom", pb, v=>onSetLayout(b.id,{padding_bottom:{value:v,unit:"px"}}), 0, 200)}
      </div>
    );
  }
  function borderCtl() {
    if(!b) return null;
    const bw=b.layout?.border_width??0;
    const br=b.layout?.border_radius??0;
    return (
      <div>
        <Field label="Color">{layoutColorCtl("border_color","#2a3142")}</Field>
        {layoutRangeRow("Width", bw, v=>onSetLayout(b.id,{border_width:v}), 0, 12)}
        {layoutRangeRow("Radius", br, v=>onSetLayout(b.id,{border_radius:v}), 0, 40)}
      </div>
    );
  }
  function bgOverlayCtl() {
    if(!b) return null;
    const op=b.layout?.bg_overlay_opacity??0.4;
    return (
      <div>
        <Field label="Overlay color">{layoutColorCtl("bg_overlay_color","#000000")}</Field>
        {layoutRangeRow("Overlay opacity", op, v=>onSetLayout(b.id,{bg_overlay_opacity:v}), 0, 1, v=>`${Math.round(v*100)}%`)}
      </div>
    );
  }
  function fieldsCtl() {
    if(!b) return null;
    const fields=(b.props.fields as Array<{type:string;label:string;required:boolean}>)??[];
    function update(idx:number, patch:Partial<{type:string;label:string;required:boolean}>) {
      const next=fields.map((f,i)=>i===idx?{...f,...patch}:f);
      onSetProps(b!.id,{fields:next});
    }
    function remove(idx:number) {
      onSetProps(b!.id,{fields:fields.filter((_,i)=>i!==idx)});
    }
    function add() {
      onSetProps(b!.id,{fields:[...fields,{type:`field_${fields.length+1}`,label:"New field",required:false}]});
    }
    return (
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
          {fields.map((f,idx)=>(
            <div key={idx} style={{display:"flex",flexDirection:"column",gap:6,padding:"9px 10px",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={f.label} onChange={e=>update(idx,{label:e.target.value})} placeholder="Label" style={{...IS,flex:1,padding:"6px 8px",fontSize:12}} />
                <button onClick={()=>remove(idx)} style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:2,flexShrink:0}}>
                  <Icon paths={["M5 12h14"]} size={15} sw={2} />
                </button>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={f.type} onChange={e=>update(idx,{type:e.target.value})} placeholder="field_key" style={{...IS,flex:1,padding:"6px 8px",fontSize:11.5,fontFamily:"monospace"}} />
                <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#7c8aa0",whiteSpace:"nowrap"}}>
                  <input type="checkbox" checked={f.required} onChange={e=>update(idx,{required:e.target.checked})} />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>
        <button onClick={add}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:8,background:`${AC}18`,border:`1px dashed ${AC}66`,borderRadius:8,color:AC,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add field
        </button>
        <p style={{fontSize:10.5,color:"#5b6678",marginTop:8,lineHeight:1.4}}>
          Use &quot;email&quot; as the field key to render an email input. The key is used as the data field name on submission.
        </p>
      </div>
    );
  }
  function itemsCtl(kind:"stats"|"faq"|"list"|"pricing") {
    if(!b) return null;
    const items=(b.props.items as unknown[])??[];
    const blank=kind==="stats"?{value:"0",label:"Label"}:kind==="faq"?{q:"New question?",a:"Answer."}:{text:"New item"};
    return (
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
          {items.map((it,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              <span style={{flex:1,fontSize:12,color:"#9aa4b2",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {kind==="stats"?`${(it as {value:string;label:string}).value} · ${(it as {value:string;label:string}).label}`:kind==="faq"?(it as {q:string}).q:(it as {text:string}).text}
              </span>
              <button onClick={()=>onRemoveItem(b.id,idx)}
                style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:2}}>
                <Icon paths={["M5 12h14"]} size={15} sw={2} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={()=>onAddItem(b.id,typeof blank==="string"?blank:{...blank as object})}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:8,background:`${AC}18`,border:`1px dashed ${AC}66`,borderRadius:8,color:AC,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add item
        </button>
        <p style={{fontSize:10.5,color:"#5b6678",marginTop:8,lineHeight:1.4}}>Edit item text directly on the canvas.</p>
      </div>
    );
  }

  function columnPresetCtl() {
    if(!b) return null;
    const current = (b.children ?? []).map(c => c.layout?.width?.value);
    return (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {COLUMN_PRESETS.map(preset=>{
          const active = current.length===preset.widths.length && current.every((w,i)=>Math.abs((w??0)-preset.widths[i])<0.5);
          return (
            <button key={preset.label} onClick={()=>onColumnPreset(b.id,preset.widths)}
              style={{padding:"8px 6px",border:`1px solid ${active?AC:"rgba(255,255,255,0.09)"}`,borderRadius:8,background:active?`${AC}1f`:"#0a0e16",color:active?"#fcd9b6":"#9aa4b2",cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit"}}>
              {preset.label}
            </button>
          );
        })}
      </div>
    );
  }

  function BlockSettings() {
    if(!b) return null;
    const t=b.type;
    const hasStyle=t==="headline"||t==="body-text"||t==="countdown-timer"||t==="cta-button"||b.props.bg_color!==undefined;
    const evergreen=Boolean(b.props.evergreen);
    const noContent = ["section","row","column","divider"].includes(t);
    return (
      <div>
        {t==="row" && (
          <>
            <SL text="Columns" />
            {columnPresetCtl()}
            <div style={{height:18}} />
          </>
        )}
        <SL text="Content" />
        {t==="hero"&&<><Field label="Eyebrow">{textCtl("eyebrow")}</Field><Field label="Headline">{textCtl("headline")}</Field><Field label="Sub-headline">{areaCtl("subtext")}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Button URL">{textCtl("button_url")}</Field></>}
        {t==="countdown-timer"&&<><Field label="Label">{textCtl("label")}</Field><Field label="Evergreen (per-visitor timer)">{toggleCtl("evergreen")}</Field>{evergreen?<Field label="Duration (minutes)">{numCtl("duration_minutes")}</Field>:<Field label="Target date & time"><input type="datetime-local" value={(b.props.target_date as string)??""} onChange={e=>onSetProps(b.id,{target_date:e.target.value})} style={IS} /></Field>}</>}
        {t==="video"&&<><Field label="Video"><VideoUploadField value={b.props.url as string} onChange={url=>onSetProps(b.id,{url})} funnelId={funnelId} /></Field><Field label="Or paste a video / YouTube URL">{textCtl("url")}</Field><Field label="Caption">{textCtl("caption")}</Field></>}
        {t==="optin-form"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Form fields">{fieldsCtl()}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Fine print">{textCtl("fine_print")}</Field><Field label="Redirect URL after submit (optional)">{textCtl("redirect_url")}</Field></>}
        {t==="testimonial"&&<><Field label="Quote">{areaCtl("quote")}</Field><Field label="Author">{textCtl("name")}</Field><Field label="Role">{textCtl("role")}</Field><Field label="Video review (optional)"><VideoUploadField value={b.props.video_url as string} onChange={url=>onSetProps(b.id,{video_url:url})} funnelId={funnelId} /></Field>{Boolean(b.props.video_url)&&<Field label="Video caption">{textCtl("video_caption")}</Field>}</>}
        {(t==="headline"||t==="body-text")&&<Field label="Text">{areaCtl("text")}</Field>}
        {t==="cta-button"&&<><Field label="Button label">{textCtl("text")}</Field><Field label="Button URL">{textCtl("url")}</Field><Field label="Reveal after video reaches…">{revealCtl()}</Field></>}
        {t==="pricing-card"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Price">{textCtl("price")}</Field><Field label="Period">{textCtl("period")}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Button URL">{textCtl("button_url")}</Field><Field label="Features">{itemsCtl("pricing")}</Field></>}
        {t==="stats-bar"&&<Field label="Stats">{itemsCtl("stats")}</Field>}
        {t==="faq-accordion"&&<Field label="Questions">{itemsCtl("faq")}</Field>}
        {t==="list"&&<Field label="Items">{itemsCtl("list")}</Field>}
        {t==="spacer"&&<Field label="Height">{numCtl("height")}</Field>}
        {t==="image"&&<><Field label="Image"><ImageUploadField value={b.props.src as string} onChange={url=>onSetProps(b.id,{src:url})} funnelId={funnelId} /></Field><Field label="Alt text">{textCtl("alt")}</Field><Field label="Corner radius">{numCtl("radius",{min:0,max:40,default:0})}</Field></>}
        {t==="custom-html"&&<Field label="HTML"><textarea value={(b.props.html as string)??""}  onChange={e=>onSetProps(b.id,{html:e.target.value})} rows={6} style={{...IS,resize:"vertical" as const,fontFamily:"monospace"}} /></Field>}
        {noContent&&<p style={{fontSize:12,color:"#7c8aa0",lineHeight:1.5,marginBottom:8}}>This block has no text content. Adjust its style below.</p>}
        {(t==="section"||t==="row"||t==="column")&&(
          <>
            <div style={{height:18}} />
            <SL text="Layout" />
            {(t==="section"||t==="row")&&<Field label="Width">{layoutToggleCtl("boxed")}</Field>}
            <Field label="Padding">{paddingCtl()}</Field>
            {(t==="section"||t==="row")&&(
              <>
                <Field label="Background image"><ImageUploadField value={b.layout?.bg_image} onChange={url=>onSetLayout(b.id,{bg_image:url||undefined})} funnelId={funnelId} /></Field>
                {Boolean(b.layout?.bg_image)&&bgOverlayCtl()}
              </>
            )}
            <div style={{height:6}} />
            <SL text="Border" />
            {borderCtl()}
          </>
        )}
        {hasStyle&&(
          <>
            <div style={{height:18}} />
            <SL text="Style" />
            {t==="headline"&&<Field label="Size">{headlineSizeCtl()}</Field>}
            {(t==="headline"||t==="body-text")&&<><Field label="Alignment">{alignCtl()}</Field><Field label="Text color">{colorCtl("color")}</Field></>}
            {t==="cta-button"&&<><Field label="Size">{ctaSizeCtl()}</Field><Field label="Full width">{toggleCtl("full_width")}</Field><Field label="Text color">{colorCtl("text_color")}</Field></>}
            {(t==="countdown-timer"||t==="cta-button"||t==="pricing-card"||t==="list")&&<Field label="Accent color">{colorCtl("accent_color")}</Field>}
            {b.props.bg_color!==undefined&&<Field label="Background">{colorCtl("bg_color")}</Field>}
          </>
        )}
      </div>
    );
  }

  function PageSettings() {
    const s=page.settings??{};
    const layout=(s.layout as { width_mode?:"boxed"|"full"; max_width?:number })??{};
    const pInp=(val:string,onChange:(v:string)=>void)=>(
      <input value={val} onChange={e=>onChange(e.target.value)} style={IS} />
    );
    const bgVal=(s.bg_color as string)??"#0c0c0f";
    return (
      <div>
        <SL text="SEO & sharing" />
        <Field label="Page title">{pInp(page.name,v=>onSetPage({name:v}))}</Field>
        <Field label="Meta description">
          <textarea value={(s.description as string)??""} onChange={e=>onSetPage({settings:{...s,description:e.target.value}})} rows={3} style={{...IS,resize:"vertical" as const,lineHeight:1.5}} />
        </Field>
        <Field label="URL slug">
          <div style={{display:"flex",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#5b6678",fontFamily:"monospace",background:"#080b12",border:"1px solid rgba(255,255,255,0.09)",borderRight:"none",borderRadius:"8px 0 0 8px",padding:"8px 8px"}}>/</span>
            <input value={page.slug} onChange={e=>onSetPage({slug:e.target.value})} style={{...IS,borderRadius:"0 8px 8px 0",fontFamily:"monospace",fontSize:12}} />
          </div>
        </Field>
        <div style={{height:18}} />
        <SL text="Layout" />
        <Field label="Page width">
          <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
            {(["boxed","full"] as const).map(m=>(
              <button key={m} onClick={()=>onSetPage({settings:{...s,layout:{...layout,width_mode:m}}})}
                style={{flex:1,padding:"6px 4px",border:"none",borderRadius:6,background:(layout.width_mode??"boxed")===m?AC:"transparent",color:(layout.width_mode??"boxed")===m?"#fff":"#7c8aa0",cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit",textTransform:"capitalize"}}>
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Max width (px)">
          <input type="number" value={layout.max_width??1100} onChange={e=>onSetPage({settings:{...s,layout:{...layout,max_width:+e.target.value}}})} style={IS} />
        </Field>
        <div style={{height:18}} />
        <SL text="Style" />
        <Field label="Background color">
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{position:"relative",width:34,height:34,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",flexShrink:0,background:bgVal}}>
              <input type="color" value={bgVal} onChange={e=>onSetPage({settings:{...s,bg_color:e.target.value}})}
                style={{position:"absolute",inset:-4,width:42,height:42,border:"none",padding:0,cursor:"pointer",background:"transparent"}} />
            </div>
            <input value={bgVal} onChange={e=>onSetPage({settings:{...s,bg_color:e.target.value}})} style={{...IS,fontFamily:"monospace",fontSize:12}} />
          </div>
        </Field>
        <div style={{height:18}} />
        <SL text="Tracking" />
        <Field label="Analytics / pixel ID">{pInp((s.tracking_id as string)??"",v=>onSetPage({settings:{...s,tracking_id:v}}))}</Field>
        <div style={{height:18}} />
        <button onClick={onSave}
          style={{width:"100%",padding:"9px",background:`${AC}1f`,border:`1px solid ${AC}44`,borderRadius:9,color:AC,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Save page settings
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {b ? (
          <>
            <div style={{width:30,height:30,borderRadius:8,background:`${AC}1f`,display:"flex",alignItems:"center",justifyContent:"center",color:AC,flexShrink:0}}>
              <BlockIcon type={b.type} size={16} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,fontWeight:600,color:"#eaeff6"}}>{LABELS[b.type]}</div>
              <div style={{fontSize:10.5,color:"#5b6678"}}>Block settings</div>
            </div>
            <button onClick={onDeselect} style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:4}}>
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={16} />
            </button>
          </>
        ) : (
          <>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",color:"#aeb6c2",flexShrink:0}}>
              <Icon paths={["M4 5h16v14H4z","M4 9h16"]} size={16} sw={1.7} />
            </div>
            <div>
              <div style={{fontSize:13.5,fontWeight:600,color:"#eaeff6"}}>Page settings</div>
              <div style={{fontSize:10.5,color:"#5b6678"}}>Select a block to edit it</div>
            </div>
          </>
        )}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"16px"}}>
        {b ? <BlockSettings /> : <PageSettings />}
      </div>
    </>
  );
}
