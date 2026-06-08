"use client";

/**
 * CreditsProvider — single source of truth for the workspace credit balance,
 * shown in both the Sidebar and the AppHeader.
 *
 * It seeds itself from server-rendered props so the first paint is instant,
 * then listens for the `ld:credits-changed` window event and refetches the
 * live balance from `/api/lead-campaigns/credits`. Any client-side code that
 * performs a credit-spending action calls `emitCreditsChanged()` and both
 * displays update in lock-step.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { wsGet } from "@/lib/workspace/client";
import { CREDITS_CHANGED_EVENT } from "@/lib/credits/events";

type CreditsState = {
  credits: number;
  monthlyCredits: number;
  lifetimeCredits: number;
  refresh: () => Promise<void>;
};

const CreditsContext = createContext<CreditsState | null>(null);

export function useCredits(): CreditsState {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used inside <CreditsProvider>");
  return ctx;
}

type Props = {
  initialCredits: number;
  initialMonthlyCredits: number;
  children: React.ReactNode;
};

export default function CreditsProvider({ initialCredits, initialMonthlyCredits, children }: Props) {
  const [credits, setCredits]               = useState(initialCredits);
  const [monthlyCredits, setMonthlyCredits] = useState(initialMonthlyCredits);
  const [lifetimeCredits, setLifetimeCredits] = useState(Math.max(0, initialCredits - initialMonthlyCredits));
  // Coalesce bursts of events (e.g. a bulk action firing N events) into a single fetch.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await wsGet<{ balance: number; monthly_credits: number; lifetime_credits: number }>(
        "/api/lead-campaigns/credits",
      );
      setCredits(d.balance ?? 0);
      setMonthlyCredits(d.monthly_credits ?? 0);
      setLifetimeCredits(d.lifetime_credits ?? 0);
    } catch { /* network blip — keep previous values */ }
  }, []);

  useEffect(() => {
    function onChanged() {
      if (pending.current) clearTimeout(pending.current);
      // Small debounce so a burst of credit events triggers exactly one refetch.
      pending.current = setTimeout(() => { refresh(); }, 80);
    }
    window.addEventListener(CREDITS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChanged);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [refresh]);

  return (
    <CreditsContext.Provider value={{ credits, monthlyCredits, lifetimeCredits, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}
