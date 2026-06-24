"use client";

/**
 * Tiny @dnd-kit wrapper for ordered lists in the academy admin.
 *
 * Renders an ordered list of items; the consumer provides the render fn
 * for each item plus an onReorder callback receiving the new ordering.
 * Each item must expose a stable string id.
 *
 * The consumer is responsible for persisting the new order to the server.
 * Optimistic local update happens immediately so the UI feels responsive
 * even on a slow PATCH.
 */

import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode, CSSProperties } from "react";

interface Props<T extends { id: string }> {
  items:      T[];
  onReorder:  (next: T[]) => void;
  renderItem: (item: T, handleProps: { listeners: Record<string, unknown> | undefined; dragging: boolean }) => ReactNode;
  className?: string;
}

export default function SortableList<T extends { id: string }>({ items, onReorder, renderItem, className }: Props<T>) {
  const sensors = useSensors(
    // 6px activation threshold so a casual click on the row doesn't start
    // a drag (lets nested buttons receive their click events).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex(i => i.id === active.id);
    const to   = items.findIndex(i => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map(item => <SortableRow key={item.id} id={item.id}>{handle => renderItem(item, handle)}</SortableRow>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: { listeners: Record<string, unknown> | undefined; dragging: boolean }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.6 : 1,
    zIndex:     isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ listeners: listeners as unknown as Record<string, unknown> | undefined, dragging: isDragging })}
    </div>
  );
}

/** Convenience CSS-class drag-handle that the consumer renders inside its row.
 *  Apply the handleProps.listeners to this element. */
export function DragHandle({ listeners, label = "Drag" }: { listeners: Record<string, unknown> | undefined; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...(listeners as React.HTMLAttributes<HTMLButtonElement>)}
      style={{
        width: 22, height: 22,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "none",
        color: "var(--app-text-quiet)",
        cursor: "grab",
        flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9"  cy="6"  r="1.4" />
        <circle cx="15" cy="6"  r="1.4" />
        <circle cx="9"  cy="12" r="1.4" />
        <circle cx="15" cy="12" r="1.4" />
        <circle cx="9"  cy="18" r="1.4" />
        <circle cx="15" cy="18" r="1.4" />
      </svg>
    </button>
  );
}
