"use client";

/**
 * v2-app primitives.
 *
 * Thin component wrappers around the .app-* CSS classes in v2-app.css. The
 * CSS is the source of truth for styling — these wrappers just give us nice
 * ergonomics (typed props, sensible defaults, composition).
 *
 * Why thin: keeps the visual language consistent. If we want to change every
 * button's hover state, we edit one CSS variable, not 200 component props.
 */

import * as React from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Cancel01Icon,
} from "./icons";

type IconRef = IconSvgElement;

// ─── Icon wrapper ──────────────────────────────────────────────────────────
// Single import surface; sets consistent stroke + sizing.
export function Icon({
  icon,
  size = 16,
  strokeWidth = 1.5,
  className,
  style,
}: {
  icon: IconRef;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
    />
  );
}

// ─── Button ────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "secondary",
  size = "md",
  iconLeft,
  iconRight,
  iconOnly,
  className = "",
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: IconRef;
  iconRight?: IconRef;
  iconOnly?: IconRef;
}) {
  const sizeClass = size === "sm" ? "app-btn-sm" : size === "lg" ? "app-btn-lg" : "";
  const variantClass = `app-btn-${variant}`;
  const iconClass = iconOnly ? "app-btn-icon" : "";
  const cls = ["app-btn", variantClass, sizeClass, iconClass, className].filter(Boolean).join(" ");
  const iconSize = size === "sm" ? 13 : size === "lg" ? 18 : 15;

  return (
    <button className={cls} {...props}>
      {iconOnly && <Icon icon={iconOnly} size={iconSize} />}
      {iconLeft && <Icon icon={iconLeft} size={iconSize} />}
      {!iconOnly && children}
      {iconRight && <Icon icon={iconRight} size={iconSize} />}
    </button>
  );
}

// ─── Input ─────────────────────────────────────────────────────────────────
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`app-input ${className}`.trim()} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`app-input ${className}`.trim()} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...props }, ref) {
  return (
    <select ref={ref} className={`app-input ${className}`.trim()} {...props}>
      {children}
    </select>
  );
});

// Field wrapper: label + helper text + error
export function Field({
  label,
  helper,
  error,
  required,
  children,
}: {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span style={{ fontSize: 12, color: "var(--app-text-muted)", letterSpacing: "-0.005em", fontWeight: 500 }}>
          {label}
          {required && <span style={{ color: "var(--app-accent)", marginLeft: 3 }}>*</span>}
        </span>
      )}
      {children}
      {(helper || error) && (
        <span style={{ fontSize: 11, color: error ? "var(--app-danger)" : "var(--app-text-quiet)", lineHeight: 1.4 }}>
          {error ?? helper}
        </span>
      )}
    </label>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────
export function Card({
  tight,
  flat,
  interactive,
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tight?: boolean;
  flat?: boolean;
  interactive?: boolean;
}) {
  const cls = [
    "app-card",
    tight && "app-card-tight",
    flat && "app-card-flat",
    interactive && "app-card-interactive",
    className,
  ].filter(Boolean).join(" ");
  return <div className={cls} {...props}>{children}</div>;
}

