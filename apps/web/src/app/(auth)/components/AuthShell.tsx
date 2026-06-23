"use client";

/**
 * AuthShell — the split-panel chrome for /login, /signup, /forgot-password,
 * /reset-password.
 *
 * Left brand panel:
 *   - Visible only at lg+; collapses on mobile so the form gets full width
 *   - Quiet dot-grid background (same pattern as the landing hero)
 *   - Logo + wordmark top, type-led headline middle, sign-up/sign-in switch
 *     at the bottom — same restrained voice as the landing
 *
 * Right form panel:
 *   - Centred column, max 380px wide
 *   - Renders whatever children the page provides
 *   - Mobile logo above the form when the brand panel is hidden
 *
 * No gradient orbs, no fake stats. Visual register matches the landing.
 */

import * as React from "react";
import Link from "next/link";

type Tone = "signin" | "signup" | "minimal";

const HEADLINES: Record<Tone, { headline: React.ReactNode; sub: React.ReactNode; ctaText: string; ctaHref: string; ctaLabel: string }> = {
  signin: {
    headline: <>The work you want<span style={{ color: "var(--app-accent)" }}>,</span><br />sent your way<span style={{ color: "var(--app-accent)" }}>.</span></>,
    sub: <>Pick up where you left off. Your sequences, leads, and replies are exactly where you left them.</>,
    ctaText: "New to Leadash?",
    ctaHref: "/signup",
    ctaLabel: "Create a free account",
  },
  signup: {
    headline: <>The work you want<span style={{ color: "var(--app-accent)" }}>,</span><br />sent your way<span style={{ color: "var(--app-accent)" }}>.</span></>,
    sub: <>Connect your inbox in two minutes. First personalized pitch out the door before you finish your coffee.</>,
    ctaText: "Already have an account?",
    ctaHref: "/login",
    ctaLabel: "Sign in",
  },
  minimal: {
    headline: <>Quick interruption<span style={{ color: "var(--app-accent)" }}>.</span></>,
    sub: <>One short step, then back to the work that pays.</>,
    ctaText: "Remember it now?",
    ctaHref: "/login",
    ctaLabel: "Sign in",
  },
};

export default function AuthShell({
  tone = "signin",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const t = HEADLINES[tone];

  return (
    <div className="v2-app" style={{ minHeight: "100vh", display: "flex" }}>
      {/* ── Left brand panel ─────────────────────────────────────────────── */}
      <aside
        className="auth-brand-panel"
        style={{
          position: "relative",
          flexBasis: "48%",
          background: "var(--app-bg-sunken)",
          borderRight: "1px solid var(--app-border)",
          padding: "44px 56px",
          overflow: "hidden",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Quiet dot grid — same recipe as the landing hero */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            WebkitMaskImage: "radial-gradient(ellipse 65% 55% at 40% 35%, rgba(0,0,0,1), rgba(0,0,0,0))",
            maskImage:        "radial-gradient(ellipse 65% 55% at 40% 35%, rgba(0,0,0,1), rgba(0,0,0,0))",
          }}
        />

        {/* Logo */}
        <div style={{ position: "relative" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" width={24} height={24} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--app-text)" }}>Leadash</span>
          </Link>
        </div>

        {/* Headline */}
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 0" }}>
          <p className="app-eyebrow" style={{ marginBottom: 16 }}>For freelance professionals</p>
          <h2
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              fontWeight: 500,
              color: "var(--app-text)",
              marginBottom: 18,
            }}
          >
            {t.headline}
          </h2>
          <p style={{ color: "var(--app-text-muted)", fontSize: 15, lineHeight: 1.55, maxWidth: 380 }}>
            {t.sub}
          </p>
        </div>

        {/* Bottom switch */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--app-text-quiet)" }}>{t.ctaText}</span>
          <Link
            href={t.ctaHref}
            style={{
              color: "var(--app-accent)",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.ctaLabel}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </aside>

      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 24px",
          background: "var(--app-bg)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380, marginInline: "auto" }}>
          {/* Mobile-only logo */}
          <div className="auth-mobile-logo" style={{ marginBottom: 32, justifyContent: "center", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" width={22} height={22} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--app-text)" }}>Leadash</span>
          </div>

          {children}
        </div>
      </main>

      <style>{`
        .auth-brand-panel { display: none; }
        .auth-mobile-logo { display: flex; }
        @media (min-width: 960px) {
          .auth-brand-panel { display: flex; }
          .auth-mobile-logo { display: none; }
        }
      `}</style>
    </div>
  );
}
