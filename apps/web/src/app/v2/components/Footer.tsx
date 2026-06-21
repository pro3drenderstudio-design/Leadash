"use client";

/**
 * Section 10 — Footer with the final CTA absorbed into the top of the
 * same block. The page closes on one composite landing — first a quiet
 * "ready when you are" prompt, then the chrome: link columns, social,
 * legal. No separate CTA banner, no big gradient slab — keeps the page
 * in one continuous tonal register all the way down.
 *
 * Motion: the CTA half eases in on viewport entry. The footer chrome
 * below is static (any flair down here would feel forced).
 */

import Link from "next/link";
import { motion } from "motion/react";

const LINK_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "For freelancers", href: "/#personas" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Browser extension", href: "/extension" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Beta program", href: "/beta" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "GDPR", href: "/privacy#gdpr" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>

      {/* ── Absorbed CTA band ─────────────────────────────────────────────── */}
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 96 }}>
        <motion.div
          className="v2-cta"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>10 — Ready when you are</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-l)" }}>
            The work you want<span style={{ color: "var(--v2-accent)" }}>,</span><br/>
            sent your way<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p className="v2-cta-sub">
            Connect your inbox in two minutes. First personalized pitch out the door before you finish your coffee.
          </p>
          <div className="v2-cta-actions">
            <Link href="/signup" className="v2-btn v2-btn-primary">
              Start free
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
              </svg>
            </Link>
            <Link href="#pricing" className="v2-btn v2-btn-ghost">See pricing</Link>
          </div>
          <p className="v2-cta-trust">No credit card · 14-day trial · Cancel anytime</p>
        </motion.div>
      </div>

      {/* ── Footer chrome ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--v2-border)" }}>
        <div className="v2-container" style={{ paddingTop: 64, paddingBottom: 36 }}>

          <div className="v2-foot-grid">
            <div>
              <Link href="/" className="inline-flex items-center gap-2" aria-label="Leadash home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/Logo_Icon_Colored.svg" alt="" aria-hidden style={{ width: 22, height: 22 }} />
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--v2-text)" }}>Leadash</span>
              </Link>
              <p className="v2-foot-tagline">Cold email that fills your calendar with the kind of clients you actually want to work with.</p>
              <div className="v2-foot-social">
                <a href="https://twitter.com/leadash" aria-label="X / Twitter" className="v2-foot-icon">
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/leadash" aria-label="LinkedIn" className="v2-foot-icon">
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              </div>
            </div>

            {LINK_COLUMNS.map(col => (
              <div key={col.heading}>
                <p className="v2-foot-heading">{col.heading}</p>
                <ul className="v2-foot-links">
                  {col.links.map(l => (
                    <li key={l.label}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="v2-foot-base">
            <p>© {new Date().getFullYear()} Leadash. All rights reserved.</p>
            <p>Made for the people doing the work.</p>
          </div>

        </div>
      </div>
    </footer>
  );
}
