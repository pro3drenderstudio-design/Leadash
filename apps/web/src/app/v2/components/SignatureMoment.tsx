"use client";

/**
 * Section 02 — the signature scroll moment.
 *
 * A pinned section: the user scrolls and a generic-template email on the
 * left transforms into a fully personalized pitch field-by-field, while the
 * recipient profile on the right "wakes up" — match-meter fills, fit
 * signals tick in, status changes from "Drafting…" to "Ready to send".
 *
 * Choreography is a single GSAP timeline driven by ScrollTrigger with
 * `scrub`, so the entire transformation is bound to the scrubber position.
 * Scrolling backward un-personalizes the email — which is the kind of
 * detail that makes this read as "alive" rather than scripted.
 *
 *  Timeline (0 → 1 of the pinned scroll distance):
 *    0.00–0.08   Card materializes (opacity, slight y-rise)
 *    0.10–0.20   {{subject}} resolves
 *    0.22–0.30   {{first_name}} resolves
 *    0.30–0.42   {{company}} resolves
 *    0.42–0.60   {{compliment}} resolves
 *    0.60–0.72   {{value_prop}} resolves
 *    0.72–0.80   {{cta}} resolves
 *    0.80–0.85   {{sender}} resolves
 *    0.85–1.00   Right-side recipient card "wakes up" — match meter fills,
 *                signals tick in, status flips to "Ready to send"
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Each variable field has two states the timeline swaps between.
// Keeping these as plain data so the JSX stays readable.
const FIELDS = {
  subject:    { tpl: "{{subject_line}}",   per: "Loved the typography on the Lighthouse rebrand" },
  first_name: { tpl: "{{first_name}}",      per: "Maya" },
  company:    { tpl: "{{company}}",         per: "Lumen Studio" },
  compliment: { tpl: "{{compliment}}",      per: "the typography choices on the Lighthouse rebrand are exactly the kind of restraint I find rare" },
  value_prop: { tpl: "{{value_prop}}",      per: "a 6-week brand sprint we're scoping for Q3" },
  cta:        { tpl: "{{cta}}",             per: "Open to a 20-min call this week?" },
  sender:     { tpl: "{{sender_name}}",     per: "Alex Rivera" },
} as const;

type FieldKey = keyof typeof FIELDS;

// Self-contained variable token. Renders as a single inline span whose
// textContent and color we swap imperatively at the right point on the
// timeline. Because there's exactly one DOM node in flow per field, the
// surrounding paragraph reflows perfectly — the placeholder is replaced
// by the personalized phrase in-place, with no leftover gap.
function Field({ name }: { name: FieldKey }) {
  return (
    <span
      className="sigm-field"
      data-field={name}
      style={{ color: "var(--v2-accent)", fontWeight: 500 }}
    >
      {FIELDS[name].tpl}
    </span>
  );
}

export default function SignatureMoment() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      // Initial card fade-in is its own pinless ScrollTrigger so the user
      // doesn't have to start scrolling before the section reveals itself.
      gsap.from(".sigm-card", {
        opacity: 0,
        y: 24,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: ".sigm-card", start: "top 75%" },
      });

      // The big pinned timeline that drives the transformation.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=1600",
          pin: true,
          scrub: 1.2,
          anticipatePin: 1,
        },
      });

      // Each swap fades the span out, replaces its textContent at the
      // midpoint, then fades it back in. The onStart/onReverseComplete
      // callbacks on a zero-duration tween give us a single source of truth
      // for both scroll directions — when the user scrubs backward, the
      // template string is restored automatically.
      const swap = (name: FieldKey, at: number, dur = 0.12) => {
        const sel = `.sigm-field[data-field="${name}"]`;
        const half = dur / 2;
        const TPL = FIELDS[name].tpl;
        const PER = FIELDS[name].per;

        tl.to(sel, { opacity: 0, duration: half, ease: "power1.in" }, at);

        // Mid-fade content swap. Zero-duration tween with start/reverse
        // callbacks — fires once in each direction.
        tl.to({}, {
          duration: 0.001,
          onStart: () => {
            const el = sectionRef.current?.querySelector<HTMLElement>(sel);
            if (!el) return;
            el.textContent = PER;
            el.style.color = "var(--v2-text)";
            el.style.fontWeight = "400";
          },
          onReverseComplete: () => {
            const el = sectionRef.current?.querySelector<HTMLElement>(sel);
            if (!el) return;
            el.textContent = TPL;
            el.style.color = "var(--v2-accent)";
            el.style.fontWeight = "500";
          },
        }, at + half);

        tl.to(sel, { opacity: 1, duration: half, ease: "power1.out" }, at + half);
      };

      swap("subject",    0.10, 0.12);
      swap("first_name", 0.24, 0.10);
      swap("company",    0.34, 0.10);
      swap("compliment", 0.46, 0.18);   // longest line — slow it down so it lands
      swap("value_prop", 0.66, 0.14);
      swap("cta",        0.78, 0.10);
      swap("sender",     0.85, 0.08);

      // Right-side recipient card — wakes up as the email finishes.
      tl.to(".sigm-recipient-card", { borderColor: "var(--v2-accent-line)", duration: 0.2 }, 0.82);
      tl.to(".sigm-status-drafting", { opacity: 0, duration: 0.15 }, 0.85);
      tl.to(".sigm-status-ready",    { opacity: 1, duration: 0.15 }, 0.86);

      // Match meter — fills to 96 over the last ~12% of scroll.
      tl.to(".sigm-match-fill", { width: "96%", duration: 0.4, ease: "power2.out" }, 0.86);
      tl.to(".sigm-match-pct",  { textContent: 96, duration: 0.4, ease: "none", snap: { textContent: 1 } }, 0.86);

      // Signal rows reveal one after another in the last beat.
      tl.to(".sigm-signal-0", { opacity: 1, x: 0, duration: 0.12 }, 0.88);
      tl.to(".sigm-signal-1", { opacity: 1, x: 0, duration: 0.12 }, 0.92);
      tl.to(".sigm-signal-2", { opacity: 1, x: 0, duration: 0.12 }, 0.96);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="signature" className="relative" style={{ background: "var(--v2-bg)" }}>
      <div className="v2-container" style={{ minHeight: "100vh", paddingTop: "120px", paddingBottom: "80px" }}>

        {/* Section header */}
        <div style={{ maxWidth: 760, marginBottom: 64 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>02 — The signature move</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Watch a pitch find<br/>its target<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 540, lineHeight: 1.55 }}>
            Every template you see in your dashboard transforms into a one-of-one pitch — keyed off the lead&apos;s actual work, role, and timing. Scroll to see one resolve.
          </p>
        </div>

        {/* Two-card stage */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">

          {/* ── Email card ─────────────────────────────────────────────────── */}
          <div
            className="sigm-card"
            style={{
              background: "var(--v2-bg-card)",
              border: "1px solid var(--v2-border)",
              borderRadius: "var(--v2-radius-card)",
              padding: "28px 32px",
              fontSize: "var(--v2-body)",
              lineHeight: 1.65,
              color: "var(--v2-text-muted)",
            }}
          >
            {/* Card header — looks like the top of an email composer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, marginBottom: 22, borderBottom: "1px solid var(--v2-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--v2-small)", color: "var(--v2-text-quiet)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l8 6 8-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
                <span>New pitch</span>
              </div>
              <div style={{ fontSize: "var(--v2-micro)", color: "var(--v2-text-quiet)", letterSpacing: "0.04em" }}>
                Personalized by Leadash
              </div>
            </div>

            <p style={{ marginBottom: 8, fontSize: "var(--v2-small)", color: "var(--v2-text-quiet)" }}>
              Subject —{" "}
              <Field name="subject" />
            </p>

            <p style={{ color: "var(--v2-text)", marginTop: 16, marginBottom: 14 }}>
              Hi <Field name="first_name" />,
            </p>
            <p style={{ marginBottom: 14 }}>
              I came across your work at{" "}
              <Field name="company" />
              {" "}and{" "}
              <Field name="compliment" />
              . I&apos;d love to talk about{" "}
              <Field name="value_prop" />.
            </p>
            <p style={{ marginBottom: 22 }}>
              <Field name="cta" />
            </p>
            <p style={{ color: "var(--v2-text)" }}>
              — <Field name="sender" />
            </p>
          </div>

          {/* ── Recipient profile card ───────────────────────────────────── */}
          <div
            className="sigm-recipient-card"
            style={{
              background: "var(--v2-bg-card)",
              border: "1px solid var(--v2-border)",
              borderRadius: "var(--v2-radius-card)",
              padding: "28px",
              transition: "border-color 200ms",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              {/* Avatar — initials in a circle until we swap in a generated portrait */}
              <div
                aria-hidden
                style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "linear-gradient(135deg, #1E1E26, #0E0E13)",
                  border: "1px solid var(--v2-border-strong)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--v2-text)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em",
                }}
              >MC</div>
              <div>
                <p style={{ color: "var(--v2-text)", fontWeight: 500, fontSize: "var(--v2-body-l)" }}>Maya Chen</p>
                <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-small)", marginTop: 2 }}>Brand Designer · Lumen Studio</p>
              </div>
            </div>

            {/* Match meter */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--v2-small)", color: "var(--v2-text-muted)" }}>Pitch fit</span>
                <span style={{ fontSize: "var(--v2-body-l)", fontWeight: 600, color: "var(--v2-text)", letterSpacing: "-0.02em" }}>
                  <span className="sigm-match-pct">0</span>
                  <span style={{ color: "var(--v2-text-quiet)", fontWeight: 400 }}>%</span>
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                <div className="sigm-match-fill" style={{ width: "0%", height: "100%", background: "var(--v2-accent)", borderRadius: 2 }} />
              </div>
            </div>

            {/* Signals — each row reveals as the email finishes resolving */}
            <p style={{ fontSize: "var(--v2-micro)", letterSpacing: "0.12em", color: "var(--v2-text-quiet)", marginBottom: 12 }}>SIGNALS MATCHED</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                "Recent rebrand work — Lighthouse, Q1",
                "Studio with retainer model · 6-12 clients/yr",
                "Active on LinkedIn, posts every 5 days",
              ].map((label, i) => (
                <li
                  key={i}
                  className={`sigm-signal-${i}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: "var(--v2-small)", color: "var(--v2-text)",
                    opacity: 0, transform: "translateX(-8px)",
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--v2-accent-soft)",
                    border: "1px solid var(--v2-accent-line)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  {label}
                </li>
              ))}
            </ul>

            {/* Status line — flips at the very end of the timeline */}
            <div style={{ position: "relative", height: 18 }}>
              <p className="sigm-status-drafting" style={{ position: "absolute", inset: 0, fontSize: "var(--v2-small)", color: "var(--v2-text-quiet)" }}>
                <span style={{ display: "inline-block", width: 6, height: 6, background: "var(--v2-text-quiet)", borderRadius: "50%", marginRight: 8, verticalAlign: "middle" }} />
                Drafting…
              </p>
              <p className="sigm-status-ready" style={{ position: "absolute", inset: 0, fontSize: "var(--v2-small)", color: "var(--v2-accent)", opacity: 0 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, background: "var(--v2-accent)", borderRadius: "50%", marginRight: 8, verticalAlign: "middle" }} />
                Ready to send
              </p>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
