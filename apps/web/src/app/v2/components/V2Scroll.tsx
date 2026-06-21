"use client";

/**
 * Mounts Lenis smooth-scroll for the v2 surface and synchronizes it with
 * GSAP ScrollTrigger so the pinned signature moment keeps working as
 * expected.
 *
 * Also renders the thin top-of-page progress bar (orange accent) that
 * reads scroll position from Lenis. Doing it in one component avoids
 * having two RAF loops competing on the same scroll source.
 *
 * Accessibility:
 *   - Respects `prefers-reduced-motion`. If the user has reduced motion
 *     enabled, Lenis is not mounted at all (native scrolling remains),
 *     the progress bar still works via the standard scroll event, and
 *     no smoothing or wheel-multiplier kicks in.
 *
 * Why no state for the bar: writing the width via a CSS custom property
 * on the bar's ref keeps the React tree out of the scroll path —
 * effectively zero overhead per frame.
 */

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function V2Scroll() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bar = barRef.current;

    // Shared progress writer — keeps the bar's DOM update off React's
    // critical path. Reads from window.scrollY because that's the source
    // of truth whether Lenis is mounted or not.
    const updateBar = () => {
      if (!bar) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${ratio})`;
    };

    if (prefersReduced) {
      // No Lenis — native scrolling. Still drive the progress bar from a
      // plain scroll listener so the visual cue is consistent.
      window.addEventListener("scroll", updateBar, { passive: true });
      updateBar();
      return () => window.removeEventListener("scroll", updateBar);
    }

    // ── Lenis setup ────────────────────────────────────────────────────
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // gentle ease-out expo
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.2,
    });

    // Drive ScrollTrigger from Lenis's scroll event so the signature
    // moment's pinned + scrubbed timeline reads the smoothed offset
    // instead of the raw wheel position.
    lenis.on("scroll", () => {
      ScrollTrigger.update();
      updateBar();
    });

    // Lenis wants its own RAF loop. GSAP's ticker is the natural place
    // to drive it from — keeps everything on one frame source so we
    // never get jitter from competing RAFs.
    const tickerFn = (time: number) => {
      lenis.raf(time * 1000); // gsap.ticker passes seconds
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0); // disable lag smoothing — Lenis prefers fixed step

    // Expose the lenis instance so smooth-scroll-to-anchor links can use
    // it without re-creating the singleton.
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    // First paint
    updateBar();

    return () => {
      gsap.ticker.remove(tickerFn);
      gsap.ticker.lagSmoothing(1000, 16); // restore default
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return (
    <div
      ref={barRef}
      className="v2-progress-bar"
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "var(--v2-accent)",
        transformOrigin: "left center",
        transform: "scaleX(0)",
        zIndex: 100,
        pointerEvents: "none",
        willChange: "transform",
      }}
    />
  );
}
