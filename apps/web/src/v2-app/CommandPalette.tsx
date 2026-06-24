"use client";

/**
 * v2-app command palette (⌘K / Ctrl+K).
 *
 * Behavioral spec:
 *   - Global keyboard shortcut: ⌘K on Mac, Ctrl+K elsewhere. Esc closes.
 *   - Reads navigation from APP_NAV / ADMIN_NAV (via flattenNav) and any
 *     additional action lists the consumer passes in.
 *   - Filters as you type with a forgiving substring match — every search
 *     token must be present somewhere in the item's label or group.
 *   - Arrow Up/Down (and Ctrl-N/P) move the highlight; Enter activates.
 *   - Activating navigates via `router.push` for hrefs, or calls
 *     onActivate() for action items.
 *   - Renders into a portal at body level so it sits over the entire app
 *     (sidebars, modals, etc.) regardless of layout shell.
 *
 * Why no fuzzy/score library: substring matching with token splits feels
 * crisp and predictable for the size of nav we have (~60 items). When the
 * palette grows to include records (campaigns/leads/etc.) we'll layer in
 * a real fuzzy scorer.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Search01Icon,
  CommandIcon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Dashboard01Icon,
} from "./icons";
import { APP_NAV, ADMIN_NAV } from "./nav";

// ─── Types ──────────────────────────────────────────────────────────────────
export type CommandItem = {
  id:           string;
  label:        string;
  groupLabel?:  string;       // visual group header in the palette
  hint?:        string;       // small right-aligned hint (e.g. shortcut, kind)
  icon?:        IconSvgElement;
  href?:        string;       // if set, palette navigates here on activation
  onActivate?:  () => void;   // alternative: action that runs on enter
  keywords?:    string[];     // additional search terms not in the label
};

// ─── Hook: open/close state + global ⌘K shortcut ────────────────────────────
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, openPalette: () => setOpen(true), closePalette: () => setOpen(false) };
}

// ─── Nav item → command item helpers ────────────────────────────────────────
function navToCommandItems(groups: typeof APP_NAV, prefix: string): CommandItem[] {
  const out: CommandItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      out.push({
        id:         `${prefix}:${item.href}`,
        label:      item.label,
        groupLabel: group.label ?? prefix,
        href:       item.href,
        icon:       item.icon,
      });
      for (const child of item.children ?? []) {
        out.push({
          id:         `${prefix}:${child.href}`,
          label:      `${item.label} → ${child.label}`,
          groupLabel: group.label ?? prefix,
          href:       child.href,
          icon:       item.icon,
        });
      }
    }
  }
  return out;
}

// Build the default global command set. We pick admin vs app nav based on
// the current pathname so the palette mirrors the user's surface.
function defaultItems(pathname: string): CommandItem[] {
  const inAdmin = pathname.startsWith("/admin");
  const primary = inAdmin
    ? navToCommandItems(ADMIN_NAV, "Admin")
    : navToCommandItems(APP_NAV,   "App");
  // Always offer a quick jump to the dashboard regardless of context.
  if (inAdmin) {
    primary.unshift({
      id: "app:dashboard",
      label: "Go to user dashboard",
      groupLabel: "Switch surface",
      href: "/dashboard",
      icon: Dashboard01Icon,
    });
  } else {
    primary.push({
      id: "admin:home",
      label: "Open admin panel",
      groupLabel: "Switch surface",
      href: "/admin",
      icon: Dashboard01Icon,
    });
  }
  return primary;
}

function filterItems(items: CommandItem[], query: string): CommandItem[] {
  if (!query.trim()) return items;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(it => {
    const haystack = [
      it.label,
      it.groupLabel ?? "",
      ...(it.keywords ?? []),
    ].join(" ").toLowerCase();
    return tokens.every(t => haystack.includes(t));
  });
}

// ─── Palette UI ─────────────────────────────────────────────────────────────
export function CommandPalette({
  open,
  onClose,
  extraItems,
}: {
  open: boolean;
  onClose: () => void;
  extraItems?: CommandItem[];   // workspace-specific commands a consumer wants surfaced
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery]     = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef  = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // When the palette opens: clear query, focus input, lock body scroll.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Build + filter the visible item list.
  const items = React.useMemo(
    () => [...defaultItems(pathname), ...(extraItems ?? [])],
    [pathname, extraItems],
  );
  const visible = React.useMemo(() => filterItems(items, query), [items, query]);

  // Reset highlight when filter changes.
  React.useEffect(() => { setHighlight(0); }, [query]);

  // Keep the highlighted row visible.
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-row="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  function activate(item: CommandItem) {
    onClose();
    if (item.onActivate) item.onActivate();
    if (item.href)       router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key.toLowerCase() === "n")) {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, visible.length - 1));
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key.toLowerCase() === "p")) {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = visible[highlight];
      if (item) activate(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!open || !mounted) return null;

  // Group rendering — preserve original order, insert a small header before
  // each new groupLabel.
  const rows: React.ReactElement[] = [];
  let lastGroup = "";
  visible.forEach((it, i) => {
    if (it.groupLabel && it.groupLabel !== lastGroup) {
      rows.push(
        <div key={`g-${i}`} className="cmdk-group-label">{it.groupLabel}</div>,
      );
      lastGroup = it.groupLabel;
    }
    rows.push(
      <button
        key={it.id}
        type="button"
        data-cmd-row={i}
        data-active={i === highlight ? "true" : "false"}
        className="cmdk-row"
        onMouseEnter={() => setHighlight(i)}
        onClick={() => activate(it)}
      >
        {it.icon && (
          <span className="cmdk-row-icon">
            <HugeiconsIcon icon={it.icon} size={14} strokeWidth={1.5} />
          </span>
        )}
        <span className="cmdk-row-label">{it.label}</span>
        {it.hint && <span className="cmdk-row-hint">{it.hint}</span>}
        <span className="cmdk-row-arrow" aria-hidden>
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.5} />
        </span>
      </button>,
    );
  });

  const palette = (
    <div className="v2-app cmdk-scrim" onClick={onClose}>
      <div className="cmdk-shell" onClick={e => e.stopPropagation()}>
        {/* Search row */}
        <div className="cmdk-search">
          <span className="cmdk-search-icon">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.5} />
          </span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search pages, actions, records…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="cmdk-kbd-hint">
            <span className="app-kbd">esc</span>
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="cmdk-list">
          {visible.length === 0 ? (
            <div className="cmdk-empty">
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : rows}
        </div>

        {/* Footer hints */}
        <div className="cmdk-footer">
          <span className="cmdk-foot-hint">
            <HugeiconsIcon icon={ArrowUp01Icon} size={11} />
            <HugeiconsIcon icon={ArrowDown01Icon} size={11} />
            to navigate
          </span>
          <span className="cmdk-foot-hint">
            <span className="app-kbd">↵</span> to open
          </span>
          <span className="cmdk-foot-hint" style={{ marginLeft: "auto" }}>
            <HugeiconsIcon icon={CommandIcon} size={11} />
            <span className="app-kbd">K</span> to toggle
          </span>
        </div>
      </div>

      <style>{cmdkCss}</style>
    </div>
  );

  return createPortal(palette, document.body);
}

