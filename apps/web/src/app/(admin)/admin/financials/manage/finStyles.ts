/** Shared style constants for the Finance Manager's tab components — mirrors
 *  the conventions inside FinanceManagerClient.tsx (which keeps its own local
 *  copies to avoid churn in that large file). */
import type { CSSProperties } from "react";

export const FIN_PRIMARY_BTN: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px",
  borderRadius: 8, border: "none", background: "var(--app-accent)", color: "#0A0A0A",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

export const FIN_SECONDARY_BTN: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px",
  borderRadius: 8, border: "1px solid var(--app-border-strong)", background: "var(--app-surface)",
  color: "var(--app-text)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};

export const FIN_GHOST_BTN: CSSProperties = {
  height: 30, padding: "0 12px", borderRadius: 7,
  border: "1px solid var(--app-border-strong)", background: "transparent",
  color: "var(--app-text-muted)", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

export const FIN_TH: CSSProperties = {
  padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
  color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid var(--app-border)",
};

export const FIN_TD: CSSProperties = { padding: "12px 16px" };

export const FIN_CHIP: CSSProperties = {
  display: "inline-flex", alignItems: "center",
  padding: "2px 8px", borderRadius: 999,
  fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
};

export const FIN_CARD: CSSProperties = {
  border: "1px solid var(--app-border)", borderRadius: 14,
  background: "var(--app-surface)", overflow: "hidden",
};

export const FIN_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "var(--app-text-quiet)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  marginBottom: 6, marginTop: 0,
};

export function ngnFull(n: number) { return "₦" + Math.round(Math.abs(n)).toLocaleString("en-NG"); }

export function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" });
}

export function monthBounds(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = `${yyyymm}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function currentMonth(): string { return new Date().toISOString().slice(0, 7); }
