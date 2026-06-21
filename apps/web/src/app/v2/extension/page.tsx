/**
 * /v2/extension — Chrome extension landing, restyled.
 *
 * What it does, where to install it, and what it costs (nothing — it's
 * bundled with every plan). Three quick benefits, one install CTA.
 */

import "../v2.css";
import Link from "next/link";
import V2Nav from "../components/V2Nav";
import V2Scroll from "../components/V2Scroll";
import Footer from "../components/Footer";

export const metadata = {
  title: "Browser extension — Leadash",
  description: "Add a lead to Leadash from any LinkedIn, Twitter, or company website in one click.",
};

const FEATURES = [
  {
    num: "01",
    title: "Add anyone to Leadash in a click",
    body: "On LinkedIn, X, a company website, a personal site — the extension lifts the right details and drops them into your lead pool, ready for a campaign.",
  },
  {
    num: "02",
    title: "Pull context the moment you need it",
    body: "Hover any name and see your full Leadash record: prior touches, reply state, what sequences they've been in. No tab switch.",
  },
  {
    num: "03",
    title: "Write better right where you are",
    body: "Compose a reply from inside LinkedIn or Gmail and let Leadash draft the opener — keyed off what's actually on the lead's profile, not a template.",
  },
];

export default function ExtensionPage() {
  return (
    <div className="v2 min-h-screen">
      <V2Scroll />
      <V2Nav />

      <main>
        <section className="v2-dotgrid relative overflow-hidden">
          <div className="v2-container" style={{ paddingTop: 200, paddingBottom: 96 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>Browser extension</p>
            <h1 className="v2-display" style={{ fontSize: "var(--v2-display-l)", maxWidth: 880 }}>
              Leadash, wherever<br/>your work happens<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h1>
            <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 28, maxWidth: 600, lineHeight: 1.55 }}>
              A small Chrome extension that lets you pull leads into Leadash and see your CRM context right inside LinkedIn, X, Gmail, or any company website. Bundled with every paid plan, free during the trial.
            </p>
            <div style={{ marginTop: 36, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a
                href="https://chromewebstore.google.com/category/extensions"
                target="_blank"
                rel="noreferrer noopener"
                className="v2-btn v2-btn-primary"
              >
                Install on Chrome
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17L17 7"/><path d="M9 7h8v8"/>
                </svg>
              </a>
              <Link href="/v2/extension/auth" className="v2-btn v2-btn-ghost">Sign in to the extension</Link>
            </div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 120, paddingBottom: 120 }}>
            <div style={{ maxWidth: 760, marginBottom: 64 }}>
              <p className="v2-eyebrow" style={{ marginBottom: 18 }}>What it does</p>
              <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
                Three things, none of them complicated<span style={{ color: "var(--v2-accent)" }}>.</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {FEATURES.map(f => (
                <article key={f.num} className="v2-cap-card">
                  <div className="v2-cap-chip">{f.num}</div>
                  <h3 className="v2-cap-title">{f.title}</h3>
                  <p className="v2-cap-body">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 120, paddingBottom: 120, maxWidth: 760 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>Compatibility</p>
            <h2 className="v2-display" style={{ fontSize: "var(--v2-display-s)" }}>
              Works where you work<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h2>
            <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 24, lineHeight: 1.65, maxWidth: 620 }}>
              Chrome, Brave, Edge, Arc, and any Chromium-based browser. Firefox support is in the queue for Q3. Safari is on the list for the back half of the year — talk to us if it&apos;s a deal-breaker.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
