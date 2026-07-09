"use client";
import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface EditableProps {
  tag?: keyof React.JSX.IntrinsicElements;
  value: string;
  editable: boolean;
  richText?: boolean;
  style?: React.CSSProperties;
  onCommit: (val: string) => void;
  onFocus?: () => void;
}

const TOOLBAR_COLORS = [
  "#ffffff","#f97316","#fbbf24","#34d399",
  "#60a5fa","#a78bfa","#f472b6","#ef4444",
  "#9ca3af","#111827",
];

function RichToolbar({ el, onFormat }: { el: HTMLElement | null; onFormat: (cmd: string, val?: string) => void }) {
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el) {
        setRect(null);
        return;
      }
      if (!el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        setRect(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [el]);

  if (!rect || typeof document === "undefined") return null;

  const toolbarW = 300;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - toolbarW / 2, (typeof window !== "undefined" ? window.innerWidth : 800) - toolbarW - 8));
  const top = rect.top - 46;

  return createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: "fixed", top, left, zIndex: 99999, width: toolbarW,
        background: "#141824", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 9, padding: "4px 8px", display: "flex", gap: 2, alignItems: "center",
        boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      }}
    >
      {[
        { label: "B", cmd: "bold",          s: { fontWeight: 700 } },
        { label: "I", cmd: "italic",         s: { fontStyle: "italic" as const } },
        { label: "U", cmd: "underline",      s: { textDecoration: "underline" as const } },
        { label: "S", cmd: "strikeThrough",  s: { textDecoration: "line-through" as const } },
      ].map(({ label, cmd, s }) => (
        <button key={cmd} onClick={() => onFormat(cmd)}
          style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: "#e0e5f0", cursor: "pointer", fontSize: 13, ...s, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {label}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
      {TOOLBAR_COLORS.map(c => (
        <button key={c} onClick={() => onFormat("foreColor", c)}
          style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", padding: 0, flexShrink: 0 }} />
      ))}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
      <button onClick={() => onFormat("removeFormat")}
        style={{ height: 26, padding: "0 7px", borderRadius: 6, border: "none", background: "transparent", color: "#7e8794", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" }}>
        Clear
      </button>
    </div>,
    document.body
  );
}

export function Editable({ tag = "div", value, editable, richText, style, onCommit, onFocus }: EditableProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (richText) {
      if (el.innerHTML !== (value ?? "")) el.innerHTML = value ?? "";
    } else {
      if (el.textContent !== (value ?? "")) el.textContent = value ?? "";
    }
  }, [value, richText]);

  const handleFormat = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    setTimeout(() => {
      if (ref.current) onCommit(ref.current.innerHTML);
    }, 10);
  }, [onCommit]);

  const props: Record<string, unknown> = {
    ref,
    contentEditable: editable || undefined,
    suppressContentEditableWarning: true,
    spellCheck: false,
    style: { ...style, outline: "none", cursor: editable ? "text" : undefined },
  };

  if (editable) {
    props.onMouseDown = (e: React.MouseEvent) => { e.stopPropagation(); onFocus?.(); };
    props.onClick     = (e: React.MouseEvent) => e.stopPropagation();
    props.onBlur      = (e: React.FocusEvent<HTMLElement>) => {
      onCommit(richText ? (e.currentTarget.innerHTML ?? "") : (e.currentTarget.textContent ?? ""));
    };
    if (richText) {
      props.onKeyDown = (e: React.KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === "b") { e.preventDefault(); handleFormat("bold"); }
          if (e.key === "i") { e.preventDefault(); handleFormat("italic"); }
          if (e.key === "u") { e.preventDefault(); handleFormat("underline"); }
        }
      };
    }
  }

  return (
    <>
      {React.createElement(tag as string, props)}
      {editable && richText && <RichToolbar el={ref.current} onFormat={handleFormat} />}
    </>
  );
}
