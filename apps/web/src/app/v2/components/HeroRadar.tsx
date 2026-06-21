"use client";

/**
 * Hero radar. Three concentric rings ripple outward continuously; the
 * "inbound" trail rotates origin every cycle so it depicts multiple jobs
 * arriving at the centre from different directions over time.
 *
 * Why a queue of origins instead of one fixed point: a single repeating
 * trail reads as a heartbeat (predictable). Cycling six positions on the
 * outer ring sells the *multiplicity* of inbound work — exactly the "sent
 * your way" promise the hero is making.
 *
 * The cycle:
 *   1. Pick next origin from ORIGINS[]
 *   2. Update the path's d to "M origin.x origin.y L 120 120"
 *   3. Reset stroke-dashoffset to the path length, then animate it to 0
 *      while the inbound dot drifts from origin to centre
 *   4. Fade origin marker + dot out as they arrive
 *   5. Brief pause, then advance to the next origin
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";

// Origins picked around the outer ring at varied angles + radii so the
// rotation feels organic, never metronomic. Each is a point near (or on)
// the r=100 outer ring relative to the centre (120, 120).
const ORIGINS: Array<{ x: number; y: number }> = [
  { x: 178, y: 172 },  // SE
  { x: 68,  y: 56  },  // NW
  { x: 200, y: 90  },  // ENE
  { x: 58,  y: 180 },  // SW
  { x: 100, y: 24  },  // N-ish (slightly W of true N)
  { x: 214, y: 144 },  // E-SE
  { x: 190, y: 58  },  // NE
  { x: 40,  y: 132 },  // W
];

const CENTER = { x: 120, y: 120 };
const DRAW_DURATION = 1.6;   // seconds: trail draw-in + dot travel
const HOLD_AT_END   = 0.35;  // brief pause after arrival
const FADE_OUT      = 0.5;   // seconds: trail + origin marker fade
const GAP_BEFORE_NEXT = 0.6; // beat before the next origin starts

export default function HeroRadar() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const ctx = gsap.context(() => {
      // Continuous outer ring ripple — unchanged from v1.
      gsap.to(".v2-radar-ring", {
        scale: 1.18,
        opacity: 0,
        duration: 3.6,
        ease: "power2.out",
        stagger: { each: 1.2, repeat: -1 },
        transformOrigin: "120px 120px",
      });

      // Centre marker subtle breathing.
      gsap.to(".v2-radar-core", {
        scale: 1.08,
        duration: 1.6,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        transformOrigin: "120px 120px",
      });

      // Ambient floating dots.
      gsap.to(".v2-radar-ambient", {
        y: "+=4",
        duration: 4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: { each: 0.6, from: "random" },
      });

      // ── Cycling inbound trail ────────────────────────────────────────────
      const trail   = svgRef.current!.querySelector<SVGPathElement>(".v2-radar-trail");
      const dot     = svgRef.current!.querySelector<SVGCircleElement>(".v2-radar-inbound");
      const origin  = svgRef.current!.querySelector<SVGCircleElement>(".v2-radar-origin");
      if (!trail || !dot || !origin) return;

      let index = 0;
      const tl = gsap.timeline({ repeat: -1 });

      ORIGINS.forEach(() => {
        tl.call(() => {
          // Each cycle: pick the next origin, redraw the path geometry, reset stroke-dash for the draw-in effect.
          const o = ORIGINS[index % ORIGINS.length];
          index += 1;

          trail.setAttribute("d", `M ${o.x} ${o.y} L ${CENTER.x} ${CENTER.y}`);
          const len = trail.getTotalLength();
          trail.style.strokeDasharray  = `${len}`;
          trail.style.strokeDashoffset = `${len}`;
          trail.setAttribute("opacity", "1");

          origin.setAttribute("cx", `${o.x}`);
          origin.setAttribute("cy", `${o.y}`);
          gsap.set(origin, { opacity: 1, scale: 1, transformOrigin: `${o.x}px ${o.y}px` });

          dot.setAttribute("cx", `${o.x}`);
          dot.setAttribute("cy", `${o.y}`);
          gsap.set(dot, { opacity: 1 });
        });

        // Trail draws from origin → centre while the dot travels along it.
        tl.to(trail, {
          strokeDashoffset: 0,
          duration: DRAW_DURATION,
          ease: "power2.out",
        }, ">");
        tl.to(dot, {
          attr: { cx: CENTER.x, cy: CENTER.y },
          duration: DRAW_DURATION,
          ease: "power2.out",
        }, "<");

        // Origin marker shrinks as if the opportunity has been "consumed".
        tl.to(origin, {
          scale: 0,
          opacity: 0,
          duration: DRAW_DURATION * 0.8,
          ease: "power2.in",
        }, "<");

        // Brief hold at centre — a beat of impact.
        tl.to({}, { duration: HOLD_AT_END });

        // Fade out the trail + arrival dot, ready for the next origin.
        tl.to([trail, dot], {
          opacity: 0,
          duration: FADE_OUT,
          ease: "power2.in",
        });
        tl.to({}, { duration: GAP_BEFORE_NEXT });
      });
    }, svgRef);

    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={svgRef}
      width="280"
      height="280"
      viewBox="0 0 240 240"
      role="img"
      aria-label="A radar illustration showing opportunities arriving at the centre from multiple directions"
    >
      <line x1="0"   y1="120" x2="240" y2="120" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      <line x1="120" y1="0"   x2="120" y2="240" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />

      <circle className="v2-radar-ring" cx="120" cy="120" r="44"  fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.75" />
      <circle className="v2-radar-ring" cx="120" cy="120" r="72"  fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.75" />
      <circle className="v2-radar-ring" cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />

      {/* Static outermost ring keeps the rippling rings visually anchored. */}
      <circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

      {/* Cardinal direction ticks */}
      <circle cx="120" cy="20"  r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="220" cy="120" r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="120" cy="220" r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="20"  cy="120" r="2" fill="rgba(255,255,255,0.10)" />

      {/* Ambient dots — different in-flight opportunities the user hasn't acted on yet. */}
      <circle className="v2-radar-ambient" cx="156" cy="46"  r="2.5" fill="rgba(245,245,247,0.5)" />
      <circle className="v2-radar-ambient" cx="48"  cy="86"  r="2"   fill="rgba(154,154,168,0.55)" />
      <circle className="v2-radar-ambient" cx="208" cy="186" r="2.5" fill="rgba(245,245,247,0.45)" />
      <circle className="v2-radar-ambient" cx="84"  cy="208" r="2"   fill="rgba(154,154,168,0.5)" />

      {/* Active origin marker — rendered at the current cycle's origin point. */}
      <circle className="v2-radar-origin" cx="178" cy="172" r="3.5" fill="rgba(245,245,247,0.85)" />

      {/* Inbound trail — d attribute is rewritten each cycle by the GSAP timeline. */}
      <path
        className="v2-radar-trail"
        d="M 178 172 L 120 120"
        stroke="#F97316"
        strokeWidth="0.75"
        strokeDasharray="2 3"
        fill="none"
      />

      {/* Travelling dot — animated along the trail each cycle. */}
      <circle className="v2-radar-inbound" cx="178" cy="172" r="2.5" fill="#F97316" />

      {/* Focal point */}
      <circle className="v2-radar-core" cx="120" cy="120" r="10" fill="#F97316" />
      <circle cx="120" cy="120" r="4" fill="#07070A" />
    </svg>
  );
}
