"use client";
import { useState } from "react";
import Link from "next/link";
import { PLANS, CREDIT_COSTS } from "@/lib/billing/plans";

// ─── Main Pricing Page ────────────────────────────────────────────────────────

const PLAN_ORDER = ["free", "starter", "growth", "scale", "enterprise"] as const;

export default function PricingPage() {
  const [currency] = useState<Currency>("NGN");

  const plans = PLAN_ORDER.map(id => PLANS[id]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto border-b border-white/5">
        <Link href="/" className="text-lg font-bold tracking-tight">Leadash</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-400 hover:text-white">Sign in</Link>
          <Link href="/signup" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg">Start free</Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">Simple, transparent pricing</h1>
          <p className="text-gray-400 text-lg">Start free for 14 days. No card required.</p>
        </div>

        {/* Credit cost explainer */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-12 px-6 py-5 bg-white/3 border border-white/8 rounded-2xl max-w-2xl mx-auto">
          <p className="text-gray-400 text-sm font-medium w-full text-center mb-2">Credits are charged per action — not per seat or inbox</p>
          {[
            { label: "Scrape a lead",      cost: CREDIT_COSTS.scrape,         emoji: "🔍" },
            { label: "Verify an email",    cost: CREDIT_COSTS.verify,         emoji: "✓" },
            { label: "AI personalization", cost: CREDIT_COSTS.ai_personalize, emoji: "✨" },
          ].map(op => (
            <div key={op.label} className="flex items-center gap-2">
              <span className="text-sm">{op.emoji}</span>
              <span className="text-white text-sm font-semibold">{op.cost}</span>
              <span className="text-gray-500 text-sm">cr · {op.label}</span>
            </div>
          ))}
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-20">
          {plans.map(plan => {
            const isPopular  = plan.id === "growth";
            const isFree     = plan.id === "free";
            const priceStr   = isFree ? "Free" : `₦${plan.priceNgn.toLocaleString()}`;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-5 flex flex-col border transition-all ${
                  isPopular
                    ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10"
                    : "border-white/8 bg-gray-900/80"
                }`}
              >
                {isPopular && (
                  <div className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full inline-block self-start mb-3">
                    Most popular
                  </div>
                )}

                <h3 className="font-bold text-white text-base mb-1">{plan.name}</h3>
                {isFree && plan.trialDays > 0 && (
                  <p className="text-gray-500 text-xs mb-3">{plan.trialDays}-day trial</p>
                )}

                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">{priceStr}</span>
                  {!isFree && <span className="text-gray-500 text-sm">/mo</span>}
                </div>

                <ul className="space-y-2 text-sm text-gray-400 mb-6 flex-1">
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✦</span>
                    <span className={plan.includedCredits === 0 ? "text-gray-600" : "text-white"}>
                      {plan.includedCredits === 0 ? "No credits" : `${plan.includedCredits.toLocaleString()} credits/mo`}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✦</span>
                    <span className={plan.maxLeadsPool === 0 ? "text-gray-600" : ""}>
                      {plan.maxLeadsPool === 0
                        ? "Preview leads only"
                        : `${plan.maxLeadsPool.toLocaleString()} leads pool`}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✦</span>
                    {plan.maxInboxes === -1 ? "Unlimited inboxes" : `Up to ${plan.maxInboxes} inboxes`}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={plan.features.warmup ? "text-green-400" : "text-gray-700"}>✓</span>
                    <span className={!plan.features.warmup ? "text-gray-600" : ""}>Inbox warmup</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={plan.features.campaigns ? "text-green-400" : "text-gray-700"}>✓</span>
                    <span className={!plan.features.campaigns ? "text-gray-600" : ""}>Run campaigns</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={plan.features.aiPersonalization ? "text-green-400" : "text-gray-700"}>✓</span>
                    <span className={!plan.features.aiPersonalization ? "text-gray-600" : ""}>AI personalization</span>
                  </li>
                  {plan.id !== "free" && (
                    <li className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      Priority support
                    </li>
                  )}
                </ul>

                <Link
                  href={isFree ? "/signup" : `/signup?plan=${plan.id}`}
                  className={`block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors ${
                    isPopular
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : isFree
                      ? "border border-white/15 hover:border-white/25 text-white"
                      : "bg-white/6 hover:bg-white/10 text-white border border-white/10"
                  }`}
                >
                  {isFree ? "Start free trial" : "Get started"}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Credit top-up section */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Need more credits?</h2>
            <p className="text-gray-400">Top up any time. Bulk discounts up to 40% off.</p>
          </div>
          <CreditSlider />
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Common questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "What happens when I run out of credits?",
                a: "Scraping, verification, and AI personalization stop for the current job. Leads already collected are kept. Buy more credits and jobs resume automatically.",
              },
              {
                q: "Do credits roll over?",
                a: "Monthly plan credits reset each billing cycle. Purchased top-up credits never expire.",
              },
              {
                q: "Can I change plans?",
                a: "Yes — upgrade or downgrade at any time. Credits from your old plan are not carried over on downgrade.",
              },
              {
                q: "What payment methods are accepted?",
                a: "NGN payments via Paystack (card, bank transfer, USSD). USD payments via Stripe (card).",
              },
              {
                q: "What is the leads pool?",
                a: "Leads in your pool are kept between campaigns. Your plan limits how many you can store at once. Export to sequences when ready to send.",
              },
            ].map(item => (
              <details key={item.q} className="group border border-white/8 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer bg-white/3 hover:bg-white/5 transition-colors list-none">
                  <span className="text-white text-sm font-medium pr-4">{item.q}</span>
                  <svg className="w-4 h-4 text-white/30 flex-shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 py-4 text-gray-400 text-sm leading-relaxed border-t border-white/5">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
