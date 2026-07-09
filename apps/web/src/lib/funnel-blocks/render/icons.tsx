import React from "react";
import { BlockType } from "../types";

export function Icon({ paths, size = 16, sw = 1.8 }: { paths: string[]; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export const LABELS: Record<BlockType, string> = {
  "row":"Row","column":"Column",
  "section":"Section","spacer":"Spacer","divider":"Divider",
  "headline":"Headline","body-text":"Paragraph","list":"Bullet List","icon-list":"Icon List",
  "image":"Image","video":"Video / VSL",
  "icon":"Icon","icon-box":"Icon Box",
  "hero":"Hero","countdown-timer":"Countdown","testimonial":"Testimonial",
  "pricing-card":"Pricing","faq-accordion":"FAQ","stats-bar":"Stats Bar",
  "cta-button":"CTA Button","optin-form":"Signup Form","custom-html":"Custom HTML",
  "info-card":"Info Card",
};

export const ICONS: Partial<Record<BlockType, string[]>> = {
  "countdown-timer":["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z","M12 8v4l3 2"],
  "hero":           ["M3 4h18v7H3z","M6 15h7","M6 18h4"],
  "stats-bar":      ["M5 20V11","M12 20V4","M19 20v-7"],
  "video":          ["M3 5h18v14H3z","M10 9l5 3-5 3z"],
  "optin-form":     ["M4 6h16v12H4z","M4 10h16","M7 14h6"],
  "testimonial":    ["M5 4h14v11H9l-4 4z","M8 8h8","M8 11h5"],
  "faq-accordion":  ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z","M9.6 9a2.4 2.4 0 1 1 3 2.3c-.8.4-1 .8-1 1.5","M12 16h.01"],
  "headline":       ["M5 6h14","M12 6v12"],
  "body-text":      ["M5 6h14","M5 10h14","M5 14h9"],
  "list":           ["M9 6h11","M9 12h11","M9 18h11","M4.5 6h.01","M4.5 12h.01","M4.5 18h.01"],
  "icon-list":      ["M9 6h11","M9 12h11","M9 18h11","M5 6l-1.5 1.5L5 9","M5 12l-1.5 1.5L5 15","M5 18l-1.5 1.5L5 21"],
  "icon":           ["M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"],
  "icon-box":       ["M3 5h18v14H3z","M8 9h3v6H8z","M14 9h3","M14 13h2"],
  "image":          ["M3 5h18v14H3z","M3 16l5-5 4 4 3-3 6 6"],
  "cta-button":     ["M3 9h18v6H3z"],
  "pricing-card":   ["M6 3h9l3 3v15H6z","M9 9h6","M9 13h6","M9 17h4"],
  "divider":        ["M3 12h18"],
  "spacer":         ["M3 5h18","M3 19h18","M12 8v8"],
  "section":        ["M3 4h18v16H3z"],
  "row":            ["M4 4h7v16H4z","M13 4h7v16h-7z"],
  "column":         ["M4 4h16v16H4z"],
  "custom-html":    ["M10 20l4-16","M6.5 7.5l-4 4 4 4","M17.5 16.5l4-4-4-4"],
  "info-card":      ["M3 5h18v14H3z","M7 9h4","M7 13h8","M15 5v14"],
};

export const LIB_GROUPS: { group: string; types: BlockType[] }[] = [
  { group:"Layout",     types:["section","row","spacer","divider"] },
  { group:"Text",       types:["headline","body-text","list","icon-list"] },
  { group:"Media",      types:["image","video","icon"] },
  { group:"Conversion", types:["hero","optin-form","cta-button","countdown-timer","pricing-card","testimonial","stats-bar","faq-accordion"] },
  { group:"Cards",      types:["info-card","icon-box"] },
  { group:"Other",      types:["custom-html"] },
];

export function BlockIcon({ type, size = 16 }: { type: BlockType; size?: number }) {
  return <Icon paths={ICONS[type] ?? ["M4 4h16v16H4z"]} size={size} sw={1.7} />;
}
