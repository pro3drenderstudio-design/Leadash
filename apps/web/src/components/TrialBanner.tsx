"use client";
import Link from "next/link";

interface Props {
  trialEndsAt: string; // ISO string
}

export default function TrialBanner({ trialEndsAt }: Props) {
  const expiryDate = new Date(trialEndsAt);
  const msLeft     = expiryDate.getTime() - Date.now();
  const daysLeft   = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const expired    = daysLeft === 0;

  const formattedDate = expiryDate.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  if (expired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap">
        <span>
          Your 14-day trial expired on <strong>{formattedDate}</strong>. Outreach is paused — upgrade to re-enable inboxes and warmup. Lead campaigns still work with credits.
        </span>
        <Link
          href="/settings?tab=billing"
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          Upgrade now →
        </Link>
      </div>
    );
  }

  // Colour: green > 7 days, amber ≤ 7 days, orange ≤ 3 days
  const bg = daysLeft <= 3
    ? "bg-orange-600"
    : daysLeft <= 7
    ? "bg-amber-500"
    : "bg-emerald-600";

  const label = daysLeft === 1
    ? "Your free trial expires tomorrow"
    : daysLeft <= 7
    ? `Your free trial expires in ${daysLeft} days`
    : `Free trial active`;

  return (
    <div className={`${bg} text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap`}>
      <span>
        {label} — <strong>{formattedDate}</strong>. Upgrade before it expires to keep outreach running.
      </span>
      <Link
        href="/settings?tab=billing"
        className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
      >
        View plans →
      </Link>
    </div>
  );
}
