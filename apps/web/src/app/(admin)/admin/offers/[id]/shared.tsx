"use client";

/**
 * Shared style tokens + small primitives for the Offer Builder tabs.
 * Mirrors the inline style language used by ../../academy/ChallengeBuilder.tsx
 * (card/input/label/button styles, toggle switch) so the Offer Builder feels
 * visually consistent with the rest of the v2-app admin.
 */

export const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

export const inputStyle: React.CSSProperties = {
  background: "var(--app-bg)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--app-text)",
  fontSize: 13.5,
  fontFamily: "inherit",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "var(--app-text-quiet)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
  marginBottom: 6,
};

export const btnPrimary: React.CSSProperties = {
  background: "var(--app-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const btnDefault: React.CSSProperties = {
  background: "var(--app-surface-strong)",
  border: "1px solid var(--app-border-strong)",
  color: "var(--app-text)",
  borderRadius: 9,
  padding: "7px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const btnGhost: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--app-text-muted)",
  padding: "7px 12px",
  borderRadius: 9,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      aria-label="Toggle"
      disabled={disabled}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 40,
        height: 23,
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "var(--app-accent)" : "var(--app-surface-strong)",
        flexShrink: 0,
        transition: "background 0.18s ease",
        outline: "none",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          left: on ? "calc(100% - 20px)" : 3,
          transition: "left 0.18s ease",
        }}
      />
    </button>
  );
}

export function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
      color, background: bg, border: `1px solid ${border}`,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>{label}</span>
  );
}
