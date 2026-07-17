"use client";

/**
 * Section 10 — Footer with the final CTA absorbed into the top of the
 * same block. Social links are loaded from admin_settings at runtime so
 * they can be updated without a code deploy.
 */

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

const LINK_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "For freelancers", href: "/#personas" },
      { label: "Pricing", href: "/#pricing" },
      { label: "The $10k Academy", href: "/offer/10k-academy" },
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

interface SocialLinks {
  twitter_url:   string | null;
  linkedin_url:  string | null;
  instagram_url: string | null;
}

export default function Footer() {
  const [social, setSocial] = useState<SocialLinks>({ twitter_url: null, linkedin_url: null, instagram_url: null });

  useEffect(() => {
    fetch("/api/public/funnel-settings")
      .then(r => r.ok ? r.json() : null)
      .then((d: SocialLinks | null) => { if (d) setSocial(d); })
      .catch(() => {});
  }, []);

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
          <p className="v2-cta-trust">No credit card · Free to start · Pay as you grow</p>
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
                {social.twitter_url && (
                  <a href={social.twitter_url} aria-label="X / Twitter" className="v2-foot-icon" target="_blank" rel="noopener noreferrer">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                )}
                {social.linkedin_url && (
                  <a href={social.linkedin_url} aria-label="LinkedIn" className="v2-foot-icon" target="_blank" rel="noopener noreferrer">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </a>
                )}
                {social.instagram_url && (
                  <a href={social.instagram_url} aria-label="Instagram" className="v2-foot-icon" target="_blank" rel="noopener noreferrer">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                )}
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
