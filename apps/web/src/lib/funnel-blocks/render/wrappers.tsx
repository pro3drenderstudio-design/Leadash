import React from "react";
import { BlockLayout } from "../types";

/**
 * Fluid value between a mobile and desktop pixel size using real CSS clamp(),
 * so the same style works in the admin's simulated device-width canvas AND
 * a real visitor's viewport — no `device` prop branching needed at use sites.
 */
export function fluid(mobilePx: number, desktopPx: number, mobileVw = 390, desktopVw = 1100): string {
  const lo = Math.min(mobilePx, desktopPx);
  const hi = Math.max(mobilePx, desktopPx);
  const slope = (desktopPx - mobilePx) / (desktopVw - mobileVw);
  const intercept = mobilePx - slope * mobileVw;
  return `clamp(${lo}px, calc(${intercept.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw), ${hi}px)`;
}

function sizeToCss(s: { value: number; unit: string } | undefined): string | undefined {
  if (!s) return undefined;
  return `${s.value}${s.unit}`;
}

// Pick a spacing value for the given device, falling back to the desktop value.
function pickSpacing(
  layout: BlockLayout,
  key: keyof BlockLayout,
  device?: string,
): { value: number; unit: string } | undefined {
  const l = layout as Record<string, unknown>;
  if (device === "mobile") {
    const mv = l[`${key}_mobile`] as { value: number; unit: string } | undefined;
    if (mv) return mv;
  }
  if (device === "tablet") {
    const tv = l[`${key}_tablet`] as { value: number; unit: string } | undefined;
    if (tv) return tv;
  }
  return l[key] as { value: number; unit: string } | undefined;
}

