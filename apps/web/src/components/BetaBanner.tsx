"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function BetaBanner() {
  const [status, setStatus]       = useState<"approved" | null | undefined>(undefined);
  const [trialEndsAt, setTrial]   = useState<string | null>(null);
  const [hasPaidPlan, setHasPaid] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("beta_dismissed");
    if (cached) { setDismissed(true); return; }

    fetch("/api/beta/enroll")
      .then(r => r.json())
      .then(d => {
        if (d.enrollment?.status === "approved") {
          setStatus("approved");
          setTrial(d.trialEndsAt ?? null);
          setHasPaid(!!d.hasPaidPlan);
        } else {
          setStatus(null);
        }
      })
      .catch(() => setStatus(null));
  }, []);

  function dismiss() {
    sessionStorage.setItem("beta_dismissed", "1");
    setDismissed(true);
  }

  if (dismissed || status !== "approved") return null;

  // Hide once user has chosen a paid plan
  if (hasPaidPlan) return null;

  // Compute days left
  const msLeft   = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : null;
  const daysLeft = msLeft !== null ? Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))) : null;
  const expired  = daysLeft !== null && daysLeft === 0;

  // Auto-hide once the 30-day beta period has elapsed
  if (expired) return null;

  const daysLabel = daysLeft !== null
    ? daysLeft === 1 ? "1 day remaining" : `${daysLeft} days remaining`
    : "30 days";

  const expiryText = trialEndsAt
    ? `Expires ${new Date(trialEndsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`
    : null;

  return (
    <div className="w-full relative flex items-center justify-center gap-3 px-4 py-2.5 text-sm" style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.08) 100%)", borderBottom: "1px solid rgba(249,115,22,0.2)" }}>
      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-orange-400 animate-pulse" />

      <p className="text-orange-300/90 text-xs font-medium text-center">
        <span className="font-bold text-orange-300">You&apos;re in the Leadash Beta!</span>
        {" "}Free Starter access — <span className="font-semibold text-orange-200">{daysLabel}</span>
        {expiryText && <span className="text-orange-400/60"> · {expiryText}</span>}
        {daysLeft !== null && daysLeft <= 5 && (
          <>
            {" "}·{" "}
            <Link href="/settings?tab=billing" className="underline underline-offset-2 hover:text-orange-200 transition-colors font-semibold">
              Upgrade to keep access
            </Link>
          </>
        )}
        {(daysLeft === null || daysLeft > 5) && (
          <>
            {" "}·{" "}
            <Link href="/beta" className="underline underline-offset-2 hover:text-orange-200 transition-colors">
              Learn more
            </Link>
          </>
        )}
      </p>

      <button
        onClick={dismiss}
        className="absolute right-3 w-5 h-5 flex items-center justify-center rounded text-orange-400/60 hover:text-orange-300 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
