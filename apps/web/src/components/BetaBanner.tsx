"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function BetaBanner() {
  const [status, setStatus] = useState<"approved" | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check session storage — don't re-fetch every navigation
    const cached = sessionStorage.getItem("beta_dismissed");
    if (cached) { setDismissed(true); return; }

    fetch("/api/beta/enroll")
      .then(r => r.json())
      .then(d => {
        if (d.enrollment?.status === "approved") setStatus("approved");
        else setStatus(null);
      })
      .catch(() => setStatus(null));
  }, []);

  function dismiss() {
    sessionStorage.setItem("beta_dismissed", "1");
    setDismissed(true);
  }

  if (dismissed || status !== "approved") return null;

  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5 text-sm" style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.08) 100%)", borderBottom: "1px solid rgba(249,115,22,0.2)" }}>
      {/* Glow dot */}
      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-orange-400 animate-pulse" />

      <p className="flex-1 text-orange-300/90 text-xs font-medium">
        <span className="font-bold text-orange-300">You&apos;re part of the Leadash Beta!</span>
        {" "}You have free Starter access for 30 days.{" "}
        <Link href="/beta" className="underline underline-offset-2 hover:text-orange-200 transition-colors">
          Learn more
        </Link>
      </p>

      <button
        onClick={dismiss}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-orange-400/60 hover:text-orange-300 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