export function buildOuterStyle(layout: BlockLayout | undefined, fallbackPadding: string, device?: string): React.CSSProperties {
  if (!layout) return { padding: fallbackPadding };
  const style: React.CSSProperties = {};
  if (layout.bg_image) {
    style.backgroundImage = `url(${layout.bg_image})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  } else if (layout.bg_gradient) {
    style.background = layout.bg_gradient;
  }
  const pt = sizeToCss(pickSpacing(layout, "padding_top", device));
  const pb = sizeToCss(pickSpacing(layout, "padding_bottom", device));
  const pl = sizeToCss(pickSpacing(layout, "padding_left", device));
  const pr = sizeToCss(pickSpacing(layout, "padding_right", device));
  if (pt || pb || pl || pr) {
    style.paddingTop = pt ?? "0px";
    style.paddingRight = pr ?? "0px";
    style.paddingBottom = pb ?? "0px";
    style.paddingLeft = pl ?? "0px";
  } else {
    style.padding = fallbackPadding;
  }
  const mt = sizeToCss(pickSpacing(layout, "margin_top", device));
  const mb = sizeToCss(pickSpacing(layout, "margin_bottom", device));
  const ml = sizeToCss(pickSpacing(layout, "margin_left", device));
  const mr = sizeToCss(pickSpacing(layout, "margin_right", device));
  if (mt) style.marginTop = mt;
  if (mb) style.marginBottom = mb;
  if (ml) style.marginLeft = ml;
  if (mr) style.marginRight = mr;
  if (layout.border_color) style.borderColor = layout.border_color;
  if (layout.border_width != null) style.borderWidth = layout.border_width;
  if (layout.border_width) style.borderStyle = "solid";
  if (layout.border_radius != null) style.borderRadius = layout.border_radius;
  // Alignment: align_v controls flex layout of children inside this container
  if (layout.align_v) {
    style.display = "flex";
    style.flexDirection = "column";
    style.justifyContent = layout.align_v === "center" ? "center" : layout.align_v === "bottom" ? "flex-end" : "flex-start";
  }
  return style;
}

// Returns true when a layout has any mobile/tablet overrides or visibility flags.
export function hasResponsiveLayout(layout: BlockLayout | undefined): boolean {
  if (!layout) return false;
  const l = layout as Record<string, unknown>;
  return !!(
    l.padding_top_mobile || l.padding_bottom_mobile || l.padding_left_mobile || l.padding_right_mobile ||
    l.padding_top_tablet || l.padding_bottom_tablet || l.padding_left_tablet || l.padding_right_tablet ||
    l.margin_top_mobile  || l.margin_bottom_mobile  || l.margin_left_mobile  || l.margin_right_mobile  ||
    l.margin_top_tablet  || l.margin_bottom_tablet  || l.margin_left_tablet  || l.margin_right_tablet  ||
    l.hidden_mobile || l.hidden_tablet || l.hidden_desktop
  );
}

/**
 * Generates CSS custom-property overrides in media queries for per-device prop overrides
 * (font-size, color, text-align, icon-size, spacer height, etc.).
 *
 * The caller must ensure [data-blk="{blockId}"] is on a wrapper ancestor so that
 * the CSS variables are inherited by the block's inner elements.
 *
 * Also emits direct [data-blk] svg width/height overrides for icon_size since SVG
 * presentation attributes can't be controlled via a parent CSS variable alone.
 */
export function buildPropResponsiveCss(
  blockId: string,
  mP: Record<string, unknown>,
  tP: Record<string, unknown>,
): string {
  const blkSel = `[data-blk="${blockId}"]`;
  const svgSel = `[data-blk="${blockId}"] svg`;
  const mVars: string[] = [];
  const tVars: string[] = [];
  const mSvg: string[] = [];
  const tSvg: string[] = [];

  function addEntry(vars: string[], svgs: string[], key: string, value: unknown) {
    switch (key) {
      case "size":
        // headline: size is a {value, unit} object
        if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
          const s = value as { value: number; unit: string };
          vars.push(`--blk-${blockId}-fs:${s.value}${s.unit}`);
        }
        break;
      case "font_size":
      case "text_size":
        if (typeof value === "number") vars.push(`--blk-${blockId}-fs:${value}px`);
        break;
      case "color":
      case "text_color":
        if (typeof value === "string") vars.push(`--blk-${blockId}-fc:${value}`);
        break;
      case "icon_color":
        if (typeof value === "string") vars.push(`--blk-${blockId}-ic:${value}`);
        break;
      case "align":
        if (typeof value === "string") {
          vars.push(`--blk-${blockId}-ta:${value}`);
          // Also emit justify-content equivalent (for image/icon alignment)
          const jc: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
          vars.push(`--blk-${blockId}-jc:${jc[value as string] ?? "center"}`);
        }
        break;
      case "icon_size":
        if (typeof value === "number") {
          vars.push(`--blk-${blockId}-is:${value}px`);
          // SVG elements need direct width/height override (they use HTML attributes)
          svgs.push(`width:${value}px!important;height:${value}px!important`);
        }
        break;
      case "height":
        if (typeof value === "number") vars.push(`--blk-${blockId}-h:${value}px`);
        break;
      case "title_size":
        if (typeof value === "number") vars.push(`--blk-${blockId}-ts:${value}px`);
        break;
      case "body_size":
        if (typeof value === "number") vars.push(`--blk-${blockId}-bs:${value}px`);
        break;
      case "width":
        // image width — string like "100%", "320px"
        if (typeof value === "string") vars.push(`--blk-${blockId}-iw:${value}`);
        break;
      case "full_width": {
        // cta-button: expand/collapse button width
        const isFull = Boolean(value);
        vars.push(`--blk-${blockId}-fd:${isFull ? "flex" : "inline-flex"}`);
        vars.push(`--blk-${blockId}-fw:${isFull ? "100%" : "auto"}`);
        break;
      }
      case "icon_position": {
        // icon-box: icon above vs left/right of text
        const dirMap: Record<string, string> = { top: "column", left: "row", right: "row-reverse" };
        vars.push(`--blk-${blockId}-ipos:${dirMap[value as string] ?? "column"}`);
        break;
      }
      default:
        break;
    }
  }

  for (const [k, v] of Object.entries(mP)) addEntry(mVars, mSvg, k, v);
  for (const [k, v] of Object.entries(tP)) addEntry(tVars, tSvg, k, v);

  let css = "";
  if (mVars.length) css += `@media(max-width:640px){${blkSel}{${mVars.join(";")}}}`;
  if (mSvg.length)  css += `@media(max-width:640px){${svgSel}{${mSvg.join(";")}}}`;
  if (tVars.length) css += `@media(min-width:641px) and (max-width:1023px){${blkSel}{${tVars.join(";")}}}`;
  if (tSvg.length)  css += `@media(min-width:641px) and (max-width:1023px){${svgSel}{${tSvg.join(";")}}}`;
  return css;
}

// Generates CSS with !important media-query overrides for responsive spacing/visibility.
// The caller must add data-blk={blockId} to the block's outermost div.
export function buildResponsiveSpacingCss(blockId: string, layout: BlockLayout | undefined): string {
  if (!layout || !hasResponsiveLayout(layout)) return "";
  const l = layout as Record<string, unknown>;
  const sel = `[data-blk="${blockId}"]`;

  const spacingProps = [
    ["padding-top",    "padding_top"],
    ["padding-right",  "padding_right"],
    ["padding-bottom", "padding_bottom"],
    ["padding-left",   "padding_left"],
    ["margin-top",     "margin_top"],
    ["margin-right",   "margin_right"],
    ["margin-bottom",  "margin_bottom"],
    ["margin-left",    "margin_left"],
  ] as const;

  const mRules: string[] = [];
  const tRules: string[] = [];
  for (const [cssProp, key] of spacingProps) {
    const mv = l[`${key}_mobile`] as { value: number; unit: string } | undefined;
    const tv = l[`${key}_tablet`] as { value: number; unit: string } | undefined;
    if (mv) mRules.push(`${cssProp}:${mv.value}${mv.unit}!important`);
    if (tv) tRules.push(`${cssProp}:${tv.value}${tv.unit}!important`);
  }
  if (layout.hidden_mobile)  mRules.push("display:none!important");
  if (layout.hidden_tablet)  tRules.push("display:none!important");

  let css = "";
  if (mRules.length) css += `@media(max-width:640px){${sel}{${mRules.join(";")};}}`;
  if (tRules.length) css += `@media(min-width:641px) and (max-width:1023px){${sel}{${tRules.join(";")};}}`;
  if (layout.hidden_desktop) css += `@media(min-width:1024px){${sel}{display:none!important;}}`;
  return css;
}

// Returns horizontal alignment style for a block within its column (columns are flex-direction:column).
export function buildSelfAlignStyle(layout: BlockLayout | undefined): React.CSSProperties {
  if (!layout?.align_h) return {};
  if (layout.align_h === "left")   return { alignSelf: "flex-start" };
  if (layout.align_h === "center") return { alignSelf: "center" };
  if (layout.align_h === "right")  return { alignSelf: "flex-end" };
  return {};
}

export const PATTERN_PRESETS: Record<string, { bg: string; size?: string; label: string }> = {
  dots:      { bg: "radial-gradient(circle, PCOLOR 1px, transparent 1px)", size: "20px 20px", label: "Dots" },
  "dots-lg": { bg: "radial-gradient(circle, PCOLOR 1.5px, transparent 1.5px)", size: "32px 32px", label: "Dots LG" },
  grid:      { bg: "linear-gradient(PCOLOR 1px, transparent 1px),linear-gradient(90deg, PCOLOR 1px, transparent 1px)", size: "40px 40px", label: "Grid" },
  "grid-sm": { bg: "linear-gradient(PCOLOR 1px, transparent 1px),linear-gradient(90deg, PCOLOR 1px, transparent 1px)", size: "20px 20px", label: "Grid SM" },
  diagonal:  { bg: "repeating-linear-gradient(45deg, PCOLOR 0px, PCOLOR 1px, transparent 1px, transparent 14px)", label: "Diagonals /" },
  "diag-r":  { bg: "repeating-linear-gradient(-45deg, PCOLOR 0px, PCOLOR 1px, transparent 1px, transparent 14px)", label: "Diagonals \\" },
  "lines-h": { bg: "repeating-linear-gradient(0deg, PCOLOR 0px, PCOLOR 1px, transparent 1px, transparent 24px)", label: "H Lines" },
  "lines-v": { bg: "repeating-linear-gradient(90deg, PCOLOR 0px, PCOLOR 1px, transparent 1px, transparent 24px)", label: "V Lines" },
};

export function buildPatternStyle(layout: BlockLayout | undefined): React.CSSProperties | null {
  if (!layout?.bg_pattern) return null;
  const pat = PATTERN_PRESETS[layout.bg_pattern];
  if (!pat) return null;
  const color = layout.bg_pattern_color ?? "#ffffff";
  return {
    position: "absolute",
    inset: 0,
    backgroundImage: pat.bg.replace(/PCOLOR/g, color),
    backgroundSize: pat.size,
    opacity: layout.bg_pattern_opacity ?? 0.15,
    pointerEvents: "none",
  };
}

export function buildOverlayStyle(layout: BlockLayout | undefined): React.CSSProperties | null {
  if (!layout?.bg_overlay_color) return null;
  return {
    position: "absolute",
    inset: 0,
    background: layout.bg_overlay_color,
    opacity: layout.bg_overlay_opacity ?? 0.4,
    pointerEvents: "none",
  };
}

export function buildInnerStyle(layout: BlockLayout | undefined, pageMaxWidth: number): React.CSSProperties {
  const boxed = layout?.boxed ?? false;
  if (!boxed) return { width: "100%", position: "relative" };
  const mw = layout?.max_width && layout.max_width !== "none" ? sizeToCss(layout.max_width) : `${pageMaxWidth}px`;
  return { maxWidth: mw, margin: "0 auto", width: "100%", position: "relative" };
}

/** Column items in a grid row don't need explicit flex/width — the grid track handles sizing. */
export function buildColumnStyle(_layout: BlockLayout | undefined): React.CSSProperties {
  return { minWidth: 0 };
}

type ColLayout = { width?: { value: number; unit: string }; width_mobile?: { value: number; unit: string }; width_tablet?: { value: number; unit: string } };

/**
 * Build the CSS grid-template-columns value for a row.
 * Uses `fr` units converted from percentage widths so gap is automatically
 * excluded from the fraction calculation — this eliminates the column-wrap bug
 * that occurred with percentage widths and explicit gap in flexbox.
 *
 * Responsive behaviour (device = "mobile" | "tablet" | "desktop"):
 *   mobile  — if no width_mobile overrides, returns "1fr" (full-width stacking)
 *   tablet  — if no width_tablet overrides, falls back to desktop widths
 *   desktop — uses width.value as fr units
 */
export function buildRowGridTemplate(colLayouts: (ColLayout | undefined)[], device: string): string {
  if (colLayouts.length === 0) return "1fr";

  if (device === "mobile") {
    const hasOverride = colLayouts.some(l => l?.width_mobile);
    if (!hasOverride) return "1fr";
    return colLayouts.map(l => {
      const w = l?.width_mobile;
      return w ? `${w.value}fr` : "1fr";
    }).join(" ");
  }

  if (device === "tablet") {
    const hasOverride = colLayouts.some(l => l?.width_tablet);
    return colLayouts.map(l => {
      const w = hasOverride ? (l?.width_tablet ?? l?.width) : l?.width;
      return w ? `${w.value}fr` : "1fr";
    }).join(" ");
  }

  // desktop
  return colLayouts.map(l => {
    const w = l?.width;
    return w ? `${w.value}fr` : "1fr";
  }).join(" ");
}
