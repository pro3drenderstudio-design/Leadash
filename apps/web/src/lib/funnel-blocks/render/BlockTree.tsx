"use client";
import React, { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Block } from "../types";
import { BlockRenderer, BlockRenderContext } from "./BlockRenderer";
import { buildColumnStyle, buildPropResponsiveCss, buildResponsiveSpacingCss, buildSelfAlignStyle, hasResponsiveLayout } from "./wrappers";
import { Icon, LABELS } from "./icons";
import { RevealGate } from "./interactive/RevealGate";

const AC = "#f97316";

export function BlockTree({ blocks, ctx, parentId = null, parentType }: { blocks: Block[]; ctx: BlockRenderContext; parentId?: string | null; parentType?: string }) {
  const fullCtx: BlockRenderContext = {
    ...ctx,
    renderChildren: (items, pid, pType) => <ChildSlot items={items} parentId={pid} ctx={ctx} parentType={pType} />,
  };

  if (parentId === null && blocks.length === 0) {
    return ctx.mode === "edit" ? <EmptyCanvas /> : null;
  }

  // Don't render DropSlots between columns inside a row — they break the CSS grid layout
  // by becoming extra grid items that push columns onto separate rows.
  const showDropSlots = ctx.mode === "edit" && parentType !== "row";

  return (
    <>
      {showDropSlots && <DropSlot parentId={parentId} index={0} onQuickInsert={ctx.onQuickInsert} />}
      {blocks.map((b, i) => (
        <React.Fragment key={b.id}>
          {ctx.mode === "edit" ? (
            <EditableBlockRow block={b} ctx={ctx} fullCtx={fullCtx} />
          ) : (
            <LiveBlockRow block={b} ctx={fullCtx} />
          )}
          {showDropSlots && <DropSlot parentId={parentId} index={i + 1} onQuickInsert={ctx.onQuickInsert} />}
        </React.Fragment>
      ))}
    </>
  );
}

function ChildSlot({ items, parentId, ctx, parentType }: { items: Block[]; parentId: string; ctx: BlockRenderContext; parentType?: string }) {
  if (items.length === 0 && ctx.mode === "edit") return <EmptyContainerSlot parentId={parentId} />;
  return <BlockTree blocks={items} ctx={ctx} parentId={parentId} parentType={parentType} />;
}

function blockWrapperPadding(block: Block, device?: string): React.CSSProperties {
  const l = block.layout;
  // Containers (row, section, column) apply padding/margin inside BlockRenderer via buildOuterStyle.
  if (!l || ["row", "section", "column"].includes(block.type)) return {};

  // Helper: pick device-specific spacing, falling back to desktop value.
  function pick(key: string) {
    const ll = l as Record<string, unknown>;
    if (device === "mobile" && ll[`${key}_mobile`]) return ll[`${key}_mobile`] as { value: number; unit: string };
    if (device === "tablet" && ll[`${key}_tablet`]) return ll[`${key}_tablet`] as { value: number; unit: string };
    return ll[key] as { value: number; unit: string } | undefined;
  }

  const style: React.CSSProperties = {};
  const pt = pick("padding_top");
  const pr = pick("padding_right");
  const pb = pick("padding_bottom");
  const pl = pick("padding_left");
  const mt = pick("margin_top");
  const mr = pick("margin_right");
  const mb = pick("margin_bottom");
  const ml = pick("margin_left");
  if (pt) style.paddingTop    = `${pt.value}${pt.unit}`;
  if (pr) style.paddingRight  = `${pr.value}${pr.unit}`;
  if (pb) style.paddingBottom = `${pb.value}${pb.unit}`;
  if (pl) style.paddingLeft   = `${pl.value}${pl.unit}`;
  if (mt) style.marginTop     = `${mt.value}${mt.unit}`;
  if (mr) style.marginRight   = `${mr.value}${mr.unit}`;
  if (mb) style.marginBottom  = `${mb.value}${mb.unit}`;
  if (ml) style.marginLeft    = `${ml.value}${ml.unit}`;
  // Horizontal self-alignment (non-containers only)
  Object.assign(style, buildSelfAlignStyle(l));
  return style;
}

