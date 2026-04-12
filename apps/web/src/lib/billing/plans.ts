// All prices in NGN (Paystack). USD Stripe paths are kept for international users.
export const PLANS = {
  free: {
    id:                  "free",
    name:                "Free Trial",
    priceNgn:            0,
    price:               0,             // USD equivalent
    priceId:             null,
    stripePriceId:       null,
    paystackPlanCode:    null,
    trialDays:           14,
    maxInboxes:          5,
    maxMonthlySends:     0,             // warmup only — no campaigns
    maxLeadsPool:        0,
    includedCredits:     0,
    canScrapeLeads:      false,
    canRunCampaigns:     false,
    maxSeats:            1,
    features: {
      warmup:            true,
      previewLeads:      true,
      campaigns:         false,
      aiPersonalization: false,
      aiClassification:  false,
      apiAccess:         false,
    },
  },
  starter: {
    id:                  "starter",
    name:                "Starter",
    priceNgn:            15_000,
    price:               10,            // USD fallback
    priceId:             process.env.STRIPE_PRICE_STARTER ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_STARTER ?? "",
    paystackPlanCode:    process.env.PAYSTACK_PLAN_STARTER ?? "",
    trialDays:           0,
    maxInboxes:          -1,            // unlimited
    maxMonthlySends:     -1,            // unlimited (capped by credits)
    maxLeadsPool:        1_000,
    includedCredits:     2_000,
    canScrapeLeads:      true,
    canRunCampaigns:     true,
    maxSeats:            3,
    features: {
      warmup:            true,
      previewLeads:      true,
      campaigns:         true,
      aiPersonalization: true,
      aiClassification:  true,
      apiAccess:         false,
    },
  },
  growth: {
    id:                  "growth",
    name:                "Growth",
    priceNgn:            45_000,
    price:               28,
    priceId:             process.env.STRIPE_PRICE_GROWTH ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_GROWTH ?? "",
    paystackPlanCode:    process.env.PAYSTACK_PLAN_GROWTH ?? "",
    trialDays:           0,
    maxInboxes:          -1,
    maxMonthlySends:     -1,
    maxLeadsPool:        10_000,
    includedCredits:     20_000,
    canScrapeLeads:      true,
    canRunCampaigns:     true,
    maxSeats:            10,
    features: {
      warmup:            true,
      previewLeads:      true,
      campaigns:         true,
      aiPersonalization: true,
      aiClassification:  true,
      apiAccess:         true,
    },
  },
  scale: {
    id:                  "scale",
    name:                "Scale",
    priceNgn:            95_000,
    price:               59,
    priceId:             process.env.STRIPE_PRICE_SCALE ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_SCALE ?? "",
    paystackPlanCode:    process.env.PAYSTACK_PLAN_SCALE ?? "",
    trialDays:           0,
    maxInboxes:          -1,
    maxMonthlySends:     -1,
    maxLeadsPool:        35_000,
    includedCredits:     70_000,
    canScrapeLeads:      true,
    canRunCampaigns:     true,
    maxSeats:            999999,
    features: {
      warmup:            true,
      previewLeads:      true,
      campaigns:         true,
      aiPersonalization: true,
      aiClassification:  true,
      apiAccess:         true,
    },
  },
  enterprise: {
    id:                  "enterprise",
    name:                "Enterprise",
    priceNgn:            250_000,
    price:               156,
    priceId:             process.env.STRIPE_PRICE_ENTERPRISE ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_ENTERPRISE ?? "",
    paystackPlanCode:    process.env.PAYSTACK_PLAN_ENTERPRISE ?? "",
    trialDays:           0,
    maxInboxes:          -1,
    maxMonthlySends:     -1,
    maxLeadsPool:        150_000,
    includedCredits:     300_000,
    canScrapeLeads:      true,
    canRunCampaigns:     true,
    maxSeats:            999999,
    features: {
      warmup:            true,
      previewLeads:      true,
      campaigns:         true,
      aiPersonalization: true,
      aiClassification:  true,
      apiAccess:         true,
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? PLANS.free;
}

// ── Credit costs (in credits, can be fractional) ──────────────────────────────
export const CREDIT_COSTS = {
  scrape:           1.0,   // per lead scraped
  verify:           0.5,   // per lead verified
  ai_personalize:   0.5,   // per AI opener generated
} as const;

// ── Credit top-up packs (NGN) ─────────────────────────────────────────────────
// Minimum purchase: 2,000 credits = ₦15,000
// Base rate: ₦7.50/credit. Bulk discounts at higher tiers.
export const CREDIT_PACKS = [
  {
    id:               "pack_2000",
    credits:          2_000,
    priceNgn:         15_000,
    priceUsd:         10,
    label:            "2,000 credits",
    savingsPct:       0,
    paystackProductId: process.env.PAYSTACK_PRODUCT_CREDITS_2000 ?? "",
  },
  {
    id:               "pack_5000",
    credits:          5_000,
    priceNgn:         34_000,
    priceUsd:         22,
    label:            "5,000 credits",
    savingsPct:       9,    // vs base rate
    paystackProductId: process.env.PAYSTACK_PRODUCT_CREDITS_5000 ?? "",
  },
  {
    id:               "pack_10000",
    credits:          10_000,
    priceNgn:         60_000,
    priceUsd:         38,
    label:            "10,000 credits",
    savingsPct:       20,
    paystackProductId: process.env.PAYSTACK_PRODUCT_CREDITS_10000 ?? "",
  },
  {
    id:               "pack_25000",
    credits:          25_000,
    priceNgn:         131_250,
    priceUsd:         82,
    label:            "25,000 credits",
    savingsPct:       30,
    paystackProductId: process.env.PAYSTACK_PRODUCT_CREDITS_25000 ?? "",
  },
  {
    id:               "pack_50000",
    credits:          50_000,
    priceNgn:         225_000,
    priceUsd:         141,
    label:            "50,000 credits",
    savingsPct:       40,
    paystackProductId: process.env.PAYSTACK_PRODUCT_CREDITS_50000 ?? "",
  },
] as const;

export type CreditPackId = typeof CREDIT_PACKS[number]["id"];
