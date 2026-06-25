"use client";

/**
 * In-app replacement for the browser's native `prompt()` / `confirm()`
 * dialogs in the academy admin. Returns a promise that resolves with the
 * text the user typed (prompt) or true/false (confirm), null/false on cancel.
 *
 * Used to keep the academy admin's add/delete flows on the v2-app palette
 * — `window.prompt` and `window.confirm` render in raw Chrome chrome which
 * breaks the dark theme.
 */

import { useCallback, useState } from "react";

type DialogState =
  | { kind: "prompt";  title: string; placeholder?: string; defaultValue?: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; body?: string; danger?: boolean; resolve: (ok: boolean) => void }
  | null;

export function useAcademyDialog() {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState("");

  const askText = useCallback((title: string, opts?: { placeholder?: string; defaultValue?: string }) =>
    new Promise<string | null>(resolve => {
      setValue(opts?.defaultValue ?? "");
      setState({ kind: "prompt", title, placeholder: opts?.placeholder, defaultValue: opts?.defaultValue, resolve });
    }), []);

  const askConfirm = useCallback((title: string, opts?: { body?: string; danger?: boolean }) =>
    new Promise<boolean>(resolve => {
      setState({ kind: "confirm", title, body: opts?.body, danger: opts?.danger, resolve });
    }), []);

  function close(submit: boolean) {
    if (!state) return;
    if (state.kind === "prompt")  state.resolve(submit ? (value.trim() || null) : null);
    if (state.kind === "confirm") state.resolve(submit);
    setState(null);
    setValue("");
  }

  const node = state ? (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(2px)",
      }}
      onClick={() => close(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--app-bg-elevated)",
          border: "1px solid var(--app-border-strong)",
          borderRadius: "var(--app-radius-lg)",
          padding: 20,
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text)", marginBottom: state.kind === "prompt" ? 14 : 6 }}>
          {state.title}
        </h3>
        {state.kind === "confirm" && state.body && (
          <p style={{ fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.55, marginBottom: 16 }}>{state.body}</p>
        )}
        {state.kind === "prompt" && (
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={state.placeholder}
            onKeyDown={e => {
              if (e.key === "Enter") close(true);
              if (e.key === "Escape") close(false);
            }}
            style={{
              width: "100%",
              background: "var(--app-surface)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              padding: "9px 12px",
              fontSize: 14,
              color: "var(--app-text)",
              outline: "none",
              marginBottom: 16,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--app-accent)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--app-border)")}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={() => close(false)}
            className="app-btn app-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={() => close(true)}
            className={state.kind === "confirm" && state.danger ? "app-btn" : "app-btn app-btn-primary"}
            style={state.kind === "confirm" && state.danger ? {
              background: "#ef4444",
              color: "#fff",
              border: "1px solid #ef4444",
            } : undefined}
          >
            {state.kind === "confirm" ? (state.danger ? "Delete" : "OK") : "Create"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { askText, askConfirm, node };
}
