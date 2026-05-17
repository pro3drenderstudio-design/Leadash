"use client";
import Link from "next/link";

interface Props {
  renewsAt: string;
}

export default function SubscriptionRenewalBanner({ renewsAt }: Props) {
  const renewalDate = new Date(renewsAt);
  const msLeft      = renewalDate.getTime() - Date.now();
  const daysLeft    = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const overdue     = daysLeft <= 0;

  const formattedDate = renewalDate.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  if (overdue) {
    return (
      <div className="bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap">
        <span>
          Your subscription renewal was due on <strong>{formattedDate}</strong>. Update your payment method to avoid service interruption.
        </span>
        <Link
          href="/settings?tab=billing"
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          Update billing →
        </Link>
      </div>
    );
  }

  const bg = daysLeft <= 3 ? "bg-orange-600" : "bg-amber-500";
  const label = daysLeft === 1
    ? "Your subscription renews tomorrow"
    : `Your subscription renews in ${daysLeft} days`;

  return (
    <div className={`${bg} text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap`}>
      <span>
        {label} — <strong>{formattedDate}</strong>. Ensure your payment method is up to date.
      </span>
      <Link
        href="/settings?tab=billing"
        className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
      >
        View billing →
      </Link>
    </div>
  );
}
