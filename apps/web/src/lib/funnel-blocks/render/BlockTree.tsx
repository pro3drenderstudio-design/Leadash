"use client";
import React, { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Block } from "../types";
import { BlockRenderer, BlockRenderContext } from "./BlockRenderer";
import { buildColumnStyle } from "./wrappers";
import { Icon, LABELS } from "./icons";
import { RevealGate } from "./interactive/RevealGate";

const AC = "#f97316";

export function BlockTree({ blocks, ctx, parentId = null }: { blocks: Block[]; ctx: BlockRenderContext; parentId?: string | null }) {
  const fullCtx: BlockRenderContext = {
    ...ctx,
    renderChildren: (items, pid) => <ChildSlot items={items} parentId={pid} ctx={ctx} />,
  };

  if (parentId === null && blocks.length === 0) {
    return ctx.mode === "edit" ? <EmptyCanvas /> : null;
  }

  return (
    <>
      {ctx.mode === "edit" && <DropSlot parentId={parentId} index={0} onQuickInsert={ctx.onQuickInsert} />}
      {blocks.map((b, i) => (
        <React.Fragment key={b.id}>
          {ctx.mode === "edit" ? (
            <EditableBlockRow block={b} ctx={ctx} fullCtx={fullCtx} />
          ) : (
            <LiveBlockRow block={b} ctx={fullCtx} />
          )}
          {ctx.mode === "edit" && <DropSlot parentId={parentId} index={i + 1} onQuickInsert={ctx.onQuickInsert} />}
        </React.Fragment>
      ))}
    </>
  );
}

function ChildSlot({ items, parentId, ctx }: { items: Block[]; parentId: string; ctx: BlockRenderContext }) {
  if (items.length === 0 && ctx.mode === "edit") return <EmptyContainerSlot parentId={parentId} />;
  return <BlockTree blocks={items} ctx={ctx} parentId={parentId} />;
}

function blockWrapperPadding(block: Block): React.CSSProperties {
  const l = block.layout;
  // Containers (row, section, column) apply padding/margin inside BlockRenderer via buildOuterStyle.
  if (!l || ["row", "section", "column"].includes(block.type)) return {};
  const style: React.CSSProperties = {};
  if (l.padding_top)    style.paddingTop    = `${l.padding_top.value}${l.padding_top.unit}`;
  if (l.padding_right)  style.paddingRight  = `${l.padding_right.value}${l.padding_right.unit}`;
  if (l.padding_bottom) style.paddingBottom = `${l.padding_bottom.value}${l.padding_bottom.unit}`;
  if (l.padding_left)   style.paddingLeft   = `${l.padding_left.value}${l.padding_left.unit}`;
  if (l.margin_top)     style.marginTop     = `${l.margin_top.value}${l.margin_top.unit}`;
  if (l.margin_right)   style.marginRight   = `${l.margin_right.value}${l.margin_right.unit}`;
  if (l.margin_bottom)  style.marginBottom  = `${l.margin_bottom.value}${l.margin_bottom.unit}`;
  if (l.margin_left)    style.marginLeft    = `${l.margin_left.value}${l.margin_left.unit}`;
  return style;
}

function LiveBlockRow({ block, ctx }: { block: Block; ctx: BlockRenderContext }) {
  const colStyle = block.type === "column" ? buildColumnStyle(block.layout) : undefined;
  const node = <BlockRenderer block={block} ctx={ctx} />;
  const sourceId = block.layout?.reveal_source_block_id;
  const afterSeconds = block.layout?.reveal_after_seconds;
  return (
    <div style={{ position: "relative", ...colStyle, ...blockWrapperPadding(block) }}>
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

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={e => { e.stopPropagation(); ctx.onSelect?.(block.id); }}
      style={{
        position: "relative", cursor: "pointer", opacity: isDragging ? 0.35 : 1,
        boxShadow: sel ? `inset 0 0 0 2px ${AC}` : hover ? `inset 0 0 0 1px ${AC}66` : "none",
        transition: "box-shadow .12s", ...colStyle, ...blockWrapperPadding(block),
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
