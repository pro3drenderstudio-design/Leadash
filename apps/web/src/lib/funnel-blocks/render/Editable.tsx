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

function getAnchorFromSelection(): HTMLAnchorElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
  while (node && node !== document.body) {
    if (node.nodeType === 1 && (node as HTMLElement).tagName === "A") return node as HTMLAnchorElement;
    node = node.parentNode;
  }
  return null;
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

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

const FONT_SIZES = [10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72];

const SEP = (
  <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)", margin: "0 4px", flexShrink: 0 }} />
);

function RichToolbar({ el, onFormat }: { el: HTMLElement | null; onFormat: (cmd: string, val?: string) => void }) {
  const [rect, setRect]              = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [color, setColor]            = React.useState("#f97316");
  const [fontSize, setFontSize]      = React.useState(16);
  const [isLink, setIsLink]          = React.useState(false);
  const [showLinkInput, setShowLink] = React.useState(false);
  const [linkUrl, setLinkUrl]        = React.useState("");
  const savedRange                   = useRef<Range | null>(null);
  const linkInputRef                 = useRef<HTMLInputElement>(null);
  // Ref-tracked flags so the selectionchange closure always has the current value
  const showLinkRef        = useRef(false);
  const colorActiveRef     = useRef(false);
  const colorPickerOpenRef = useRef(false);
  const lastRectRef        = useRef<{ top: number; left: number; width: number } | null>(null);
  const colorInputRef      = useRef<HTMLInputElement>(null);
  const toolbarRef         = useRef<HTMLDivElement>(null);
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false);

  React.useEffect(() => { showLinkRef.current = showLinkInput; }, [showLinkInput]);
  React.useEffect(() => { colorPickerOpenRef.current = colorPickerOpen; }, [colorPickerOpen]);

  useEffect(() => {
    const update = () => {
      // Never dismiss while the link input, hex input, or color picker popup is active
      if (showLinkRef.current || colorActiveRef.current || colorPickerOpenRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el) { setRect(null); return; }
      if (!el.contains(sel.getRangeAt(0).commonAncestorContainer)) { setRect(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const newRect = { top: r.top, left: r.left, width: r.width };
      setRect(newRect);
      lastRectRef.current = newRect;
      // Detect color
      try {
        const v = document.queryCommandValue("foreColor");
        const hex = rgbToHex(v);
        if (hex) setColor(hex);
      } catch {}
      // Detect link
      const anchor = getAnchorFromSelection();
      setIsLink(!!anchor);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [el]);

  // When color picker popup is open, keep toolbar visible until the user clicks outside it
  useEffect(() => {
    if (!colorPickerOpen) return;
    const dismiss = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setColorPickerOpen(false);
      colorPickerOpenRef.current = false;
    };
    // Delay so the mousedown that opened the picker doesn't immediately dismiss it
    const t = setTimeout(() => document.addEventListener("mousedown", dismiss, true), 200);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", dismiss, true); };
  }, [colorPickerOpen]);

  // While the color picker popup is open, hold the toolbar at its last known position
  const displayRect = rect ?? (colorPickerOpen ? lastRectRef.current : null);
  if (!displayRect || typeof document === "undefined") return null;

  const toolbarW = 540;
  const left = Math.max(8, Math.min(
    displayRect.left + displayRect.width / 2 - toolbarW / 2,
    (typeof window !== "undefined" ? window.innerWidth : 1024) - toolbarW - 12,
  ));
  const top = displayRect.top - 58;

  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: 6, border: "none",
    background: "transparent", color: "#d0d6e8", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    ...extra,
  });

  // Save selection before any toolbar interaction that steals focus
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  // Restore saved selection (needed after input/select steal focus)
  function restoreSelection() {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function handleLinkClick() {
    saveSelection();
    const anchor = getAnchorFromSelection();
    if (anchor) {
      // Already a link — toggle unlink or edit
      setLinkUrl(anchor.href);
    } else {
      setLinkUrl("https://");
    }
    setShowLink(v => {
      if (!v) setTimeout(() => linkInputRef.current?.focus(), 30);
      return !v;
    });
  }

  function applyLink() {
    restoreSelection();
    if (linkUrl && linkUrl !== "https://") {
      document.execCommand("createLink", false, linkUrl);
      // Make the link open in a new tab
      const anchor = getAnchorFromSelection();
      if (anchor) { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
    } else {
      document.execCommand("unlink");
    }
    setShowLink(false);
    setTimeout(() => { if (el) onFormat("__commit__"); }, 10);
  }

  function removeLink() {
    restoreSelection();
    document.execCommand("unlink");
    setShowLink(false);
    setTimeout(() => { if (el) onFormat("__commit__"); }, 10);
  }

  return createPortal(
    <div
      ref={toolbarRef}
      onMouseDown={e => {
        const target = e.target as HTMLInputElement;
        // SELECT and non-color text inputs need to take focus to function normally
        if (target.tagName === "SELECT" || (target.tagName === "INPUT" && target.type !== "color")) {
          saveSelection();
          return;
        }
        // For buttons, divs, and the color wheel, prevent focus from leaving the
        // contenteditable — the color picker still opens because that's triggered by
        // the click event, not mousedown.
        saveSelection();
        e.preventDefault();
      }}
      style={{
        position: "fixed", top, left, zIndex: 99999, width: toolbarW,
        background: "#141824", border: "1px solid rgba(255,255,255,0.13)",
        borderRadius: 10, padding: "5px 8px",
        display: "flex", gap: 2, alignItems: "center",
        boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
      }}
    >
      {showLinkInput ? (
        // Link input mode
        <>
          <span style={{ fontSize: 11, color: "#9aa4b2", flexShrink: 0 }}>URL:</span>
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setShowLink(false); }}
            placeholder="https://..."
            style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, color: "#e0e5f0", fontSize: 12, padding: "4px 8px", outline: "none" }}
          />
          <button onClick={applyLink} style={{ ...btn({ background: "#f97316", color: "#fff", width: "auto", padding: "0 10px", fontSize: 12 }) }}>Apply</button>
          {isLink && <button onClick={removeLink} style={{ ...btn({ color: "#f87171", width: "auto", padding: "0 8px", fontSize: 12 }) }}>Remove</button>}
          <button onClick={() => setShowLink(false)} style={{ ...btn({ color: "#7e8794", fontSize: 18, lineHeight: 1 }) }}>×</button>
        </>
      ) : (
        <>
          {/* Format */}
          <button style={{ ...btn(), fontWeight: 800, fontSize: 13, letterSpacing: "-0.5px" }} onClick={() => onFormat("bold")}>B</button>
          <button style={{ ...btn(), fontStyle: "italic", fontWeight: 600, fontSize: 13 }} onClick={() => onFormat("italic")}>I</button>
          <button style={{ ...btn(), textDecoration: "underline", fontSize: 13 }} onClick={() => onFormat("underline")}>U</button>
          <button style={{ ...btn({ textDecoration: "line-through", fontSize: 12, color: "#9aa4b2" }) }} onClick={() => onFormat("strikeThrough")}>S</button>

          {SEP}

          {/* Link */}
          <button
            onClick={handleLinkClick}
            style={{ ...btn({ color: isLink ? "#60a5fa" : "#d0d6e8", background: isLink ? "rgba(96,165,250,0.12)" : "transparent" }) }}
            title={isLink ? "Edit / remove link" : "Add hyperlink"}
          >
            <LinkIcon />
          </button>

          {SEP}

          {/* Alignment */}
          {(["left", "center", "right"] as const).map(a => (
            <button key={a} style={btn()} onClick={() => onFormat(`justify${a.charAt(0).toUpperCase() + a.slice(1)}`)}>
              <AlignIcon align={a} />
            </button>
          ))}

          {SEP}

          {/* Color */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: color, border: "2px solid rgba(255,255,255,0.22)", boxSizing: "border-box" }} />
              <input type="color" ref={colorInputRef} value={color}
                onClick={() => { saveSelection(); setColorPickerOpen(true); colorPickerOpenRef.current = true; }}
                onChange={e => { setColor(e.target.value); restoreSelection(); onFormat("foreColor", e.target.value); }}
                style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0 }} />
            </div>
            <input
              value={color}
              onFocus={() => { saveSelection(); colorActiveRef.current = true; }}
              onBlur={() => { colorActiveRef.current = false; }}
              onChange={e => { setColor(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) { restoreSelection(); onFormat("foreColor", e.target.value); } }}
              style={{ width: 62, fontSize: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "2px 6px", color: "#e0e5f0", fontFamily: "monospace", outline: "none" }}
            />
          </div>

          {SEP}

          {/* Font size */}
          <select
            value={fontSize}
            onChange={e => {
              const val = e.target.value;
              setFontSize(+val);
              restoreSelection();
              onFormat("fontSizePx", val);
            }}
            style={{ background: "#1e2333", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "#d0d6e8", fontSize: 11, padding: "2px 4px", outline: "none", cursor: "pointer", width: 64, flexShrink: 0 }}
          >
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
          </select>

          {SEP}

          {/* Clear */}
          <button
            onClick={() => onFormat("removeFormat")}
            style={{ ...btn({ width: "auto", padding: "0 7px", fontSize: 10, color: "#7e8794", whiteSpace: "nowrap" }) }}
            title="Clear formatting"
          >
            Clear
          </button>
        </>
      )}
    </div>,
    document.body,
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
    if (cmd === "__commit__") {
      if (ref.current) onCommit(ref.current.innerHTML);
      return;
    }
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
    setTimeout(() => { if (ref.current) onCommit(ref.current.innerHTML); }, 10);
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
          if (e.key === "k") { e.preventDefault(); document.dispatchEvent(new CustomEvent("editable-link-shortcut")); }
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
