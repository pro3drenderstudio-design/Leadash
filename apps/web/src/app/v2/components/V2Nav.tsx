"use client";

/**
 * Landing v2 navigation. Solid scrim appears after the viewer scrolls past
 * the hero — until then, the nav floats over the dot-grid background.
 *
 * Geist throughout (no mono). One primary CTA, three nav links — keeping
 * the chrome quiet so the content does the talking.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#how",         label: "How it works" },
  { href: "#personas",    label: "For freelancers" },
  { href: "#pricing",     label: "Pricing" },
  { href: "/v2/about",    label: "About" },
];

export default function V2Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 24); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled ? "rgba(7,7,10,0.78)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--v2-border)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
      }}
    >
      <div className="v2-container flex items-center justify-between" style={{ paddingTop: 18, paddingBottom: 18 }}>
        <Link href="/v2" className="inline-flex items-center gap-2.5 group" aria-label="Leadash home">
          <span
            aria-hidden
            style={{ width: 18, height: 18, background: "var(--v2-accent)", borderRadius: 4, display: "inline-block" }}
          />
          <span
            style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--v2-text)" }}
          >
            leadash
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              style={{ fontSize: 13, color: "var(--v2-text-muted)" }}
              className="hover:!text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            style={{ fontSize: 13, color: "var(--v2-text-muted)" }}
            className="hover:!text-white transition-colors hidden sm:inline-block"
          >
            Sign in
          </Link>
          <Link href="/signup" className="v2-btn v2-btn-primary">Start free</Link>
        </div>
      </div>
    </header>
  );
}
