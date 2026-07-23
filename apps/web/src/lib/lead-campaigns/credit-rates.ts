import { createAdminClient } from "@/lib/supabase/server";

export interface CreditRates {
  verify:             number; // per lead for email verification
  discover:           number; // per lead for discover reveal / export
  first_line:         number; // per lead for AI first line / enrichment
  scrape:             number; // per lead for lead campaign scraping
  ai_prospect_haiku:  number; // per lead exported from AI Prospect Search (Haiku model)
  ai_prospect_sonnet: number; // per lead exported from AI Prospect Search (Sonnet model)
  ai_prospect_opus:   number; // per lead exported from AI Prospect Search (Opus model)
}

const DEFAULTS: CreditRates = {
  verify:             0.5,
  discover:           0.5,
  first_line:         1.0,
  scrape:             1.0,
  ai_prospect_haiku:  3,
  ai_prospect_sonnet: 5,
  ai_prospect_opus:   9,
};

const KEYS = [
  "credit_rate_verify",
  "credit_rate_discover",
  "credit_rate_first_line",
  "credit_rate_scrape",
  "credit_rate_ai_prospect_haiku",
  "credit_rate_ai_prospect_sonnet",
  "credit_rate_ai_prospect_opus",
] as const;

export async function getCreditRates(): Promise<CreditRates> {
  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from("admin_settings")
    .select("key, value")
    .in("key", [...KEYS]);

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    const n = Number(row.value);
    if (Number.isFinite(n) && n > 0) map[row.key] = n;
  }

  return {
    verify:             map.credit_rate_verify              ?? DEFAULTS.verify,
    discover:           map.credit_rate_discover            ?? DEFAULTS.discover,
    first_line:         map.credit_rate_first_line          ?? DEFAULTS.first_line,
    scrape:             map.credit_rate_scrape              ?? DEFAULTS.scrape,
    ai_prospect_haiku:  map.credit_rate_ai_prospect_haiku  ?? DEFAULTS.ai_prospect_haiku,
    ai_prospect_sonnet: map.credit_rate_ai_prospect_sonnet ?? DEFAULTS.ai_prospect_sonnet,
    ai_prospect_opus:   map.credit_rate_ai_prospect_opus   ?? DEFAULTS.ai_prospect_opus,
  };
}
