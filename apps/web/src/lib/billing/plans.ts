export const PLANS = {
  free: {
    id:               "free",
    name:             "Free",
    price:            0,
    priceId:          null,
    stripePriceId:    null,
    maxInboxes:       3,
    maxMonthlySends:  1_000,
    maxSeats:         1,
    features: {
      abTesting:           false,
      aiClassification:    false,
      apiAccess:           false,
      webhooks:            false,
      whiteLabel:          false,
    },
  },
  starter: {
    id:               "starter",
    name:             "Starter",
    price:            49,
    priceId:          process.env.STRIPE_PRICE_STARTER ?? "",
    stripePriceId:    process.env.STRIPE_PRICE_STARTER ?? "",
    maxInboxes:       10,
    maxMonthlySends:  25_000,
    maxSeats:         3,
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           false,
      webhooks:            false,
      whiteLabel:          false,
    },
  },
  growth: {
    id:               "growth",
    name:             "Growth",
    price:            149,
    priceId:          process.env.STRIPE_PRICE_GROWTH ?? "",
    stripePriceId:    process.env.STRIPE_PRICE_GROWTH ?? "",
    maxInboxes:       50,
    maxMonthlySends:  150_000,
    maxSeats:         10,
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           true,
      webhooks:            true,
      whiteLabel:          false,
    },
  },
  scale: {
    id:               "scale",
    name:             "Scale",
    price:            399,
    priceId:          process.env.STRIPE_PRICE_SCALE ?? "",
    stripePriceId:    process.env.STRIPE_PRICE_SCALE ?? "",
    maxInboxes:       500,
    maxMonthlySends:  1_000_000,
    maxSeats:         999999, // unlimited
    features: {
      abTesting:           true,
      aiClassification:    true,
      apiAccess:           true,
      webhooks:            true,
      whiteLabel:          false, // add-on
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? PLANS.free;
}
