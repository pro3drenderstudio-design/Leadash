"use client";

/**
 * Section 05 — What it replaces.
 *
 * The pitch in visual form: three tool logotypes on the left, an arrow,
 * and the Leadash mark on the right. The three tools are written as their
 * generic categories — Prospecting, Sending, Warmup — so we don't trade
 * on competitor brands directly, but the shape reads as "stack
 * consolidation" instantly.
 *
 * Motion: on viewport entry, the three left tiles slide in from the left
 * with a small stagger; the connector lines draw themselves with a
 * stroke-dashoffset tween; the right card eases in. Doing this with
 * `motion` rather than scroll-scrub because this is a single moment of
 * arrival, not a scroll story.
 */

import { motion } from "motion/react";

const REPLACED = [
  { name: "Prospecting tool", price: "$99–$249", desc: "Apollo, Clay, ZoomInfo. Lead lists, enrichment, filters." },
  { name: "Sending platform", price: "$97–$300", desc: "Instantly, Smartlead, Lemlist. Sequences, sending, inbox rotation." },
  { name: "Warmup service",   price: "$24–$98",  desc: "Mailwarm, Warmy. Reputation, deliverability monitoring." },
];

export default function StackReplacement() {
  return (
    <section className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 80 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>05 — What it replaces</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Three subscriptions,<br/>one bill<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55 }}>
            The average outbound stack runs $220–$650 a month across three tools that don&apos;t quite talk to each other. Leadash is one of them.
          </p>
        </div>

        <div className="v2-stack-stage">

          {/* Left column: three replaced tools */}
          <div className="v2-stack-left">
            {REPLACED.map((r, i) => (
              <motion.div
                key={r.name}
                className="v2-stack-tile"
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="v2-stack-tile-name">{r.name}</span>
                  <span className="v2-stack-tile-price">{r.price}</span>
                </div>
                <p className="v2-stack-tile-desc">{r.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Centre: connector + arrow */}
          <div className="v2-stack-bridge" aria-hidden>
            <motion.svg
              className="v2-stack-bridge-svg"
              viewBox="0 0 200 240"
              fill="none"
              preserveAspectRatio="none"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
            >
              {/* Three lines fanning out from the right to each left tile centre */}
              {[40, 120, 200].map((y, i) => (
                <motion.path
                  key={y}
                  d={`M 0 ${y} C 80 ${y}, 120 120, 200 120`}
                  stroke="var(--v2-border-strong)"
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ delay: 0.3 + i * 0.12, duration: 0.9, ease: "easeOut" }}
                />
              ))}
              {/* Arrow head landing on the right side */}
              <motion.path
                d="M 188 114 L 200 120 L 188 126"
                stroke="var(--v2-accent)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: 1.0, duration: 0.4 }}
              />
            </motion.svg>
          </div>

          {/* Right: Leadash card */}
          <motion.div
            className="v2-stack-right"
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" aria-hidden style={{ width: 40, height: 40, marginBottom: 18 }} />
            <p className="v2-stack-right-name">Leadash</p>
            <p className="v2-stack-right-price">From $29/mo</p>
            <p className="v2-stack-right-desc">Prospecting, sending, warmup, reply triage — one workspace, one bill, one mental model.</p>
          </motion.div>

        </div>

      </div>
    </section>
  );
}
