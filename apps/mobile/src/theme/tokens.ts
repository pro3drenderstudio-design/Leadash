/**
 * Leadash design tokens — dark palette ported from apps/web/src/v2-app/v2-app.css
 * (source of truth for dark values; do not re-derive). Light palette derived to
 * hold the same hue relationships on a light ground.
 *
 * Components get the active palette via useTheme() from ./ThemeContext —
 * never import a palette directly.
 */

export interface Palette {
  bg: string; elevated: string; sunken: string;
  surface: string; surfaceStrong: string;
  border: string; borderStrong: string;
  text: string; textMuted: string; textQuiet: string; textFaint: string;
  accent: string; accentSoft: string; accentLine: string;
  success: string; successSoft: string;
  warning: string; warningSoft: string;
  danger: string; dangerSoft: string;
  info: string; infoSoft: string;
  violet: string; violetSoft: string;
}

export const DARK: Palette = {
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
};

export const LIGHT: Palette = {
  bg:        "#F6F6F8",
  elevated:  "#FFFFFF",
  sunken:    "#EFEFF2",

  surface:       "rgba(10,10,20,0.04)",
  surfaceStrong: "rgba(10,10,20,0.07)",
  border:        "rgba(10,10,20,0.08)",
  borderStrong:  "rgba(10,10,20,0.15)",

  text:      "#17171C",
  textMuted: "#5B6070",
  textQuiet: "#8A8F9E",
  textFaint: "#C9CBD3",

  accent:     "#F97316",
  accentSoft: "rgba(249,115,22,0.13)",
  accentLine: "rgba(249,115,22,0.38)",

  success:     "#059669",
  successSoft: "rgba(5,150,105,0.11)",
  warning:     "#B45309",
  warningSoft: "rgba(180,83,9,0.11)",
  danger:      "#DC2626",
  dangerSoft:  "rgba(220,38,38,0.09)",
  info:        "#2563EB",
  infoSoft:    "rgba(37,99,235,0.09)",
  violet:      "#7C3AED",
  violetSoft:  "rgba(124,58,237,0.11)",
};

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

export interface StatusTone { label: string; color: string; soft: string }

/** crm_status → label + tone, mirrors the web CRM */
export function crmStatusMap(C: Palette): Record<string, StatusTone> {
  return {
    neutral:        { label: "Neutral",        color: C.textMuted, soft: C.surface },
    interested:     { label: "Interested",     color: C.success,   soft: C.successSoft },
    meeting_booked: { label: "Meeting booked", color: C.info,      soft: C.infoSoft },
    won:            { label: "Won",            color: C.warning,   soft: C.warningSoft },
    not_interested: { label: "Not interested", color: C.danger,    soft: C.dangerSoft },
    ooo:            { label: "OOO",            color: C.textMuted, soft: C.surface },
    follow_up:      { label: "Follow up",      color: C.violet,    soft: C.violetSoft },
  };
}

/** campaign status → tone */
export function campaignStatusMap(C: Palette): Record<string, { color: string; soft: string }> {
  return {
    active:    { color: C.success,   soft: C.successSoft },
    paused:    { color: C.warning,   soft: C.warningSoft },
    draft:     { color: C.textMuted, soft: C.surface },
    completed: { color: C.info,      soft: C.infoSoft },
  };
}

/** inbox status → tone (statuses are active|paused|error — no 'warning' exists) */
export function inboxStatusMap(C: Palette): Record<string, { color: string; soft: string }> {
  return {
    active: { color: C.success, soft: C.successSoft },
    paused: { color: C.warning, soft: C.warningSoft },
    error:  { color: C.danger,  soft: C.dangerSoft },
  };
}
