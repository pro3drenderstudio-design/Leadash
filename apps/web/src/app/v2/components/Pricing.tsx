"use client";

/**
 * Section 08 — Pricing.
 *
 * Reads the same `plans` and `currencyContext` that the legacy landing
 * uses (passed in from the server-rendered v2 page) so the geo-localized
 * NGN-to-local-currency display from the Phase 1 currency work shows
 * through here for free.
 *
 * Visual direction: three columns, the middle highlighted with a single
 * hairline orange border and a small "Most popular" eyebrow. No gradient
 * borders, no glow shadows — the page's restraint carries into pricing.
 *
 * Motion: each plan rises in on viewport entry with a small left-to-right
 * stagger so the eye is led from starter → most-popular → enterprise.
 */

import Link from "next/link";
import { motion } from "motion/react";
import type { PlanConfig } from "@/lib/billing/getActivePlans";
import { formatLocalPrice, type CurrencyContext } from "@/lib/currency/format";

const PLAN_DISPLAY: Record<string, {
  desc: string;
  cta: string;
  highlight?: boolean;
  badge?: string;
  extras: string[];
}> = {
  starter: {
    desc: "For the solo freelancer just sending their first sequences.",
    cta: "Start free",
    extras: ["Unlimited inboxes", "Email verification", "AI personalization", "Email support"],
  },
  growth: {
    desc: "For the operator running multiple campaigns at once.",
    cta: "Start free",
    highlight: true,
    badge: "Most picked",
    extras: ["Unlimited inboxes", "Inbox warmup", "Advanced personalization", "A/B testing", "Reply triage CRM", "Priority support"],
  },
  scale: {
    desc: "For studios and agencies running outreach for clients.",
    cta: "Talk to us",
    extras: ["Everything in Growth", "Multiple workspaces", "API access", "Dedicated Slack support", "Custom onboarding"],
  },
};

export default function Pricing({
  plans,
  currencyContext,
}: {
  plans: PlanConfig[];
  currencyContext: CurrencyContext;
}) {
  const display = plans
    .filter(p => p.plan_id !== "free" && PLAN_DISPLAY[p.plan_id])
    .slice(0, 3)
    .map(p => {
      const d = PLAN_DISPLAY[p.plan_id];
      return {
        id:        p.plan_id,
        name:      p.name,
        price:     formatLocalPrice(p.price_ngn, currencyContext),
        desc:      d.desc,
        features:  [
          `${p.included_credits.toLocaleString()} credits / month`,
          `${p.max_leads_pool.toLocaleString()} leads pool`,
          ...d.extras,
        ],
        cta:       d.cta,
        highlight: d.highlight ?? false,
        badge:     d.badge,
      };
    });

  return (
    <section id="pricing" className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160 }}>

        <div style={{ maxWidth: 760, marginBottom: 80 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>08 — Pricing</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Built for a freelancer&apos;s<br/>monthly P&amp;L<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55 }}>
            14-day trial on every plan. No card required to start. Shown in your local currency — billed transparently.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {display.map((plan, i) => (
            <motion.article
              key={plan.id}
              className={`v2-plan ${plan.highlight ? "v2-plan-highlight" : ""}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              {plan.badge && <span className="v2-plan-badge">{plan.badge}</span>}

              <header style={{ marginBottom: 24 }}>
                <p className="v2-plan-name">{plan.name}</p>
                <p className="v2-plan-desc">{plan.desc}</p>
              </header>

              <div className="v2-plan-price">
                <span className="v2-plan-price-amount">{plan.price}</span>
                <span className="v2-plan-price-period">/ month</span>
              </div>

              <ul className="v2-plan-features">
                {plan.features.map(f => (
                  <li key={f}>
                    <span aria-hidden className="v2-plan-check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={`/signup?plan=${plan.id}`}
                className={plan.highlight ? "v2-btn v2-btn-primary" : "v2-btn v2-btn-ghost"}
                style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}
              >
                {plan.cta}
              </Link>
            </motion.article>
          ))}
        </div>

        <p className="v2-plan-footnote">
          Need higher limits, a contract, or SSO? <Link href="/contact">Talk to us about Enterprise.</Link>
        </p>

      </div>
    </section>
  );
}
