"use client";
import Link from "next/link";

interface Props {
  graceEndsAt: string; // ISO string
}

export default function PastDueBanner({ graceEndsAt }: Props) {
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

  return (
    <div className={`${bg} text-white px-4 py-2 text-sm font-medium flex items-center justify-between gap-4 flex-wrap`}>
      <span>{urgency} All campaigns are paused.</span>
      <Link
        href="/settings?tab=billing"
        className="flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
      >
        Update payment →
      </Link>
    </div>
  );
}
