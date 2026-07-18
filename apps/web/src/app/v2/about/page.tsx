/**
 * /v2/about — restyled to v2 design language.
 *
 * One quiet page: who built this, why, and what it stands for. No stats
 * bar full of fake numbers, no team grid with stock portraits. Just
 * three short blocks of writing.
 */

import "../v2.css";
import Link from "next/link";
import V2Nav from "../components/V2Nav";
import V2Scroll from "../components/V2Scroll";
import Footer from "../components/Footer";

export const metadata = {
  title: "About — Leadash",
  description: "Why we built Leadash and what it stands for.",
};

const PRINCIPLES = [
  {
    title: "Speed without noise",
    body: "Every minute spent stitching tools together is a minute not spent on the work that pays. Leadash collapses the loop so the boring parts disappear.",
  },
  {
    title: "Deliverability first",
    body: "A pitch that lands in spam is worth nothing. Warmup, reputation, bounce handling — all built into the core, not bolted on as paid add-ons.",
  },
  {
    title: "Transparent pricing",
    body: "No per-seat tax, no hidden caps, no \"contact us\" gating. The numbers on the pricing page are the numbers on your invoice.",
  },
  {
    title: "Real humans on support",
    body: "When something breaks we answer, fix it, and tell you why. No tier-one outsourcing, no script. The team building the product is the team answering the email.",
  },
];

export default function AboutPage() {
  return (
    <div className="v2 min-h-screen">
      <V2Scroll />
      <V2Nav />

      <main>
        <section className="v2-dotgrid relative overflow-hidden">
          <div className="v2-container" style={{ paddingTop: 200, paddingBottom: 96 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>About</p>
            <h1 className="v2-display" style={{ fontSize: "var(--v2-display-l)", maxWidth: 880 }}>
              Built by people who got tired<br/>of switching tabs<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h1>
            <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 28, maxWidth: 640, lineHeight: 1.55 }}>
              Leadash started as an internal tool inside a small studio. We were running outreach for a few retainer clients and spending more time keeping four subscriptions in sync than actually writing pitches. So we built one tool that does the whole loop — and opened it up for everyone else doing the same dance.
            </p>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 120, paddingBottom: 120 }}>
            <div style={{ maxWidth: 760, marginBottom: 64 }}>
              <p className="v2-eyebrow" style={{ marginBottom: 18 }}>What we believe</p>
              <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
                Four principles, kept short<span style={{ color: "var(--v2-accent)" }}>.</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PRINCIPLES.map(p => (
                <article key={p.title} className="v2-cap-card">
                  <h3 className="v2-cap-title">{p.title}</h3>
                  <p className="v2-cap-body">{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 120, paddingBottom: 120, maxWidth: 760 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>The wider context</p>
            <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
              Outbound is the new front door<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h2>
            <div style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 24, lineHeight: 1.65, display: "flex", flexDirection: "column", gap: 18 }}>
              <p>
                Inbound has gotten quieter. SEO is being eaten by AI summaries, paid is more expensive every quarter, and the old social channels reward the few accounts that learned to ride them years ago. For independent operators, that leaves one channel where the math still works: a real email, sent to a real person who&apos;d actually benefit from it.
              </p>
              <p>
                Leadash is what we wish we&apos;d had — a way to do that without becoming a part-time spreadsheet operator. We&apos;re building it for the kind of work that requires care: brand design, custom development, technical writing, strategy. The kind of work that doesn&apos;t scale by sending more emails — only by sending the right ones.
              </p>
            </div>

            <div style={{ marginTop: 40 }}>
              <Link href="/signup" className="v2-btn v2-btn-primary">
                Get Started
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