// ─── Badge ─────────────────────────────────────────────────────────────────
type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "info";
export function Badge({
  tone = "default",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`app-badge app-badge-${tone} ${className}`.trim()}>{children}</span>;
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
export function Skeleton({
  width,
  height = 12,
  className = "",
  style,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`app-skeleton ${className}`.trim()}
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        ...style,
      }}
    />
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="app-tabs" role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className="app-tab"
          data-active={o.value === value ? "true" : "false"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────
// Minimal modal — render-prop friendly. For now, keyboard-closeable via Esc;
// focus trapping can be layered on when we need it (in A2 for auth).
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 480,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="app-modal-scrim" onClick={onClose}>
      <div className="app-modal" style={{ maxWidth }} onClick={e => e.stopPropagation()}>
        {title && (
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 className="app-h3" style={{ margin: 0 }}>{title}</h2>
            <Button variant="ghost" size="sm" iconOnly={Cancel01Icon} aria-label="Close" onClick={onClose} />
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

// ─── Tooltip ───────────────────────────────────────────────────────────────
// CSS-only hover tooltip — no portal, no positioning math. Good for short
// labels on icon buttons. Use a real tooltip lib when we need overflow-safe
// positioning.
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const offsets: Record<typeof side, React.CSSProperties> = {
    top:    { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top:    "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    left:   { right:  "calc(100% + 6px)", top: "50%",  transform: "translateY(-50%)" },
    right:  { left:   "calc(100% + 6px)", top: "50%",  transform: "translateY(-50%)" },
  };
  return (
    <span style={{ position: "relative", display: "inline-flex" }} className="group/tt">
      {children}
      <span
        className="app-tooltip"
        style={{
          position: "absolute",
          ...offsets[side],
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity 120ms var(--app-ease)",
          whiteSpace: "nowrap",
          zIndex: 50,
        }}
        data-tooltip
      >
        {label}
      </span>
      <style>{`
        .group\\/tt:hover [data-tooltip] { opacity: 1; }
      `}</style>
    </span>
  );
}

// ─── Empty / error states ──────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: IconRef;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="app-empty">
      {icon && (
        <div className="app-empty-icon">
          <Icon icon={icon} size={28} strokeWidth={1.4} />
        </div>
      )}
      <p className="app-empty-title">{title}</p>
      {body && <p className="app-empty-body">{body}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  action,
}: {
  title?: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="app-error-state">
      <div style={{ color: "var(--app-danger)" }}>
        <Icon icon={AlertCircleIcon} size={28} strokeWidth={1.4} />
      </div>
      <p className="app-empty-title">{title}</p>
      {body && <p className="app-empty-body">{body}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

// ─── DataTable ─────────────────────────────────────────────────────────────
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  width?: number | string;
};

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  loading,
  density = "comfortable",
  emptyTitle = "Nothing here yet",
  emptyBody,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  density?: "comfortable" | "compact";
  emptyTitle?: string;
  emptyBody?: React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const tableClass = `app-table${density === "compact" ? " app-table-compact" : ""}`;

  if (loading) {
    return (
      <div className="app-table-wrap">
        <table className={tableClass}>
          <thead>
            <tr>{columns.map(c => <th key={c.key} style={{ textAlign: c.align ?? "left", width: c.width }}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c.key}><Skeleton width="70%" height={10} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="app-table-wrap">
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    );
  }

  return (
    <div className="app-table-wrap">
      <table className={tableClass}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{ textAlign: c.align ?? "left", width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map(c => (
                <td key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────
type ToastTone = "default" | "success" | "warning" | "danger";
type ToastItem = { id: number; tone: ToastTone; body: React.ReactNode };

const ToastContext = React.createContext<{
  push: (tone: ToastTone, body: React.ReactNode) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const push = React.useCallback((tone: ToastTone, body: React.ReactNode) => {
    const id = ++idRef.current;
    setItems(prev => [...prev, { id, tone, body }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 3600);
  }, []);

  const TONE_ICON: Record<ToastTone, IconRef | null> = {
    default: null,
    success: CheckmarkCircle02Icon,
    warning: AlertCircleIcon,
    danger:  InformationCircleIcon,
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 100,
        }}
      >
        {items.map(t => {
          const Icn = TONE_ICON[t.tone];
          return (
            <div key={t.id} className={`app-toast ${t.tone !== "default" ? `app-toast-${t.tone}` : ""}`.trim()}>
              {Icn && <Icon icon={Icn} size={16} />}
              <span>{t.body}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.push;
}

// ─── Kbd ───────────────────────────────────────────────────────────────────
export function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="app-kbd">{children}</span>;
}
