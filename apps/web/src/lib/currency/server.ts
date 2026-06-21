/**
 * Server-only currency resolver.
 *
 * Given the incoming request's `x-vercel-ip-country` header (set automatically
 * by Vercel's edge), looks up the visitor's currency in the country mapping,
 * then loads its current rate-to-NGN from the `currency_rates` table.
 *
 * Result is cached per-request via React's `cache()` so multiple server
 * components calling getCurrencyContext() during one render share a single
 * DB read.
 */

import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { currencyForCountry, DEFAULT_CURRENCY } from "@/lib/currency/country-currency";
import { NGN_CONTEXT, type CurrencyContext } from "@/lib/currency/format";

type RateRow = { currency_code: string; rate_to_ngn: number; symbol: string | null };

/**
 * Resolve the visitor's currency context. Returns NGN_CONTEXT as a safe
 * fallback for any failure (missing header, DB miss, etc.) so the page
 * always renders.
 */
export const getCurrencyContext = cache(async (): Promise<CurrencyContext> => {
  let country: string | null = null;
  try {
    const h = await headers();
    country = h.get("x-vercel-ip-country");
  } catch {
    // headers() can throw outside a request context — fall through to defaults.
  }

  const currency = currencyForCountry(country);
  if (currency === DEFAULT_CURRENCY) {
    // Nigerian visitor — no conversion needed, skip the DB hit.
    return { ...NGN_CONTEXT, country: country?.toUpperCase() ?? NGN_CONTEXT.country };
  }

  // Fetch the rate from the public `currency_rates` table. We use a fresh
  // anonymous client here rather than the admin client because the table is
  // read-only public reference data — service role isn't needed.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NGN_CONTEXT;

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("currency_rates")
      .select("currency_code, rate_to_ngn, symbol")
      .eq("currency_code", currency)
      .maybeSingle<RateRow>();
    if (error || !data) return NGN_CONTEXT;

    return {
      currency:  data.currency_code,
      rateToNgn: Number(data.rate_to_ngn) || 1,
      symbol:    data.symbol,
      country:   country?.toUpperCase() ?? null,
    };
  } catch {
    return NGN_CONTEXT;
  }
});
