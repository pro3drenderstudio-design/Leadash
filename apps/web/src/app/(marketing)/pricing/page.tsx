import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";

export default function PricingPage() {
  const plans = Object.values(PLANS);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <Link href="/" className="text-lg font-bold tracking-tight">Leadash</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-400 hover:text-white">Sign in</Link>
          <Link href="/signup" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg">Start free</Link>
        </div>
      </nav>

      <div className="text-center px-4 py-16 max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-400 mb-12">Start free, upgrade when you scale.</p>

        <div className="grid md:grid-cols-4 gap-6">
          {plans.map(plan => (
            <div key={plan.id} className={`rounded-xl p-6 text-left border ${plan.id === "growth" ? "border-blue-500 bg-blue-500/5" : "border-white/10 bg-gray-900"}`}>
              {plan.id === "growth" && (
                <div className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full inline-block mb-3">Most popular</div>
              )}
              <h3 className="font-semibold text-white mb-1">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold">${plan.price}</span>
                {plan.price > 0 && <span className="text-gray-400 text-sm">/mo</span>}
              </div>
              <ul className="space-y-2 text-sm text-gray-400 mb-6">
                <li>{plan.maxInboxes} inboxes</li>
                <li>{plan.maxMonthlySends.toLocaleString()} emails/month</li>
                <li>{plan.maxSeats === 999999 ? "Unlimited" : plan.maxSeats} seat{plan.maxSeats !== 1 ? "s" : ""}</li>
                <li>Inbox warmup</li>
                <li>AI reply classification</li>
                {plan.id !== "free" && <li>Priority support</li>}
              </ul>
              <Link
                href={plan.price === 0 ? "/signup" : `/signup?plan=${plan.id}`}
                className={`block text-center text-sm font-medium py-2 rounded-lg transition-colors ${plan.id === "growth" ? "bg-blue-600 hover:bg-blue-700 text-white" : "border border-white/15 hover:border-white/30 text-white"}`}
              >
                {plan.price === 0 ? "Start free" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
