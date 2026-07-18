"use client";

/**
 * Landing v2 hero.
 *
 *  Type-led, single accent (orange period after "way."), Geist throughout —
 *  no mono. Two-column at >=lg, stacked under that.
 *
 *  Motion choreography:
 *   - Eyebrow fades in first (0.0s)
 *   - Headline words slide in word-by-word (0.15s start, 0.06s stagger)
 *   - Subhead + CTAs + trust row reveal in sequence
 *   - Radar on the right starts its GSAP loops as soon as it mounts
 *   - Scroll cue at the bottom drifts up on a 2s loop
 *
 *  Cursor spotlight: a low-opacity radial gradient that follows the cursor
 *  inside the hero block — adds quiet presence to an otherwise still page.
 */

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import HeroRadar from "./HeroRadar";

// Split the headline into words so we can stagger them. Last word
// ("way") gets an orange period appended via a wrapping span; "want"
// gets a comma. Both stay part of the headline element for layout.
const LINE_ONE = ["The", "work", "you", "want,"];
const LINE_TWO = ["Sent", "your"];

export default function Hero() {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cursor-following spotlight — pure DOM, no React state, so it stays at
  // 60fps without thrashing the React tree. The mouse position writes two
  // CSS custom properties; the gradient reads from them.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      el!.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
      el!.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    }
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section
      ref={wrapRef}
      className="v2-dotgrid relative overflow-hidden"
      style={{
        // Cursor spotlight — sits above the dot-grid, below the content.
        // Coordinates default to centre so it's never blank on mobile / no-hover devices.
        ["--spot-x" as string]: "50%",
        ["--spot-y" as string]: "35%",
      }}
    >
      {/* Cursor-following warm-glow spotlight. Two layers stacked: a tight,
          warmer orange tint at ~14% so you can actually feel it move, plus
          a broader cool white halo at ~4% that softens the surrounding void.
          Pure CSS — no React state, so it stays 60 fps even on slower laptops. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(280px circle at var(--spot-x) var(--spot-y), rgba(249,115,22,0.14), transparent 70%), " +
            "radial-gradient(640px circle at var(--spot-x) var(--spot-y), rgba(255,255,255,0.04), transparent 70%)",
          transition: "background-position 200ms linear",
        }}
      />

      <div className="v2-container relative pt-28 pb-24 lg:pt-36 lg:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 lg:gap-16 items-center">

          {/* ── Left column: type-led content ── */}
          <div>
            <motion.p
              className="v2-eyebrow mb-6"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              01 — Introducing Leadash
            </motion.p>

            <h1 className="v2-display mb-6">
              {/* Line 1: "The work you want," — comma after the last word */}
              <span className="block">
                {LINE_ONE.map((word, i) => (
                  <motion.span
                    key={`l1-${i}`}
                    className="inline-block whitespace-pre"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {word}{i < LINE_ONE.length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </span>
              {/* Line 2: "Sent your way." — orange period replaces white period */}
              <span className="block">
                {LINE_TWO.map((word, i) => (
                  <motion.span
                    key={`l2-${i}`}
                    className="inline-block whitespace-pre"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {word}{i < LINE_TWO.length - 1 ? " " : ""}
                  </motion.span>
                ))}
                <motion.span
                  key="way-word"
                  className="inline-block"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                  {" "}way
                </motion.span>
                {/* Period — orange, animates in last for a "stamp" feel */}
                <motion.span
                  className="inline-block"
                  style={{ color: "var(--v2-accent)" }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.85, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  .
                </motion.span>
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95, duration: 0.6, ease: "easeOut" }}
              style={{
                color:        "var(--v2-text-muted)",
                fontSize:     "var(--v2-body-l)",
                lineHeight:   1.55,
                maxWidth:     420,
                marginBottom: 32,
              }}
            >
              Cold email that fills your calendar with the kind of clients you actually want to work with — without sounding like a pitch.
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.5, ease: "easeOut" }}
            >
              <a href="/signup" className="v2-btn v2-btn-primary">
                Get Started
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </a>
              <a href="#how" className="v2-btn v2-btn-ghost">See how it works</a>
            </motion.div>

            <motion.div
              className="v2-trust-row mt-7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.6, ease: "easeOut" }}
            >
              <span>NO CREDIT CARD</span>
              <span className="dot">·</span>
              <span>FREE TO START</span>
              <span className="dot">·</span>
              <span>PAY AS YOU GROW</span>
            </motion.div>
          </div>

          {/* ── Right column: animated radar SVG ── */}
          <motion.div
            className="flex items-center justify-center lg:justify-end"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <HeroRadar />
          </motion.div>
        </div>

        {/* ── Centred scroll cue ── */}
        <motion.div
          className="mt-24 lg:mt-28 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.8 }}
        >
          <motion.a
            href="#signature"
            className="v2-scroll-cue inline-flex items-center gap-2"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <span aria-hidden>↓</span>
            <span>watch a pitch find its target</span>
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