// ─── Styling ────────────────────────────────────────────────────────────────
const cmdkCss = `
.cmdk-scrim {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(7, 7, 10, 0.62);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
  animation: cmdk-fade 140ms var(--app-ease);
}
@keyframes cmdk-fade { from { opacity: 0; } to { opacity: 1; } }

.cmdk-shell {
  width: 100%;
  max-width: 560px;
  background: var(--app-bg-elevated);
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-lg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 70vh;
  animation: cmdk-rise 160ms var(--app-ease);
}
@keyframes cmdk-rise { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.cmdk-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
}
.cmdk-search-icon { color: var(--app-text-quiet); display: inline-flex; }
.cmdk-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--app-text);
  font-size: 15px;
  letter-spacing: -0.005em;
  font-family: inherit;
}
.cmdk-input::placeholder { color: var(--app-text-quiet); }
.cmdk-kbd-hint { display: inline-flex; }

.cmdk-list {
  overflow-y: auto;
  padding: 6px 6px 8px;
  flex: 1;
}

.cmdk-group-label {
  padding: 10px 12px 6px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--app-text-quiet);
  font-weight: 500;
}

.cmdk-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--app-radius-sm);
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: -0.005em;
}
.cmdk-row[data-active="true"] {
  background: var(--app-surface-strong);
}
.cmdk-row[data-active="true"] .cmdk-row-arrow { color: var(--app-accent); }

.cmdk-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  color: var(--app-text-muted);
  flex-shrink: 0;
}
.cmdk-row[data-active="true"] .cmdk-row-icon {
  background: var(--app-accent-soft);
  border-color: var(--app-accent-line);
  color: var(--app-accent);
}
.cmdk-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmdk-row-hint  { font-size: 11px; color: var(--app-text-quiet); flex-shrink: 0; }
.cmdk-row-arrow { color: var(--app-text-faint); display: inline-flex; flex-shrink: 0; }

.cmdk-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
}

.cmdk-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-bg-sunken);
  font-size: 11px;
  color: var(--app-text-quiet);
}
.cmdk-foot-hint { display: inline-flex; align-items: center; gap: 6px; }
`;
