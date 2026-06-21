/**
 * Dynamic OpenGraph image for the root landing.
 *
 * Renders at build time (and on demand) via Next.js's ImageResponse. Same
 * palette as the page: deep void background, a faint dot grid, headline
 * in white, the period in orange. Sized to the canonical 1200×630 used
 * by every major social platform.
 *
 * Keeping the SVG simple — ImageResponse runs in the edge runtime and
 * can't load arbitrary fonts/effects, so we stay in inline-svg + plain
 * CSS territory.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Leadash — The work you want, sent your way";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(ellipse 70% 50% at 35% 40%, rgba(249,115,22,0.10), transparent 60%), #07070A",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          color: "#F5F5F7",
          position: "relative",
        }}
      >
        {/* Top row — wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "#F97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#07070A",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "-0.04em",
            }}
          >
            L
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#F5F5F7",
            }}
          >
            Leadash
          </div>
        </div>

        {/* Headline — same words and accent as the live hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            fontSize: 108,
            fontWeight: 500,
            color: "#F5F5F7",
          }}
        >
          <div>The work you want<span style={{ color: "#F97316" }}>,</span></div>
          <div>sent your way<span style={{ color: "#F97316" }}>.</span></div>
        </div>

        {/* Bottom row — strapline + trust */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
          }}
        >
          <div style={{ color: "#9A9AA8", maxWidth: 720, letterSpacing: "-0.005em" }}>
            Cold email that fills your calendar with the kind of clients you actually want to work with.
          </div>
          <div
            style={{
              color: "#5B5B68",
              fontSize: 14,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            leadash.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
