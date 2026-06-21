/**
 * GET /api/cron/refresh-fx
 *
 * Runs daily. Pulls latest FX rates from open.er-api.com (free, keyless),
 * converts them all to "1 NGN = X local" form, and upserts the
 * `currency_rates` table so the geo-aware CurrencyProvider can display
 * NGN prices in each visitor's local currency.
 *
 * Source rate base is USD because that's what the API returns. We derive
 * the NGN-to-X rate as: (rates[X] / rates[NGN]).
 *
 * Auth: same CRON_SECRET header as every other cron route in this project.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Currencies we actually display. Anything outside this list ends up as USD
// in the provider, so there's no point storing rates we'll never look up.
const TRACKED_CURRENCIES = [
  "NGN",
  // Paystack-native + major African
  "GHS","KES","ZAR","EGP","MAD","TND","DZD","LYD",
  // East / Central / Horn
  "ETB","UGX","TZS","RWF","BIF","SOS","DJF","ERN","SDG","SSP",
  // Southern
  "MZN","ZMW","ZWL","MWK","BWP","NAD","LSL","SZL","AOA",
  // West / Central African
  "XOF","XAF","CDF","GNF","SLE","LRD","GMD","MRU",
  // Indian Ocean
  "MGA","MUR","SCR","KMF","CVE","STN",
  // Diaspora majors
  "USD","EUR","GBP","CAD","AUD","NZD","CHF","SEK","NOK","DKK","PLN","MXN",
  "AED","SAR","INR","PKR","BDT","CNY","JPY","KRW","HKD","SGD","BRL","ARS",
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹",
  KES: "KSh", GHS: "GH₵", ZAR: "R", EGP: "£", MAD: "DH", AED: "د.إ",
};

type OpenErApiResponse = {
  result: "success" | "error";
  rates?: Record<string, number>;
  "error-type"?: string;
};

export async function GET(req: NextRequest) {
  // Auth — same pattern as every other cron in this project
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? req.nextUrl.searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // open.er-api.com is free and requires no API key. Rates are quoted vs USD.
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: `FX provider returned ${res.status}` }, { status: 502 });
  }
  const data = await res.json() as OpenErApiResponse;
  if (data.result !== "success" || !data.rates) {
    return NextResponse.json({ error: data["error-type"] ?? "FX provider error" }, { status: 502 });
  }

  // Convert USD-based rates into "1 NGN = X local" form.
  // (rate[NGN] is how many NGN per USD; rate[X]/rate[NGN] gives X per NGN.)
  const usdPerNgn = data.rates["NGN"];
  if (!usdPerNgn || usdPerNgn <= 0) {
    return NextResponse.json({ error: "NGN rate missing from FX response" }, { status: 502 });
  }

  const rows = TRACKED_CURRENCIES
    .filter(code => code === "NGN" || data.rates![code] != null)
    .map(code => ({
      currency_code: code,
      rate_to_ngn:   code === "NGN" ? 1 : data.rates![code] / usdPerNgn,
      symbol:        CURRENCY_SYMBOLS[code] ?? null,
      updated_at:    new Date().toISOString(),
      source:        "open.er-api.com",
    }));

  const db = createAdminClient();
  const { error } = await db.from("currency_rates").upsert(rows, { onConflict: "currency_code" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
