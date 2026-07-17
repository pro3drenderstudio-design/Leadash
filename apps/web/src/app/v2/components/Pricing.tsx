"use client";

/**
 * Section 08 — Pricing.
 *
 * "Pay for what you send" — a volume slider that picks the plan + recommended
 * inbox count and shows an itemized monthly price. Replaces the old static
 * three-column grid. The slider (PricingSlider) is shared with the in-app
 * billing surface. currencyContext is still accepted for parity but the slider
 * runs its own NGN/USD toggle off ngnPerUsd.
 */

import { useRouter } from "next/navigation";
import type { PlanConfig } from "@/lib/billing/getActivePlans";
import type { CurrencyContext } from "@/lib/currency/format";
import PricingSlider, { type SliderSelection } from "@/components/pricing/PricingSlider";

export default function Pricing({
  plans,
  ngnPerUsd,
}: {
  plans: PlanConfig[];
  currencyContext: CurrencyContext;
  ngnPerUsd: number;
}) {
  const router = useRouter();

  function handleCheckout(sel: SliderSelection) {
    const params = new URLSearchParams({
      plan:     sel.plan_id,
      interval: sel.billing_interval,
    });
    if (sel.inbox_toggle) params.set("inboxes", String(sel.inbox_count));
    router.push(`/signup?${params.toString()}`);
  }

  return (
    <section id="pricing" className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 140, paddingBottom: 140 }}>
        <div style={{ maxWidth: 760, marginBottom: 56, textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>08 — Pricing</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            Pay for what you send<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 560, lineHeight: 1.55, marginLeft: "auto", marginRight: "auto" }}>
            Slide to your monthly send volume. We&apos;ll pick the right plan and inbox count — no overpaying for capacity you won&apos;t use.
          </p>
        </div>

        <PricingSlider plans={plans} ngnPerUsd={ngnPerUsd} onCheckout={handleCheckout} checkoutLabel="Get started" />
      </div>
    </section>
  );
}
