"use client";
import { useState } from "react";
import Link from "next/link";

interface Props {
  graceEndsAt: string; // ISO string
}

export default function PastDueBanner({ graceEndsAt }: Props) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const graceDate = new Date(graceEndsAt);
  const msLeft    = graceDate.getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60)));
  const daysLeft  = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  const formattedDate = graceDate.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  const urgency = hoursLeft === 0
    ? "Your subscription payment failed. Your account will be downgraded to Free shortly."
    : daysLeft <= 1
    ? `Payment failed — your account will be downgraded to Free in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`
    : `Payment failed — your account will be downgraded to Free on ${formattedDate} unless you update your payment method.`;

  const bg = hoursLeft === 0 ? "bg-red-600" : daysLeft <= 1 ? "bg-orange-600" : "bg-amber-500";

  async function retryCharge() {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/billing/paystack/retry-charge", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (res.ok && data.ok) {
        setResult({ ok: true, msg: "Payment successful! Your account has been restored." });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setResult({ ok: false, msg: data.error ?? "Payment failed. Please update your card." });
      }
    } catch {
      setResult({ ok: false, msg: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={`${bg} text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap`}>
        <span>{urgency} All campaigns are paused.</span>
        <button
          onClick={() => { setOpen(true); setResult(null); }}
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          Fix payment →
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-white font-semibold text-base mb-1">Payment required</h2>
            <p className="text-white/50 text-sm mb-5">
              {daysLeft > 0
                ? `Your account will be downgraded on ${formattedDate}. Retry your payment or update your card to continue.`
                : "Your grace period has ended. Retry your payment or update your card to restore access."}
            </p>

            {result && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${result.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                {result.msg}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={retryCharge}
                disabled={loading || result?.ok}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {loading ? "Retrying…" : "Retry payment"}
              </button>
              <Link
                href="/settings?tab=billing"
                onClick={() => setOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-white/5 hover:bg-white/10 text-white/80 transition-colors"
              >
                Update card details
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="text-white/30 hover:text-white/50 text-xs text-center pt-1 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
