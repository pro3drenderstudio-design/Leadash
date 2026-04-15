"use client";
import Link from "next/link";

interface Props {
  trialEndsAt: string; // ISO string
}

export default function TrialBanner({ trialEndsAt }: Props) {
  const msLeft  = new Date(trialEndsAt).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const expired  = daysLeft === 0;

  if (expired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap">
        <span>
          Your free trial has expired. Inboxes and warmup have been paused.
        </span>
        <Link
          href="/settings/billing"
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
        >
          Upgrade now →
        </Link>
      </div>
    );
  }

  if (daysLeft > 7) return null; // Only show banner in the last 7 days

  return (
    <div className="bg-amber-500 text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap">
      <span>
        {daysLeft === 1
          ? "Your free trial expires tomorrow."
          : `Your free trial expires in ${daysLeft} days.`}
        {" "}Upgrade to keep your inboxes and warmup running.
      </span>
      <Link
        href="/settings/billing"
        className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
      >
        Upgrade →
      </Link>
    </div>
  );
}
