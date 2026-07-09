export type BlockType =
  | "row" | "column"
  | "section" | "spacer" | "divider"
  | "headline" | "body-text" | "list" | "icon-list"
  | "image" | "video"
  | "icon" | "icon-box"
  | "hero" | "countdown-timer" | "testimonial" | "pricing-card" | "faq-accordion" | "stats-bar"
  | "cta-button" | "optin-form" | "custom-html"
  | "info-card";

export type SizeUnit = "px" | "rem" | "%";

export interface SizeValue {
  value: number;
  unit: SizeUnit;
}

export interface BlockLayout {
  width?: SizeValue;
  max_width?: SizeValue | "none";
  boxed?: boolean;
  // Desktop spacing
  padding_top?: { value: number; unit: "px" | "rem" };
  padding_bottom?: { value: number; unit: "px" | "rem" };
  padding_left?: { value: number; unit: "px" | "rem" };
  padding_right?: { value: number; unit: "px" | "rem" };
  margin_top?: { value: number; unit: "px" | "rem" };
  margin_bottom?: { value: number; unit: "px" | "rem" };
  margin_left?: { value: number; unit: "px" | "rem" };
  margin_right?: { value: number; unit: "px" | "rem" };
  // Mobile spacing overrides
  padding_top_mobile?: { value: number; unit: "px" | "rem" };
  padding_bottom_mobile?: { value: number; unit: "px" | "rem" };
  padding_left_mobile?: { value: number; unit: "px" | "rem" };
  padding_right_mobile?: { value: number; unit: "px" | "rem" };
  margin_top_mobile?: { value: number; unit: "px" | "rem" };
  margin_bottom_mobile?: { value: number; unit: "px" | "rem" };
  margin_left_mobile?: { value: number; unit: "px" | "rem" };
  margin_right_mobile?: { value: number; unit: "px" | "rem" };
  // Tablet spacing overrides
  padding_top_tablet?: { value: number; unit: "px" | "rem" };
  padding_bottom_tablet?: { value: number; unit: "px" | "rem" };
  padding_left_tablet?: { value: number; unit: "px" | "rem" };
  padding_right_tablet?: { value: number; unit: "px" | "rem" };
  margin_top_tablet?: { value: number; unit: "px" | "rem" };
  margin_bottom_tablet?: { value: number; unit: "px" | "rem" };
  margin_left_tablet?: { value: number; unit: "px" | "rem" };
  margin_right_tablet?: { value: number; unit: "px" | "rem" };
  // Per-device visibility
  hidden_mobile?: boolean;
  hidden_tablet?: boolean;
  hidden_desktop?: boolean;
  // Alignment / positioning
  align_h?: "left" | "center" | "right";           // horizontal self-position within column
  align_v?: "top" | "center" | "bottom";            // vertical alignment of children (for containers)
  column_gap?: number;
  width_mobile?: SizeValue;
  width_tablet?: SizeValue;
  bg_image?: string;
  bg_overlay_color?: string;
  bg_overlay_opacity?: number;
  bg_gradient?: string;
  bg_pattern?: string;
  bg_pattern_opacity?: number;
  bg_pattern_color?: string;
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  reveal_source_block_id?: string;
  reveal_after_seconds?: number;
  // Per-device prop overrides (font size, color, alignment, etc.)
  props_mobile?: Record<string, unknown>;
  props_tablet?: Record<string, unknown>;
}

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  layout?: BlockLayout;
  children?: Block[];
}

export interface PageLayoutSettings {
  width_mode?: "boxed" | "full";
  max_width?: number;
}

export const CONTAINER_TYPES: BlockType[] = ["row", "column", "section"];

export function isContainerType(type: BlockType): boolean {
  return CONTAINER_TYPES.includes(type);
}
