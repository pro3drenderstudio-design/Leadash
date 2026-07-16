"use client";
/**
 * ConfirmDialog + useConfirmDialog — replaces window.confirm / window.prompt
 * across the Finance Manager tabs. Chrome's native dialogs steal focus,
 * ignore theme, and look out of place inside the app; this variant reuses
 * the app modal styling from LedgerTab.
 *
 * Usage:
 *   const { confirm, prompt, dialog } = useConfirmDialog();
 *   const ok = await confirm({ title: "Delete this entry?", destructive: true });
 *   const note = await prompt({ title: "Flag note", placeholder: "…" });
 *   // Render {dialog} somewhere in the tree.
 */
import { useRef, useState } from "react";
import { FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_LABEL } from "./finStyles";

type Kind = "confirm" | "prompt";
interface State {
  kind: Kind;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  placeholder?: string;
  required?: boolean;
}

export function useConfirmDialog() {
  const [state, setState] = useState<State | null>(null);
  const [value, setValue] = useState("");
  const resolverRef = useRef<((v: unknown) => void) | null>(null);

  function confirm(opts: Omit<State, "kind">): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve as (v: unknown) => void;
      setState({ ...opts, kind: "confirm" });
    });
  }

  function prompt(opts: Omit<State, "kind"> & { initial?: string }): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      resolverRef.current = resolve as (v: unknown) => void;
      setValue(opts.initial ?? "");
      setState({ ...opts, kind: "prompt" });
    });
  }

  function handleOk() {
    if (!state) return;
    if (state.kind === "prompt" && state.required && !value.trim()) return;
    const r = resolverRef.current;
    const result: unknown = state.kind === "prompt" ? value : true;
    setState(null); setValue("");
    r?.(result);
  }

  function handleCancel() {
    if (!state) return;
    const r = resolverRef.current;
    const result: unknown = state.kind === "prompt" ? null : false;
    setState(null); setValue("");
    r?.(result);
  }

  const dialog = state ? (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
      onClick={handleCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{state.title}</h3>
        {state.body && (
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--app-text-muted)", whiteSpace: "pre-line" }}>{state.body}</p>
        )}
        {state.kind === "prompt" && (
          <div style={{ marginBottom: 12 }}>
            <p style={FIN_LABEL}>{state.required ? "Required" : "Optional"}</p>
            <textarea
              className="fin-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={state.placeholder ?? ""}
              rows={3}
              autoFocus
              style={{ width: "100%", resize: "vertical", minHeight: 72 }}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleOk(); }}
            />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button onClick={handleCancel} style={FIN_GHOST_BTN}>{state.cancelLabel ?? "Cancel"}</button>
          <button
            onClick={handleOk}
            disabled={state.kind === "prompt" && state.required && !value.trim()}
            style={{
              ...FIN_PRIMARY_BTN,
              opacity: state.kind === "prompt" && state.required && !value.trim() ? 0.5 : 1,
              ...(state.destructive
                ? { background: "var(--app-out)", color: "#0A0A0A" }
                : {}),
            }}
          >
            {state.confirmLabel ?? (state.destructive ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, prompt, dialog };
}
