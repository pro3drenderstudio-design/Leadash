import { createAdminClient } from "@/lib/supabase/server";

export interface AffiliateConfig {
  bounty_ngn:       number;
  recurring_months: number;
  cookie_days:      number;
  min_payout_ngn:   number;
  hold_days:        number;
  credit_multiplier:number;
  silver_threshold: number;
  gold_threshold:   number;
  bronze_rate:      number;
  silver_rate:      number;
  gold_rate:        number;
}

export const AFFILIATE_DEFAULTS: AffiliateConfig = {
  bounty_ngn:       5000,
  recurring_months: 12,
  cookie_days:      30,
  min_payout_ngn:   20000,
  hold_days:        45,
  credit_multiplier:1.25,
  silver_threshold: 10,
  gold_threshold:   25,
  bronze_rate:      0.20,
  silver_rate:      0.25,
  gold_rate:        0.30,
};

const KEYS = [
  "affiliate_bounty_ngn","affiliate_recurring_months","affiliate_cookie_days",
  "affiliate_min_payout_ngn","affiliate_hold_days","affiliate_credit_multiplier",
  "affiliate_silver_threshold","affiliate_gold_threshold",
  "affiliate_bronze_rate","affiliate_silver_rate","affiliate_gold_rate",
] as const;

export async function getAffiliateConfig(
  db?: ReturnType<typeof createAdminClient>,
): Promise<AffiliateConfig> {
  const client = db ?? createAdminClient();
  const { data } = await client.from("admin_settings").select("key, value").in("key", KEYS);
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  function n(suffix: string, def: number) {
    const v = map[`affiliate_${suffix}`];
    const num = Number(v);
    return Number.isFinite(num) && num > 0 ? num : def;
  }

  return {
    bounty_ngn:       n("bounty_ngn",       AFFILIATE_DEFAULTS.bounty_ngn),
    recurring_months: n("recurring_months", AFFILIATE_DEFAULTS.recurring_months),
    cookie_days:      n("cookie_days",      AFFILIATE_DEFAULTS.cookie_days),
    min_payout_ngn:   n("min_payout_ngn",   AFFILIATE_DEFAULTS.min_payout_ngn),
    hold_days:        n("hold_days",        AFFILIATE_DEFAULTS.hold_days),
    credit_multiplier:n("credit_multiplier",AFFILIATE_DEFAULTS.credit_multiplier),
    silver_threshold: n("silver_threshold", AFFILIATE_DEFAULTS.silver_threshold),
    gold_threshold:   n("gold_threshold",   AFFILIATE_DEFAULTS.gold_threshold),
    bronze_rate:      n("bronze_rate",      AFFILIATE_DEFAULTS.bronze_rate),
    silver_rate:      n("silver_rate",      AFFILIATE_DEFAULTS.silver_rate),
    gold_rate:        n("gold_rate",        AFFILIATE_DEFAULTS.gold_rate),
  };
}
