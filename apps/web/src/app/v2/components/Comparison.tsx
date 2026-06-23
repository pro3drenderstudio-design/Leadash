"use client";

/**
 * Section 06 — The spec table.
 *
 * A typed, editorial comparison sheet. Three columns: feature, Leadash,
 * "the usual stack". No coloured checkmarks — restrained to the orange
 * accent on the Leadash column header and a subtle hairline indicator
 * (a thin line for "yes", an em-dash for "no"). This keeps the page in
 * the same tonal register as the rest of the redesign rather than
 * swerving into Saas-comparison-grid territory.
 *
 * Motion: rows fade up one at a time on viewport entry. Once the table
 * is in view, hovering a row highlights it with a quiet background tint.
 */

import { motion } from "motion/react";

type Row = { feature: string; leadash: boolean | string; others: boolean | string };

const ROWS: Row[] = [
  { feature: "Real lead research (not just titles)",   leadash: true,                       others: false },
  { feature: "Pitches written about the lead's work",  leadash: true,                       others: false },
  { feature: "Reply classification + queue",           leadash: true,                       others: false },
  { feature: "Inbox warmup built in",                  leadash: true,                       others: "add-on" },
  { feature: "Send from your own domain",              leadash: true,                       others: true },
  { feature: "Per-line reply-rate analytics",          leadash: true,                       others: "partial" },
  { feature: "Export your own data, any time",         leadash: true,                       others: "plan-gated" },
  { feature: "Pricing that fits a freelancer's books", leadash: "from $10",                 others: "$220+" },
];

export default function Comparison() {
  return (
    <section className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 64 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>06 — Spec sheet</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            What you actually get<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55 }}>
            Side by side with the typical multi-tool stack. No asterisks, no &ldquo;contact us&rdquo; gates.
          </p>
        </div>

        <div className="v2-spec-table" style={{ maxWidth: 880 }}>
          <div className="v2-spec-head">
            <span className="v2-spec-head-feature">Capability</span>
            <span className="v2-spec-head-leadash">Leadash</span>
            <span className="v2-spec-head-others">The usual stack</span>
          </div>

          {ROWS.map((row, i) => (
            <motion.div
              key={row.feature}
              className="v2-spec-row"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.04, duration: 0.5, ease: "easeOut" }}
            >
              <span className="v2-spec-feature">{row.feature}</span>
              <SpecCell value={row.leadash} positive />
              <SpecCell value={row.others} />
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

function SpecCell({ value, positive = false }: { value: boolean | string; positive?: boolean }) {
  if (value === true) {
    if (positive) {
      // Leadash column — orange check inside an accent-tinted disc.
      return (
        <span className="v2-spec-cell v2-spec-yes-accent" aria-label="Included">
          <span className="v2-spec-check">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        </span>
      );
    }
    // "The usual stack" column — keep restrained hairline mark.
    return (
      <span className="v2-spec-cell v2-spec-yes" aria-label="Included">
        <span aria-hidden className="v2-spec-line" />
      </span>
    );
  }
  if (value === false) {
    return <span className="v2-spec-cell v2-spec-no" aria-label="Not included">—</span>;
  }
  return (
    <span className={`v2-spec-cell v2-spec-text ${positive ? "v2-spec-text-accent" : ""}`}>
      {value}
    </span>
  );
}
