"use client";

/**
 * The radar SVG that lives on the right of the v2 hero. Quiet by default
 * (3 concentric rings + a center marker + 4 ambient dots) and comes alive
 * via GSAP on mount: rings ripple outward in a 3.6s loop, an "inbound"
 * dashed path redraws toward the center every 4.8s, the trailing dot eases
 * in to land on the focal point.
 *
 * Every animatable element gets a stable className so the GSAP timeline
 * can target it without ref-juggling across server/client boundaries.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function HeroRadar() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const ctx = gsap.context(() => {
      // Continuous ripple — three rings expanding outward on a loop. Each
      // ring fades as it grows so the eye reads "broadcast" rather than
      // "circle gets bigger".
      gsap.to(".v2-radar-ring", {
        scale: 1.18,
        opacity: 0,
        duration: 3.6,
        ease: "power2.out",
        stagger: { each: 1.2, repeat: -1 },
        transformOrigin: "120px 120px",
      });

      // Center marker subtle breathing — keeps the focal point alive without
      // dragging the eye.
      gsap.to(".v2-radar-core", {
        scale: 1.08,
        duration: 1.6,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        transformOrigin: "120px 120px",
      });

      // Inbound dashed trail — redraws toward the centre every 4.8s. The
      // strokeDashoffset trick gives the "drawn-on" effect; pairing it with
      // a moving dot makes it read as motion toward you.
      const trail   = svgRef.current!.querySelector<SVGPathElement>(".v2-radar-trail");
      const trailLn = trail?.getTotalLength() ?? 0;
      if (trail && trailLn > 0) {
        trail.style.strokeDasharray  = `${trailLn}`;
        trail.style.strokeDashoffset = `${trailLn}`;
        gsap.to(trail, {
          strokeDashoffset: 0,
          duration: 1.8,
          ease: "power2.out",
          repeat: -1,
          repeatDelay: 3,
        });
      }

      // Tiny inbound dot riding the trail.
      gsap.fromTo(
        ".v2-radar-inbound",
        { attr: { cx: 178, cy: 172 }, opacity: 0 },
        {
          attr: { cx: 120, cy: 120 },
          opacity: 1,
          duration: 1.8,
          ease: "power2.out",
          repeat: -1,
          repeatDelay: 3,
        },
      );

      // Ambient dots — quiet float so the composition never feels frozen.
      gsap.to(".v2-radar-ambient", {
        y: "+=4",
        duration: 4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: { each: 0.6, from: "random" },
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
      aria-label="A radar illustration showing opportunities arriving at a centre point"
    >
      {/* Crosshair axis */}
      <line x1="0"   y1="120" x2="240" y2="120" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      <line x1="120" y1="0"   x2="120" y2="240" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />

      {/* Three concentric rings — animated to ripple outward. */}
      <circle className="v2-radar-ring" cx="120" cy="120" r="44" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.75" />
      <circle className="v2-radar-ring" cx="120" cy="120" r="72" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.75" />
      <circle className="v2-radar-ring" cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />

      {/* Static outermost compass ring — fixed reference frame so the rippling rings have something to bloom from. */}
      <circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

      {/* Cardinal direction ticks */}
      <circle cx="120" cy="20"  r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="220" cy="120" r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="120" cy="220" r="2" fill="rgba(255,255,255,0.10)" />
      <circle cx="20"  cy="120" r="2" fill="rgba(255,255,255,0.10)" />

      {/* Ambient opportunity dots — pre-revealed cards. */}
      <circle className="v2-radar-ambient" cx="190" cy="58"  r="3"   fill="rgba(245,245,247,0.55)" />
      <circle className="v2-radar-ambient" cx="58"  cy="180" r="2.5" fill="rgba(154,154,168,0.6)" />
      <circle className="v2-radar-ambient" cx="178" cy="172" r="3.5" fill="rgba(245,245,247,0.85)" />
      <circle className="v2-radar-ambient" cx="68"  cy="56"  r="2"   fill="rgba(154,154,168,0.55)" />

      {/* Inbound trail and travelling dot — the "sent your way" gesture. */}
      <path
        className="v2-radar-trail"
        d="M 178 172 L 120 120"
        stroke="#F97316"
        strokeWidth="0.75"
        strokeDasharray="2 3"
        fill="none"
      />
      <circle className="v2-radar-inbound" cx="178" cy="172" r="2.5" fill="#F97316" />

      {/* Focal point — outer marker + inner cutout for a "bullseye" feel. */}
      <circle className="v2-radar-core" cx="120" cy="120" r="10" fill="#F97316" />
      <circle cx="120" cy="120" r="4" fill="#07070A" />
    </svg>
  );
}
