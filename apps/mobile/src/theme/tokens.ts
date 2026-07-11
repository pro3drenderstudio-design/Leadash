/**
 * Leadash design tokens — ported from apps/web/src/v2-app/v2-app.css.
 * Do not re-derive colors; that file is the source of truth.
 * Dark theme only (the product is dark-only across all surfaces).
 */
export const C = {
  bg:        "#07070A",
  elevated:  "#0E0E13",
  sunken:    "#050507",

  surface:       "rgba(255,255,255,0.04)",
  surfaceStrong: "rgba(255,255,255,0.07)",
  border:        "rgba(255,255,255,0.08)",
  borderStrong:  "rgba(255,255,255,0.13)",

  text:      "#F5F5F7",
  textMuted: "#9CA0AE",
  textQuiet: "#5B5B68",
  textFaint: "#2A2A33",

  accent:     "#F97316",
  accentSoft: "rgba(249,115,22,0.14)",
  accentLine: "rgba(249,115,22,0.32)",

  success:     "#34D399",
  successSoft: "rgba(52,211,153,0.12)",
  warning:     "#FBBF24",
  warningSoft: "rgba(251,191,36,0.12)",
  danger:      "#F87171",
  dangerSoft:  "rgba(248,113,113,0.12)",
  info:        "#60A5FA",
  infoSoft:    "rgba(96,165,250,0.12)",
  violet:      "#A78BFA",
  violetSoft:  "rgba(167,139,250,0.14)",
} as const;

export const R = {
  sm:   9,
  md:   12,
  lg:   14,
  pill: 999,
} as const;

export const FONT = {
  regular:  "Geist-Regular",
  medium:   "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold:     "Geist-Bold",
} as const;

/** crm_status → label + tone, mirrors the web CRM */
export const CRM_STATUS: Record<string, { label: string; color: string; soft: string }> = {
  neutral:        { label: "Neutral",        color: C.textMuted, soft: C.surface },
  interested:     { label: "Interested",     color: C.success,   soft: C.successSoft },
  meeting_booked: { label: "Meeting booked", color: C.info,      soft: C.infoSoft },
  won:            { label: "Won",            color: C.warning,   soft: C.warningSoft },
  not_interested: { label: "Not interested", color: C.danger,    soft: C.dangerSoft },
  ooo:            { label: "OOO",            color: C.textMuted, soft: C.surface },
  follow_up:      { label: "Follow up",      color: C.violet,    soft: C.violetSoft },
};

/** campaign status → tone */
export const CAMPAIGN_STATUS: Record<string, { color: string; soft: string }> = {
  active:    { color: C.success,   soft: C.successSoft },
  paused:    { color: C.warning,   soft: C.warningSoft },
  draft:     { color: C.textMuted, soft: C.surface },
  completed: { color: C.info,      soft: C.infoSoft },
};

/** inbox status → tone (statuses are active|paused|error — no 'warning' exists) */
export const INBOX_STATUS: Record<string, { color: string; soft: string }> = {
  active: { color: C.success, soft: C.successSoft },
  paused: { color: C.warning, soft: C.warningSoft },
  error:  { color: C.danger,  soft: C.dangerSoft },
};
