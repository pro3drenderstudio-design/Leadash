"use client";

/**
 * Client-side currency context. Seeded with the server-resolved
 * `CurrencyContext` (from x-vercel-ip-country + the currency_rates table)
 * so the very first render already shows local prices — no flicker, no
 * client-side fetch.
 *
 * Components consume the context via `useCurrency()` and get either the
 * raw fields or the convenience `formatPrice()` / `formatPriceApprox()`
 * helpers that wrap the pure formatters from `lib/currency/format`.
 */

import { createContext, useContext, useMemo } from "react";
import {
  formatLocalPrice,
  formatLocalPriceApprox,
  NGN_CONTEXT,
  type CurrencyContext,
} from "@/lib/currency/format";

type CtxValue = CurrencyContext & {
  /** Format an NGN amount as local currency. Same currency for Nigerian visitors. */
  formatPrice:        (amountNgn: number) => string;
  /** Same as formatPrice but prefixes "≈" for non-NGN visitors (signals approximate / conversion). */
  formatPriceApprox:  (amountNgn: number) => string;
  /** True when the visitor's currency is NGN. */
  isNgn:              boolean;
};

const Ctx = createContext<CtxValue>({
  ...NGN_CONTEXT,
  formatPrice:       a => formatLocalPrice(a, NGN_CONTEXT),
  formatPriceApprox: a => formatLocalPriceApprox(a, NGN_CONTEXT),
  isNgn:             true,
});

export function CurrencyProvider({
  context = NGN_CONTEXT,
  children,
}: {
  /** Resolved on the server via `getCurrencyContext()` and passed down. */
  context?: CurrencyContext;
  children: React.ReactNode;
}) {
  const value = useMemo<CtxValue>(() => ({
    ...context,
    formatPrice:       a => formatLocalPrice(a, context),
    formatPriceApprox: a => formatLocalPriceApprox(a, context),
    isNgn:             context.currency === "NGN",
  }), [context]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  return useContext(Ctx);
}

// Re-export the type so consumers don't need to know about the split.
export type { CurrencyContext } from "@/lib/currency/format";
