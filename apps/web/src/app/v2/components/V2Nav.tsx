"use client";

/**
 * Landing v2 navigation. Solid scrim appears after the viewer scrolls past
 * the hero — until then, the nav floats over the dot-grid background.
 *
 * Two scroll-driven behaviours, both written without component state for
 * the scroll path:
 *   1. Scrim opacity — toggled via React state (sparse update, fine).
 *   2. Active section — IntersectionObserver watches each section a nav
 *      link points to, and the most-top-aligned visible one gets
 *      `data-active="true"` on its link (CSS draws the underline). This
 *      keeps high-frequency scroll work entirely off the React tree.
 *
 * Anchor links smooth-scroll through Lenis when V2Scroll has mounted it;
 * otherwise they fall back to native scrollIntoView.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type Lenis from "lenis";

const LINKS = [
  // sectionId matches the actual <section id> on the page so the
  // IntersectionObserver can find each target.
  { href: "#how",         label: "How it works",    sectionId: "how" },
  { href: "#personas",    label: "For freelancers", sectionId: "personas" },
  { href: "#pricing",     label: "Pricing",         sectionId: "pricing" },
  { href: "/about",       label: "About",           sectionId: null },
];

export default function V2Nav() {
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 24); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active-section indicator. Direct DOM writes — scroll updates never
  // reach React.
  useEffect(() => {
    if (!navRef.current) return;
    const nav = navRef.current;
    const linkBySection = new Map<string, HTMLElement>();
    nav.querySelectorAll<HTMLElement>("[data-section]").forEach(el => {
      const id = el.dataset.section!;
      linkBySection.set(id, el);
    });

    const targets: HTMLElement[] = [];
    linkBySection.forEach((_link, id) => {
      const el = document.getElementById(id);
      if (el) targets.push(el);
    });
    if (targets.length === 0) return;

    const visible = new Set<string>();
    const setActive = (id: string | null) => {
      linkBySection.forEach((link, key) => {
        link.dataset.active = key === id ? "true" : "false";
      });
    };

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        let best: { id: string; absTop: number } | null = null;
        visible.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const absTop = Math.abs(el.getBoundingClientRect().top);
          if (!best || absTop < best.absTop) best = { id, absTop };
        });
        setActive(best ? (best as { id: string }).id : null);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 },
    );
    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function onAnchorClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (!target) return;
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (lenis) {
      lenis.scrollTo(target as HTMLElement, { offset: -64, duration: 1.2 });
    } else {
      (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <header
      ref={navRef}
      className="fixed top-0 inset-x-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled ? "rgba(7,7,10,0.78)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--v2-border)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
      }}
    >
      <div className="v2-container flex items-center justify-between" style={{ paddingTop: 18, paddingBottom: 18 }}>
        <Link href="/" className="inline-flex items-center gap-2 group" aria-label="Leadash home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Logo_Icon_Colored.svg"
            alt=""
            aria-hidden
            style={{ width: 22, height: 22, display: "inline-block" }}
          />
          <span
            style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--v2-text)" }}
          >
            Leadash
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map(l => {
            const isAnchor = l.href.startsWith("#");
            return (
              <a
                key={l.href}
                href={l.href}
                data-section={l.sectionId ?? undefined}
                onClick={isAnchor ? (e) => onAnchorClick(e, l.href) : undefined}
                className="v2-nav-link"
              >
                {l.label}
              </a>
            );
          })}
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
