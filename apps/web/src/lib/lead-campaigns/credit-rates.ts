import { createAdminClient } from "@/lib/supabase/server";

export interface CreditRates {
  verify:     number; // per lead for email verification
  discover:   number; // per lead for discover reveal / export
  first_line: number; // per lead for AI first line / enrichment
  scrape:     number; // per lead for lead campaign scraping
}

const DEFAULTS: CreditRates = {
  verify:     1.0,
  discover:   0.5,
  first_line: 1.0,
  scrape:     1.0,
};

const KEYS = [
  "credit_rate_verify",
  "credit_rate_discover",
  "credit_rate_first_line",
  "credit_rate_scrape",
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
    verify:     map.credit_rate_verify     ?? DEFAULTS.verify,
    discover:   map.credit_rate_discover   ?? DEFAULTS.discover,
    first_line: map.credit_rate_first_line ?? DEFAULTS.first_line,
    scrape:     map.credit_rate_scrape     ?? DEFAULTS.scrape,
  };
}
