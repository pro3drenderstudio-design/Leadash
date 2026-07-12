/**
 * Stroke icon set — paths lifted from the design prototype
 * (handoff_mobile_app/Leadash Mobile App.dc.html).
 */
import React from "react";
import Svg, { Path } from "react-native-svg";

const PATHS: Record<string, string[]> = {
  home:     ["M4 11l8-7 8 7", "M6 10v9h12v-9"],
  campaign: ["M4 6h16v13H4z", "M4 10h16", "M9 14h6"],
  inbox:    ["M3 8l9 6 9-6", "M3 8v10h18V8"],
  server:   ["M4 5h16v6H4z", "M4 13h16v6H4z", "M7 8h.01", "M7 16h.01"],
  bell:     ["M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z", "M10 19a2 2 0 0 0 4 0"],
  chevR:    ["M9 6l6 6-6 6"],
  chevL:    ["M15 18l-6-6 6-6"],
  star:     ["M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9z"],
  check:    ["M5 12l4 4 10-10"],
  warn:     ["M12 9v4", "M12 17h.01", "M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
  send:     ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  ai:       ["M12 2l1.8 4.6L18 8l-4.2 1.4L12 14l-1.8-4.6L6 8l4.2-1.4z", "M19 15l.9 2.3L22 18l-2.1.7L19 21l-.9-2.3L16 18l2.1-.7z"],
  mail:     ["M3 6h18v12H3z", "M3 6l9 7 9-7"],
  flame:    ["M12 2c1.5 3 5 5 5 10a5 5 0 0 1-10 0c0-1.7.8-2.8 1.6-3.8.3 2 1.8 2.8 1.8 2.8-.6-2.6.5-5 1.6-9z"],
  pause:    ["M8 5h3v14H8z", "M13 5h3v14h-3z"],
  play:     ["M7 4l13 8-13 8z"],
  gear:     ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M19 12a7 7 0 0 0-.15-1.5l2-1.5-2-3.5-2.3 1a7 7 0 0 0-2.6-1.5L13.5 2h-3l-.45 2.5a7 7 0 0 0-2.6 1.5l-2.3-1-2 3.5 2 1.5A7 7 0 0 0 3 12a7 7 0 0 0 .15 1.5l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 2.6 1.5L10.5 22h3l.45-2.5a7 7 0 0 0 2.6-1.5l2.3 1 2-3.5-2-1.5A7 7 0 0 0 19 12z"],
  shield:   ["M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z", "M9 12l2 2 4-4"],
  academy:  ["M22 9L12 4 2 9l10 5 10-5z", "M6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5"],
  lock:     ["M6 10V8a6 6 0 0 1 12 0v2", "M5 10h14v10H5z"],
  trophy:   ["M8 4h8v5a4 4 0 0 1-8 0z", "M8 4H4v2a4 4 0 0 0 4 4", "M16 4h4v2a4 4 0 0 1-4 4", "M12 13v4", "M8 21h8", "M9 17h6v4H9z"],
  camera:   ["M4 8h3l2-3h6l2 3h3v12H4z", "M12 12a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"],
  chart:    ["M4 19V9", "M10 19V5", "M16 19v-7", "M22 19H2"],
  clock:    ["M12 8v4l3 2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, color = "#F5F5F7", strokeWidth = 1.8, fill = false }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: boolean;
}) {
  const paths = PATHS[name] ?? [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={fill ? undefined : color}
          fill={fill ? color : "none"}
          strokeWidth={fill ? 0 : strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
