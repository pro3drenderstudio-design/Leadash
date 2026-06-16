/**
 * GET /api/debug-currency
 *
 * Diagnostic endpoint — returns the country Vercel detected, the currency
 * we resolved for it, and the current rate from the database. Use this to
 * debug "I'm on a VPN and still see NGN" issues. Public on purpose so the
 * operator can hit it from a browser, but it leaks nothing sensitive.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency/country-currency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const country = req.headers.get("x-vercel-ip-country");
  const resolvedCurrency = currencyForCountry(country);

  const db = createAdminClient();
  const { data: rate } = await db
    .from("currency_rates")
    .select("currency_code, rate_to_ngn, symbol, updated_at")
    .eq("currency_code", resolvedCurrency)
    .maybeSingle();

  return NextResponse.json({
    detected_country:        country ?? null,
    resolved_currency:       resolvedCurrency,
    rate_row_found:          !!rate,
    rate:                    rate ?? null,
    note: rate
      ? "Local currency display should work for this country."
      : `No row in currency_rates for ${resolvedCurrency}. The page will fall back to NGN until /api/cron/refresh-fx is run.`,
  });
}
