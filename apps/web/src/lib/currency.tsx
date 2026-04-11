"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Currency = "USD" | "NGN";

interface CurrencyCtx {
  currency:    Currency;
  setCurrency: (c: Currency) => void;
  detected:    boolean; // true once geo-detection has resolved
}

const Ctx = createContext<CurrencyCtx>({
  currency:    "USD",
  setCurrency: () => {},
  detected:    false,
});

const LS_KEY = "leadash_currency";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, _setCurrency] = useState<Currency>("USD");
  const [detected, setDetected]  = useState(false);

  useEffect(() => {
    // 1. Honour an explicit user choice stored in localStorage
    const stored = localStorage.getItem(LS_KEY) as Currency | null;
    if (stored === "USD" || stored === "NGN") {
      _setCurrency(stored);
      setDetected(true);
      return;
    }

    // 2. Detect country via Cloudflare's free trace endpoint (no auth, no rate limit)
    fetch("https://cloudflare.com/cdn-cgi/trace")
      .then(r => r.text())
      .then(text => {
        const loc = text.match(/loc=([A-Z]{2})/)?.[1];
        _setCurrency(loc === "NG" ? "NGN" : "USD");
      })
      .catch(() => { /* keep default USD */ })
      .finally(() => setDetected(true));
  }, []);

  function setCurrency(c: Currency) {
    _setCurrency(c);
    localStorage.setItem(LS_KEY, c);
  }

  return <Ctx.Provider value={{ currency, setCurrency, detected }}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  return useContext(Ctx);
}
