"use client";

/**
 * Section 04 — Capabilities.
 *
 * Six cards arranged in a 3 × 2 grid (1 column on mobile). Each card is a
 * single tightly-written capability — what Leadash actually does for the
 * freelancer reading the page, not a feature list.
 *
 * Visual rhythm:
 *   - The first card spans two columns at lg and has a small inline SVG
 *     diagram (sender → inbox → reply loop) so the section opens with a
 *     visual hook rather than a wall of text.
 *   - The remaining five are equal-weight text cards with a numbered chip
 *     and a tight 2-line description.
 *
 * Motion: scroll-in stagger on viewport entry. Hover gives each card a
 * single-pixel lift + a barely-there border brighten. Nothing flashy —
 * the page's voice is "quiet competence", not "look what we can do".
 */

import { motion } from "motion/react";

type Capability = {
  num: string;
  title: string;
  body: string;
};

const CAPABILITIES: Capability[] = [
  {
    num: "02",
    title: "Find people who'd actually hire you",
    body: "Filter prospects by what they ship, not just where they work. Recent launches, hiring signals, stack overlap, content output — the things that mean a real opening exists.",
  },
  {
    num: "03",
    title: "Write a real opening line, not a template",
    body: "Each pitch is keyed off something specific — a project, a post, a hire. The lead reads it and asks how you knew. The honest answer: you actually looked.",
  },
  {
    num: "04",
    title: "Send from your own inbox, warmed properly",
    body: "Your Gmail, Outlook, or domain. We handle reputation in the background — gradual ramp, peer-to-peer warmup, no shortcuts that get flagged later.",
  },
  {
    num: "05",
    title: "Stop the moment they reply",
    body: "Replies are classified the second they land. Interested goes to a queue you can read in two minutes. Out-of-office pauses the thread. Unsubscribes are honoured.",
  },
  {
    num: "06",
    title: "See what worked, drop what didn't",
    body: "Per-line reply-rate tracking. Subject A vs B without rebuilding a sequence. The data is yours — exportable, queryable, no lock-in.",
  },
];

export default function Capabilities() {
  return (
    <section id="how" className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 80 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>04 — How it works</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            One platform. Six things<br/>worth getting right<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55 }}>
            Every part of the outbound loop — find, write, send, listen, learn — done in one place so you stop stitching tools together at midnight.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 v2-caps">

          {/* Hero card — spans 2 columns at lg, contains the flow diagram. */}
          <motion.article
            className="v2-cap-card v2-cap-hero lg:col-span-2"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="v2-cap-chip">01 — The loop</div>
            <h3 className="v2-cap-title" style={{ fontSize: "var(--v2-headline)" }}>
              From a name on a list to a reply in your inbox.
            </h3>
            <p className="v2-cap-body" style={{ marginBottom: 28 }}>
              Five steps, one platform, none of the stitching.
            </p>

            <CapabilityFlow />
          </motion.article>

          {CAPABILITIES.map((c, i) => (
            <motion.article
              key={c.num}
              className="v2-cap-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.08 + i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="v2-cap-chip">{c.num}</div>
              <h3 className="v2-cap-title">{c.title}</h3>
              <p className="v2-cap-body">{c.body}</p>
            </motion.article>
          ))}

          {/* Bottom-row anchor — mirrors the hero card's 2-column span at lg,
              so the grid closes symmetrically (1-2-1-2 instead of trailing
              empty cells). Larger type, a small inline accent rule, no chip:
              reads like a closing remark rather than another feature card. */}
          <motion.article
            className="v2-cap-card v2-cap-anchor lg:col-span-2"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="v2-cap-chip">07 — The whole loop, owned</div>
            <h3 className="v2-cap-title" style={{ fontSize: "var(--v2-headline)" }}>
              Control your entire pipeline from one place.
            </h3>
            <p className="v2-cap-body" style={{ maxWidth: 560 }}>
              Find, write, send, listen, learn — every step of outbound under one workspace, one login, one mental model. No spreadsheets in the loop, no late-night CSV exports, no &quot;wait, which tool had that lead?&quot;
            </p>
            <span aria-hidden className="v2-cap-anchor-rule" />
          </motion.article>

        </div>

      </div>
    </section>
  );
}

/**
 * Inline flow diagram — a horizontal pipeline with 5 nodes connected by
 * hairlines. Pure SVG so we get crisp rendering at any DPR. The orange
 * accent on the middle node ("Write") quietly tells the reader where the
 * AI does the heavy lifting.
 */
function CapabilityFlow() {
  const steps = [
    { label: "Find",   sub: "filter signals" },
    { label: "Write",  sub: "real first line" },
    { label: "Send",   sub: "your inbox" },
    { label: "Listen", sub: "classify reply" },
    { label: "Learn",  sub: "drop, double down" },
  ];

  return (
    <div className="v2-cap-flow">
      {steps.map((s, i) => (
        <div key={s.label} className="v2-cap-flow-step">
          <div className="v2-cap-flow-node">
            <span>{String(i + 1).padStart(2, "0")}</span>
          </div>
          <p className="v2-cap-flow-label">{s.label}</p>
          <p className="v2-cap-flow-sub">{s.sub}</p>
          {i < steps.length - 1 && <span aria-hidden className="v2-cap-flow-arrow">→</span>}
        </div>
      ))}
    </div>
  );
}
