/**
 * /v2/contact — restyled contact page.
 *
 * One column. Two paths: a mailto and a calendar link. No giant form
 * we'll never check — sending an actual email is faster for both sides.
 */

import "../v2.css";
import Link from "next/link";
import V2Nav from "../components/V2Nav";
import V2Scroll from "../components/V2Scroll";
import Footer from "../components/Footer";

export const metadata = {
  title: "Contact — Leadash",
  description: "Reach the team. Real humans, usually within a few hours.",
};

const CHANNELS = [
  {
    label: "Support",
    detail: "support@leadash.com",
    href:   "mailto:support@leadash.com",
    sub:    "Bugs, billing, account questions. Usually answered within 4 hours during business days.",
  },
  {
    label: "Sales",
    detail: "talk@leadash.com",
    href:   "mailto:talk@leadash.com",
    sub:    "Enterprise pricing, agency programs, anything that doesn't fit on the pricing page.",
  },
  {
    label: "Press / partnerships",
    detail: "hello@leadash.com",
    href:   "mailto:hello@leadash.com",
    sub:    "Editorial, podcasts, integrations, side projects we should know about.",
  },
];

export default function ContactPage() {
  return (
    <div className="v2 min-h-screen">
      <V2Scroll />
      <V2Nav />

      <main>
        <section className="v2-dotgrid relative overflow-hidden">
          <div className="v2-container" style={{ paddingTop: 200, paddingBottom: 96 }}>
            <p className="v2-eyebrow" style={{ marginBottom: 18 }}>Contact</p>
            <h1 className="v2-display" style={{ fontSize: "var(--v2-display-l)", maxWidth: 880 }}>
              Get in touch<span style={{ color: "var(--v2-accent)" }}>.</span>
            </h1>
            <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 28, maxWidth: 560, lineHeight: 1.55 }}>
              No contact form, no ticketing system. The fastest way to reach us is the same way you reach anyone — by writing an email. The team checks each inbox below several times a day.
            </p>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--v2-border)" }}>
          <div className="v2-container" style={{ paddingTop: 96, paddingBottom: 120, maxWidth: 880 }}>
            <div className="v2-spec-table" style={{ borderRadius: 12, overflow: "hidden" }}>
              {CHANNELS.map((c, i) => (
                <a
                  key={c.label}
                  href={c.href}
                  className="v2-contact-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr auto",
                    alignItems: "center",
                    gap: 24,
                    padding: "24px 28px",
                    borderBottom: i < CHANNELS.length - 1 ? "1px solid var(--v2-border)" : "none",
                    color: "inherit",
                    transition: "background 200ms var(--v2-ease-out)",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "var(--v2-micro)", letterSpacing: "0.14em", color: "var(--v2-text-quiet)", textTransform: "uppercase", marginBottom: 6 }}>{c.label}</p>
                    <p style={{ fontSize: "var(--v2-body)", color: "var(--v2-text)", fontWeight: 500, letterSpacing: "-0.01em" }}>{c.detail}</p>
                  </div>
                  <p style={{ fontSize: "var(--v2-small)", color: "var(--v2-text-muted)", lineHeight: 1.5 }}>{c.sub}</p>
                  <span aria-hidden style={{ color: "var(--v2-accent)", fontSize: 18, lineHeight: 1 }}>↗</span>
                </a>
              ))}
            </div>

            <div style={{ marginTop: 48, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "var(--v2-small)", color: "var(--v2-text-muted)" }}>
                For account-specific questions you can also reach us from inside the app — the &ldquo;Help&rdquo; button opens a thread with the same team.
              </p>
              <Link href="/signup" className="v2-btn v2-btn-ghost">Start a free account</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
