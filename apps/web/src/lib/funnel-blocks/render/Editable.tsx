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

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return "";
  return "#" + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

function AlignIcon({ align }: { align: "left" | "center" | "right" }) {
  const configs = {
    left:   [[0,14],[0,9],[0,12]] as [number,number][],
    center: [[0,14],[3,8],[1.5,11]] as [number,number][],
    right:  [[0,14],[5,9],[2,12]] as [number,number][],
  }[align];
  return (
    <svg width="13" height="11" viewBox="0 0 14 11" fill="currentColor">
      {configs.map(([x, w], i) => <rect key={i} x={x} y={i * 4} width={w} height={2} rx={1} />)}
    </svg>
  );
}

const FONT_SIZES = [10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72];

const SEP = (
  <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)", margin: "0 5px", flexShrink: 0 }} />
);

function RichToolbar({ el, onFormat }: { el: HTMLElement | null; onFormat: (cmd: string, val?: string) => void }) {
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [color, setColor] = React.useState("#f97316");
  const [fontSize, setFontSize] = React.useState(16);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el) { setRect(null); return; }
      if (!el.contains(sel.getRangeAt(0).commonAncestorContainer)) { setRect(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width });
      // Try to detect current selection color
      try {
        const v = document.queryCommandValue("foreColor");
        const hex = rgbToHex(v);
        if (hex) setColor(hex);
      } catch {}
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [el]);

  if (!rect || typeof document === "undefined") return null;

  const toolbarW = 480;
  const left = Math.max(8, Math.min(
    rect.left + rect.width / 2 - toolbarW / 2,
    (typeof window !== "undefined" ? window.innerWidth : 960) - toolbarW - 8
  ));
  const top = rect.top - 54;

  const btnStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 6, border: "none",
    background: "transparent", color: "#d0d6e8", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    ...extra,
  });

  return createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: "fixed", top, left, zIndex: 99999, width: toolbarW,
        background: "#141824", border: "1px solid rgba(255,255,255,0.13)",
        borderRadius: 10, padding: "5px 10px",
        display: "flex", gap: 3, alignItems: "center",
        boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
      }}
    >
      {/* Format: Bold, Italic, Underline, Strikethrough */}
      <button style={{ ...btnStyle(), fontWeight: 800, fontSize: 13, letterSpacing: "-0.5px" }} onClick={() => onFormat("bold")}>B</button>
      <button style={{ ...btnStyle(), fontStyle: "italic", fontWeight: 600, fontSize: 13 }} onClick={() => onFormat("italic")}>I</button>
      <button style={{ ...btnStyle(), textDecoration: "underline", fontSize: 13 }} onClick={() => onFormat("underline")}>U</button>
      <button style={{ ...btnStyle(), textDecoration: "line-through", fontSize: 12, color: "#9aa4b2" }} onClick={() => onFormat("strikeThrough")}>S</button>

      {SEP}

      {/* Alignment */}
      {(["left", "center", "right"] as const).map(a => (
        <button key={a} style={btnStyle()} onClick={() => onFormat(`justify${a.charAt(0).toUpperCase() + a.slice(1)}`)}>
          <AlignIcon align={a} />
        </button>
      ))}

      {SEP}

      {/* Color picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", background: color,
            border: "2px solid rgba(255,255,255,0.22)", boxSizing: "border-box",
          }} />
          <input type="color" value={color}
            onChange={e => { setColor(e.target.value); onFormat("foreColor", e.target.value); }}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0 }} />
        </div>
        <input
          value={color}
          onChange={e => { setColor(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onFormat("foreColor", e.target.value); }}
          style={{
            width: 62, fontSize: 11, background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5,
            padding: "2px 6px", color: "#e0e5f0", fontFamily: "monospace", outline: "none",
          }}
        />
      </div>

      {SEP}

      {/* Font size */}
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <select
          value={fontSize}
          onChange={e => { setFontSize(+e.target.value); onFormat("fontSizePx", e.target.value); }}
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 5, color: "#d0d6e8", fontSize: 11, padding: "2px 4px",
            outline: "none", cursor: "pointer", width: 66,
          }}
        >
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
      </div>

      {SEP}

      {/* Clear */}
      <button
        onClick={() => onFormat("removeFormat")}
        style={{ height: 26, padding: "0 8px", borderRadius: 6, border: "none", background: "transparent", color: "#7e8794", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", flexShrink: 0 }}>
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
    if (cmd === "fontSizePx") {
      const px = parseInt(val || "16");
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = `${px}px`;
        try {
          range.surroundContents(span);
        } catch {
          const frag = range.extractContents();
          span.appendChild(frag);
          range.insertNode(span);
        }
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(span);
        sel.addRange(nr);
      }
    } else {
      document.execCommand(cmd, false, val);
    }
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
