"use client";

/**
 * Section 03 — Who it's for.
 *
 * Three persona cards. Each card has a quiet headline + tagline by default;
 * on hover (and on focus for keyboard users) it reveals a sample first line
 * of a pitch that Leadash would actually write for that persona. The card
 * also reveals a small list of "what we listen for" — the kinds of signals
 * the platform tracks for them.
 *
 * Motion: cards rise in on view with a small stagger. The hover state uses
 * pure CSS — opacity + translate on the inner reveal block — so the
 * interaction stays at 60 fps on lower-end laptops.
 *
 * Design intent: this is the section where the reader sees themselves on
 * the page. Personas are written as roles a freelancer actually identifies
 * with, not market-research labels.
 */

import { motion } from "motion/react";

type Persona = {
  id: string;
  label: string;       // small eyebrow above the card
  title: string;       // the headline a reader self-identifies with
  tagline: string;     // one-line elaboration
  samplePitch: string; // a real opening line we'd write for them
  signals: string[];   // 3 signals we listen for
};

const PERSONAS: Persona[] = [
  {
    id: "designers",
    label: "01 / Designers & studios",
    title: "Brand, web, product designers",
    tagline: "Independent designers and small studios shipping work for clients who care about craft.",
    samplePitch: "Loved the typography choices on the Lighthouse rebrand — exactly the kind of restraint I find rare.",
    signals: [
      "Recent rebrand or product launch",
      "Active on Dribbble, Are.na, or X",
      "Studio of 1–6 with retainer clients",
    ],
  },
  {
    id: "developers",
    label: "02 / Developers & consultants",
    title: "Engineers running their own bench",
    tagline: "Solo developers, fractional CTOs, and small dev shops who'd rather code than chase intro calls.",
    samplePitch: "Saw your write-up on migrating Rails 7 → 8 in production — that footnote on Sidekiq deadlocks alone was worth the read.",
    signals: [
      "Public GitHub activity / open-source",
      "Technical blog or talks",
      "Stack overlaps with the prospect's",
    ],
  },
  {
    id: "advisors",
    label: "03 / Coaches, writers, strategists",
    title: "Knowledge workers selling outcomes",
    tagline: "Coaches, content strategists, growth advisors — anyone whose product is judgment and a calendar.",
    samplePitch: "Your essay on writing for asynchronous teams has been quietly making the rounds in our Slack — wanted to actually pay you back for it.",
    signals: [
      "Long-form publishing cadence",
      "Audience signals (subs, replies, shares)",
      "Mentions of bandwidth or hiring",
    ],
  },
];

export default function Personas() {
  return (
    <section id="personas" className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 80 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>03 — Who it&apos;s for</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Built for the people<br/>doing the work<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55 }}>
            Not for outbound teams of forty. For the person who&apos;d rather spend the morning making the thing than writing a pitch about it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PERSONAS.map((p, i) => (
            <motion.article
              key={p.id}
              className="v2-persona-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="v2-persona-front">
                <p className="v2-persona-label">{p.label}</p>
                <h3 className="v2-persona-title">{p.title}</h3>
                <p className="v2-persona-tag">{p.tagline}</p>
              </div>

              <div className="v2-persona-reveal">
                <p className="v2-persona-reveal-label">A real first line</p>
                <p className="v2-persona-quote">&ldquo;{p.samplePitch}&rdquo;</p>

                <p className="v2-persona-reveal-label" style={{ marginTop: 22 }}>What we listen for</p>
                <ul className="v2-persona-signals">
                  {p.signals.map(s => (
                    <li key={s}>
                      <span aria-hidden className="v2-persona-bullet" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>

      </div>
    </section>
  );
}
