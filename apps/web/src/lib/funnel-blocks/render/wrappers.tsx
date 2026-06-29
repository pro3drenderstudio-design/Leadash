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

export function buildOuterStyle(layout: BlockLayout | undefined, fallbackPadding: string): React.CSSProperties {
  if (!layout) return { padding: fallbackPadding };
  const style: React.CSSProperties = {};
  if (layout.bg_image) {
    style.backgroundImage = `url(${layout.bg_image})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }
  const pt = layout.padding_top ? sizeToCss(layout.padding_top) : undefined;
  const pb = layout.padding_bottom ? sizeToCss(layout.padding_bottom) : undefined;
  style.padding = pt || pb ? `${pt ?? "0px"} 0px ${pb ?? "0px"}` : fallbackPadding;
  if (layout.border_color) style.borderColor = layout.border_color;
  if (layout.border_width != null) style.borderWidth = layout.border_width;
  if (layout.border_width) style.borderStyle = "solid";
  if (layout.border_radius != null) style.borderRadius = layout.border_radius;
  return style;
}

export function buildOverlayStyle(layout: BlockLayout | undefined): React.CSSProperties | null {
  if (!layout?.bg_image || !layout.bg_overlay_color) return null;
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

export function buildColumnStyle(layout: BlockLayout | undefined): React.CSSProperties {
  const width = layout?.width ? sizeToCss(layout.width) : undefined;
  return {
    flex: width ? `0 0 ${width}` : "1 1 0%",
    minWidth: 0,
    width: width,
  };
}