function LiveBlockRow({ block, ctx }: { block: Block; ctx: BlockRenderContext }) {
  const colStyle = block.type === "column" ? buildColumnStyle(block.layout) : undefined;
  const node = <BlockRenderer block={block} ctx={ctx} />;
  const sourceId = block.layout?.reveal_source_block_id;
  const afterSeconds = block.layout?.reveal_after_seconds;
  // Responsive spacing/visibility for non-container blocks (containers handle this themselves in BlockRenderer).
  const isContainer = ["row", "section", "column"].includes(block.type);
  const respCss = !isContainer ? buildResponsiveSpacingCss(block.id, block.layout) : "";
  // Responsive prop overrides (font-size, color, alignment, icon-size, etc.) for any block type.
  const mP = (block.layout?.props_mobile ?? {}) as Record<string, unknown>;
  const tP = (block.layout?.props_tablet ?? {}) as Record<string, unknown>;
  const hasPropOverrides = Object.keys(mP).length > 0 || Object.keys(tP).length > 0;
  const propCss = hasPropOverrides ? buildPropResponsiveCss(block.id, mP, tP) : "";
  const allCss = respCss + propCss;
  const hasResp = !!allCss;
  return (
    <div
      data-blk={hasResp ? block.id : undefined}
      style={{ position: "relative", ...colStyle, ...blockWrapperPadding(block) }}
    >
      {allCss && <style dangerouslySetInnerHTML={{ __html: allCss }} />}
      {sourceId && afterSeconds != null ? (
        <RevealGate sourceBlockId={sourceId} afterSeconds={afterSeconds}>{node}</RevealGate>
      ) : node}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 24, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
  color: "#9aa3b0", background: "transparent", border: "none", cursor: "pointer", borderRadius: 6,
};

function EditableBlockRow({ block, ctx, fullCtx }: { block: Block; ctx: BlockRenderContext; fullCtx: BlockRenderContext }) {
  const sel = ctx.selectedId === block.id;
  const [hover, setHover] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { kind: "move", id: block.id },
  });
  const colStyle = block.type === "column" ? buildColumnStyle(block.layout) : undefined;
  const device = ctx.device;
  // In canvas: dim the block when it's hidden on the current device
  const l = block.layout;
  const hiddenOnDevice = (device === "mobile" && l?.hidden_mobile) || (device === "tablet" && l?.hidden_tablet) || (device === "desktop" && l?.hidden_desktop);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={e => { e.stopPropagation(); ctx.onSelect?.(block.id); }}
      style={{
        position: "relative", cursor: "pointer", opacity: isDragging ? 0.35 : hiddenOnDevice ? 0.25 : 1,
        boxShadow: sel ? `inset 0 0 0 2px ${AC}` : hover ? `inset 0 0 0 1px ${AC}66` : "none",
        transition: "box-shadow .12s", ...colStyle, ...blockWrapperPadding(block, device),
      }}
    >
      <BlockRenderer block={block} ctx={fullCtx} />
      {sel && (
        <div style={{ position: "absolute", top: 0, left: 0, background: AC, color: "#fff", fontSize: 9.5, fontWeight: 600, padding: "2px 8px", borderBottomRightRadius: 7, letterSpacing: ".05em", textTransform: "uppercase", pointerEvents: "none", zIndex: 15 }}>
          {LABELS[block.type]}
        </div>
      )}
      {sel && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "absolute", top: -15, right: 10, display: "flex", alignItems: "center", gap: 1, background: "#161c28", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: 2, boxShadow: "0 8px 24px -6px rgba(0,0,0,.6)", zIndex: 20 }}
        >
          <div ref={setNodeRef} {...listeners} {...attributes} title="Drag to reorder" style={{ width: 24, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#5b6678", cursor: "grab" }}>
            <Icon paths={["M9 6h.01", "M9 12h.01", "M9 18h.01", "M15 6h.01", "M15 12h.01", "M15 18h.01"]} size={15} sw={2.6} />
          </div>
          <button onClick={() => ctx.onMoveUp?.(block.id)} title="Move up" style={btnStyle}><Icon paths={["M12 19V5", "M6 11l6-6 6 6"]} size={15} /></button>
          <button onClick={() => ctx.onMoveDown?.(block.id)} title="Move down" style={btnStyle}><Icon paths={["M12 5v14", "M6 13l6 6 6-6"]} size={15} /></button>
          <button onClick={() => ctx.onDuplicate?.(block.id)} title="Duplicate" style={btnStyle}><Icon paths={["M9 9h11v11H9z", "M5 15V5h10"]} size={15} /></button>
          <button onClick={() => ctx.onRemove?.(block.id)} title="Delete" style={{ ...btnStyle, color: "#f87171" }}><Icon paths={["M4 7h16", "M6 7l1 13h10l1-13", "M9 7V4h6v3"]} size={15} /></button>
        </div>
      )}
    </div>
  );
}

function DropSlot({ parentId, index, onQuickInsert }: { parentId: string | null; index: number; onQuickInsert?: (parentId: string | null, index: number) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${parentId ?? "root"}:${index}`, data: { parentId, index } });
  const [hover, setHover] = useState(false);
  return (
    <div
      ref={setNodeRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", height: isOver ? 22 : 9 }}
    >
      {isOver && <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 3, background: AC, borderRadius: 2, transform: "translateY(-50%)" }} />}
      {hover && !isOver && onQuickInsert && (
        <button
          onClick={() => onQuickInsert(parentId, index)}
          title="Insert block here"
          style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 18, height: 18, borderRadius: "50%", background: AC, color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 5 }}
        >
          <Icon paths={["M12 5v14", "M5 12h14"]} size={11} sw={2.4} />
        </button>
      )}
    </div>
  );
}

function EmptyContainerSlot({ parentId }: { parentId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${parentId}:0`, data: { parentId, index: 0 } });
  return (
    <div ref={setNodeRef} style={{ border: `1px dashed ${isOver ? AC : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", color: "#3a4252", fontSize: 12, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
      Drop blocks here
    </div>
  );
}

function EmptyCanvas() {
  const { isOver, setNodeRef } = useDroppable({ id: "slot:root:0", data: { parentId: null, index: 0 } });
  return (
    <div ref={setNodeRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, textAlign: "center", padding: 32, border: isOver ? `2px dashed ${AC}` : "2px dashed transparent", borderRadius: 12 }}>
      <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>Click a block on the left to add it</p>
    </div>
  );
}
