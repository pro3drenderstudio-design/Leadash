"use client";

/**
 * Section 07 — Two quotes.
 *
 * Pulled from the existing testimonials and trimmed to two — the ones
 * that speak most directly to the freelancer/independent-operator
 * persona (replacing a stack, running multiple campaigns solo).
 *
 * No stars, no avatars-as-decoration. Just the quote, the name, and
 * what they do. Letting the words carry the weight is more in keeping
 * with the rest of the page than a row of five amber stars.
 *
 * Motion: each quote rises in on viewport entry with a 100ms offset
 * between them. A faint orange opening mark sits before each quote — a
 * tiny visual hook without resorting to a hero quote-mark cliché.
 */

import { motion } from "motion/react";

type Quote = {
  body: string;
  name: string;
  role: string;
};

const QUOTES: Quote[] = [
  {
    body: "I replaced three tools — a scraper, a verifier, and a sender — with Leadash. Reply rate went from 2% to 11% in the first month. The personalization is actually personal, not mail-merge.",
    name: "Marcus Chen",
    role: "Brand strategist, independent",
  },
  {
    body: "I run a one-person outbound studio for a handful of retainer clients. Leadash lets me keep 20 campaigns warm without a team. The reply triage alone saves me three hours a day I used to spend sorting inbox.",
    name: "Priya Nair",
    role: "Founder, Outbound Studio",
  },
];

export default function Quotes() {
  return (
    <section className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 72 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>07 — From people doing the work</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Two notes worth<br/>quoting<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {QUOTES.map((q, i) => (
            <motion.figure
              key={q.name}
              className="v2-quote-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <span aria-hidden className="v2-quote-mark">&ldquo;</span>
              <blockquote className="v2-quote-body">{q.body}</blockquote>
              <figcaption className="v2-quote-cite">
                <span className="v2-quote-name">{q.name}</span>
                <span className="v2-quote-role">{q.role}</span>
              </figcaption>
            </motion.figure>
          ))}
        </div>

      </div>
    </section>
  );
}
