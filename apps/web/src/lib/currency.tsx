"use client";
import { createContext, useContext } from "react";

export type Currency = "NGN";

interface CurrencyCtx {
  currency: Currency;
}

const Ctx = createContext<CurrencyCtx>({ currency: "NGN" });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ currency: "NGN" }}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  return useContext(Ctx);
}
