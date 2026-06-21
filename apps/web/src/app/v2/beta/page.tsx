/**
 * /v2/beta — beta program landing page, v2 style.
 *
 * Short: what's in the beta, who it's for, and how to join. No long
 * marketing tail — the beta is a deliberate choice, not a funnel.
 */

import "../v2.css";
import Link from "next/link";
import V2Nav from "../components/V2Nav";
import V2Scroll from "../components/V2Scroll";
import Footer from "../components/Footer";

export const metadata = {
  title: "Beta program — Leadash",
  description: "Early access to the next set of features we're building.",
};

const PERKS = [
  { title: "Lifetime founder pricing",     body: "Locked at whatever you pay during the beta, even after public pricing changes." },
  { title: "Direct line to the team",      body: "A shared Slack with the people building the product. Feedback turns into commits, not tickets." },
  { title: "Vote on what ships next",      body: "Monthly roadmap call, open priorities. You see the trade-offs we're making in real time." },
  { title: "Early access to new surfaces", body: "Beta members see the AI search, browser extension, and reply triage upgrades two months ahead of everyone else." },
];

export default function BetaPage() {
  return (
    <div className="v2 min-h-screen">
      <V2Scroll />
      <V2Nav />

      <main>
        <section className="v2-dotgrid relative overflow-hidden">
          <div className="v2-container" style={{ paddingTop: 200, paddingBottom: 96 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>Beta program</p>
            <h1 className="v2-display" style={{ fontSize: "var(--v2-display-l)", maxWidth: 880 }}>
              Get in early. Help shape<br/>what comes next<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h1>
            <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 28, maxWidth: 640, lineHeight: 1.55 }}>
              We&apos;re opening a small founder cohort. Lifetime pricing, direct access to the team, and a real say in what ships in the next two quarters. Limited slots — we want to make sure every member gets attention.
            </p>
            <div style={{ marginTop: 36, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/signup?ref=beta" className="v2-btn v2-btn-primary">
                Apply for the beta
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
                </svg>
              </Link>
              <Link href="/v2/contact" className="v2-btn v2-btn-ghost">Ask a question first</Link>
            </div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 120, paddingBottom: 120 }}>
            <div style={{ maxWidth: 760, marginBottom: 64 }}>
              <p className="v2-eyebrow" style={{ marginBottom: 18 }}>What you get</p>
              <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
                Four things, all worth something<span style={{ color: "var(--v2-accent)" }}>.</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PERKS.map(p => (
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
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>The fine print</p>
            <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
              Who we&apos;re looking for<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h2>
            <div style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 24, lineHeight: 1.65, display: "flex", flexDirection: "column", gap: 18 }}>
              <p>
                Independent operators — freelance designers, developers, consultants, coaches — already doing some form of outbound, even if it&apos;s a scrappy spreadsheet plus Gmail. You don&apos;t need to be a power user. You do need to be opinionated about what would make the product better, and willing to tell us when something isn&apos;t working.
              </p>
              <p>
                In return: lifetime pricing, a Slack we actually live in, and the kind of access to the team that you can&apos;t buy at the higher tiers later.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
