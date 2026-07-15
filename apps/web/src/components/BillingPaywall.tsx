"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { AccessBlockReason } from "@/lib/billing/access";

const COPY: Record<Exclude<AccessBlockReason, null>, { title: string; body: string; cta: string }> = {
  past_due: {
    title: "Payment required",
    body:   "Your last payment failed. Pay your invoice to keep using Leadash.",
    cta:    "Pay invoice",
  },
  canceled: {
    title: "Pick a plan to continue",
    body:   "Your subscription has ended. Choose a plan to keep using Leadash.",
    cta:    "View plans",
  },
  trial_expired: {
    title: "Pick a plan to continue",
    body:   "Your trial has ended. Choose a plan to keep using Leadash.",
    cta:    "View plans",
  },
  no_plan: {
    title: "Pick a plan to get started",
    body:   "Leadash runs on a paid plan — choose one below to unlock your dashboard.",
    cta:    "View plans",
  },
};

export default function BillingPaywall({ reason, children }: { reason: AccessBlockReason; children: React.ReactNode }) {
  const pathname = usePathname();

  // Academy has its own independent "coming soon" gate (apps/web/src/app/(app)/academy/layout.tsx)
  // that's unrelated to billing — never cover it. /settings must stay reachable too: the paywall's
  // own CTA links there ("Pick a plan"/"Pay invoice") — without this exemption a blocked user could
  // never reach the plan picker or payment-method form to resolve their own block.
  const exempt = pathname?.startsWith("/academy") || pathname?.startsWith("/settings");

  if (exempt || !reason) return <>{children}</>;

  const copy = COPY[reason];

  return (
    <div className="relative h-full">
      <div aria-hidden className="h-full overflow-hidden pointer-events-none select-none" style={{ filter: "blur(6px)" }}>
        {children}
      </div>
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
        <div className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 text-center">
          <h2 className="text-white font-semibold text-base mb-1">{copy.title}</h2>
          <p className="text-white/50 text-sm mb-5">{copy.body}</p>
          <Link
            href="/settings?tab=billing"
            className="block w-full py-2.5 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors"
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
