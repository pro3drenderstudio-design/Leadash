import type { CreditPack } from "@/types/lead-campaigns";

export const PLANS = {
  free: {
    id:                  "free",
    name:                "Free",
    price:               0,
    priceId:             null,
    stripePriceId:       null,
    maxInboxes:          3,
    maxMonthlySends:     1_000,
    maxSeats:            1,
    includedLeadCredits: 0,
    features: {
      abTesting:           false,
      aiClassification:    false,
      apiAccess:           false,
      webhooks:            false,
      whiteLabel:          false,
    },
  },
  starter: {
    id:                  "starter",
    name:                "Starter",
    price:               49,
    priceId:             process.env.STRIPE_PRICE_STARTER ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_STARTER ?? "",
    maxInboxes:          10,
    maxMonthlySends:     25_000,
    maxSeats:            3,
    includedLeadCredits: 500,
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           false,
      webhooks:            false,
      whiteLabel:          false,
    },
  },
  growth: {
    id:                  "growth",
    name:                "Growth",
    price:               149,
    priceId:             process.env.STRIPE_PRICE_GROWTH ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_GROWTH ?? "",
    maxInboxes:          50,
    maxMonthlySends:     150_000,
    maxSeats:            10,
    includedLeadCredits: 2_000,
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           true,
      webhooks:            true,
      whiteLabel:          false,
    },
  },
  scale: {
    id:                  "scale",
    name:                "Scale",
    price:               399,
    priceId:             process.env.STRIPE_PRICE_SCALE ?? "",
    stripePriceId:       process.env.STRIPE_PRICE_SCALE ?? "",
    maxInboxes:          500,
    maxMonthlySends:     1_000_000,
    maxSeats:            999999,
    includedLeadCredits: 10_000,
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           true,
      webhooks:            true,
      whiteLabel:          false,
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? PLANS.free;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_500",   credits: 500,   price_usd: 19,  stripe_price_id: process.env.STRIPE_PRICE_CREDITS_500   ?? "", label: "Starter pack" },
  { id: "pack_2000",  credits: 2000,  price_usd: 59,  stripe_price_id: process.env.STRIPE_PRICE_CREDITS_2000  ?? "", label: "Growth pack"  },
  { id: "pack_5000",  credits: 5000,  price_usd: 129, stripe_price_id: process.env.STRIPE_PRICE_CREDITS_5000  ?? "", label: "Best value"   },
  { id: "pack_10000", credits: 10000, price_usd: 249, stripe_price_id: process.env.STRIPE_PRICE_CREDITS_10000 ?? "", label: "Scale pack"   },
];
