/**
 * Pure formatting helpers — no React, no DB. Used by both server components
 * (the marketing landing page renders prices on the server) and the client
 * CurrencyProvider to format prices identically on both sides of the wire.
 *
 * The convention: every price in our system is stored in NGN. To display it
 * we multiply by `rateToNgn` of the visitor's currency and format with
 * Intl.NumberFormat.
 */

export type CurrencyContext = {
  /** ISO 4217 currency code, e.g. "NGN", "KES", "USD". */
  currency:   string;
  /** Multiplier: 1 NGN = rateToNgn `currency` units. NGN viewers always get 1. */
  rateToNgn:  number;
  /** Display symbol, e.g. "₦", "$", "KSh". null → use ISO code as prefix. */
  symbol:     string | null;
  /** ISO-3166 country code we resolved from, for debugging / settings UI. null = unknown. */
  country:    string | null;
};

/** A CurrencyContext that always represents Nigeria — safe fallback when
 *  the cron hasn't run yet or the table query fails. */
export const NGN_CONTEXT: CurrencyContext = {
  currency:  "NGN",
  rateToNgn: 1,
  symbol:    "₦",
  country:   "NG",
};

/**
 * Format an amount stored in NGN as the visitor's local currency.
 *
 *  - Same currency (Nigerian visitor): "₦15,000"
 *  - Different currency (Kenyan visitor): "KSh 6,500"
 *
 * Decimals: 0 for currencies that conventionally don't show fractions
 * (NGN, KES, UGX, JPY, etc.); 2 for everything else. The Intl.NumberFormat
 * already respects this via the `currencyDisplay` option, but we pass an
 * explicit fraction-digit hint so the output is consistent across runtimes.
 */
export function formatLocalPrice(amountNgn: number, ctx: CurrencyContext): string {
  if (!Number.isFinite(amountNgn)) return "—";

  // Convert to local. For NGN visitors this is a no-op (rate = 1).
  const local = amountNgn * ctx.rateToNgn;

  // All displayed prices are rounded to the nearest whole unit for clarity.
  // The charged amount (always NGN, exact) is unaffected — this only changes
  // what the visitor sees on the screen.
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(local));

  // Prefer a tight symbol prefix when we have one; otherwise use the ISO code.
  if (ctx.symbol) return `${ctx.symbol}${formatted}`;
  return `${ctx.currency} ${formatted}`;
}

/**
 * Like `formatLocalPrice` but for visitors whose currency isn't NGN, prefix
 * the result with a "≈" so they know it's a conversion estimate. Used in places
 * where we still want to show the NGN amount as the source of truth and the
 * local figure only as guidance ("billed in NGN by Paystack").
 */
export function formatLocalPriceApprox(amountNgn: number, ctx: CurrencyContext): string {
  const base = formatLocalPrice(amountNgn, ctx);
  return ctx.currency === "NGN" ? base : `≈ ${base}`;
}

