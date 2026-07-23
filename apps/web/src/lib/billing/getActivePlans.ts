/**
 * getActivePlans() — Single source of truth for plan configuration.
 *
 * Reads from the `plan_configs` table so admins can change prices/limits
 * from the dashboard without a deploy. Falls back to plans.ts if the DB
 * is unavailable. Results are cached with a 60-second TTL and can be
 * invalidated immediately when an admin saves a change.
 */

import { createClient } from "@supabase/supabase-js";

export interface PlanConfig {
  plan_id:                 string;
  name:                    string;
  sort_order:              number;
  price_ngn:               number;
  price_usd:               number;
  paystack_plan_code:      string | null;
  paystack_plan_code_annual: string | null;
  stripe_price_id:         string | null;
  max_inboxes:             number;   // -1 = unlimited
  max_monthly_sends:       number;   // -1 = unlimited
  max_seats:               number;
  max_leads_pool:          number;
  included_credits:        number;
  trial_days:              number;
  inbox_monthly_price_ngn: number;
  ms_inbox_monthly_price_ngn: number;
  can_scrape_leads:        boolean;
  can_run_campaigns:       boolean;
  feat_warmup:             boolean;
  feat_preview_leads:      boolean;
  feat_ai_personalization: boolean;
  feat_ai_classification:  boolean;
  feat_api_access:         boolean;
  is_active:               boolean;
  updated_at:              string;
}

// Hard-coded fallback — used only if the DB is unreachable.
const FALLBACK_PLANS: PlanConfig[] = [
  {
    plan_id: "free", name: "Free Trial", sort_order: 0,
    price_ngn: 0, price_usd: 0, paystack_plan_code: null, paystack_plan_code_annual: null, stripe_price_id: null, ms_inbox_monthly_price_ngn: 4200,
    max_inboxes: 2, max_monthly_sends: 0, max_seats: 1,
    max_leads_pool: 2000, included_credits: 2000, trial_days: 14,
    inbox_monthly_price_ngn: 0,
    can_scrape_leads: true, can_run_campaigns: false,
    feat_warmup: true, feat_preview_leads: true,
    feat_ai_personalization: false, feat_ai_classification: false, feat_api_access: false,
    is_active: true, updated_at: new Date().toISOString(),
  },
  {
    plan_id: "starter", name: "Starter", sort_order: 1,
    price_ngn: 15000, price_usd: 10, paystack_plan_code: null, paystack_plan_code_annual: null, stripe_price_id: null, ms_inbox_monthly_price_ngn: 4200,
    max_inboxes: -1, max_monthly_sends: -1, max_seats: 3,
    max_leads_pool: 2000, included_credits: 2000, trial_days: 0,
    inbox_monthly_price_ngn: 2500,
    can_scrape_leads: true, can_run_campaigns: true,
    feat_warmup: true, feat_preview_leads: true,
    feat_ai_personalization: true, feat_ai_classification: true, feat_api_access: false,
    is_active: true, updated_at: new Date().toISOString(),
  },
  {
    plan_id: "growth", name: "Growth", sort_order: 2,
    price_ngn: 45000, price_usd: 28, paystack_plan_code: null, paystack_plan_code_annual: null, stripe_price_id: null, ms_inbox_monthly_price_ngn: 4200,
    max_inboxes: -1, max_monthly_sends: -1, max_seats: 10,
    max_leads_pool: 10000, included_credits: 20000, trial_days: 0,
    inbox_monthly_price_ngn: 2500,
    can_scrape_leads: true, can_run_campaigns: true,
    feat_warmup: true, feat_preview_leads: true,
    feat_ai_personalization: true, feat_ai_classification: true, feat_api_access: true,
    is_active: true, updated_at: new Date().toISOString(),
  },
  {
    plan_id: "scale", name: "Scale", sort_order: 3,
    price_ngn: 95000, price_usd: 59, paystack_plan_code: null, paystack_plan_code_annual: null, stripe_price_id: null, ms_inbox_monthly_price_ngn: 4200,
    max_inboxes: -1, max_monthly_sends: -1, max_seats: 999999,
    max_leads_pool: 35000, included_credits: 70000, trial_days: 0,
    inbox_monthly_price_ngn: 2500,
    can_scrape_leads: true, can_run_campaigns: true,
    feat_warmup: true, feat_preview_leads: true,
    feat_ai_personalization: true, feat_ai_classification: true, feat_api_access: true,
    is_active: true, updated_at: new Date().toISOString(),
  },
  {
    plan_id: "enterprise", name: "Enterprise", sort_order: 4,
    price_ngn: 250000, price_usd: 156, paystack_plan_code: null, paystack_plan_code_annual: null, stripe_price_id: null, ms_inbox_monthly_price_ngn: 4200,
    max_inboxes: -1, max_monthly_sends: -1, max_seats: 999999,
    max_leads_pool: 150000, included_credits: 300000, trial_days: 0,
    inbox_monthly_price_ngn: 2500,
    can_scrape_leads: true, can_run_campaigns: true,
    feat_warmup: true, feat_preview_leads: true,
    feat_ai_personalization: true, feat_ai_classification: true, feat_api_access: true,
    is_active: true, updated_at: new Date().toISOString(),
  },
];

// Simple in-memory TTL cache — works in both Next.js and plain Node.js (worker).
let _cache: PlanConfig[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 60_000;

async function fetchPlansFromDb(): Promise<PlanConfig[]> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !key) return FALLBACK_PLANS;
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("plan_configs")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return FALLBACK_PLANS;
    _cache   = data as PlanConfig[];
    _cacheAt = Date.now();
    return _cache;
  } catch {
    return FALLBACK_PLANS;
  }
}

/** Returns all active plans ordered by sort_order. Cached 60s. */
export async function getActivePlans(): Promise<PlanConfig[]> {
  const plans = await fetchPlansFromDb();
  return plans.filter(p => p.is_active);
}

/** Returns a single plan by ID, or the free plan as fallback. */
export async function getPlanById(planId: string): Promise<PlanConfig> {
  const plans = await fetchPlansFromDb();
  return plans.find(p => p.plan_id === planId) ?? plans.find(p => p.plan_id === "free") ?? FALLBACK_PLANS[0];
}

/** Returns a map of planId → PlanConfig for O(1) lookups. */
export async function getPlansMap(): Promise<Map<string, PlanConfig>> {
  const plans = await fetchPlansFromDb();
  return new Map(plans.map(p => [p.plan_id, p]));
}

/** Called by the admin PATCH route after saving to bust the in-process cache. */
export function invalidatePlanCache(): void {
  _cache   = null;
  _cacheAt = 0;
}
