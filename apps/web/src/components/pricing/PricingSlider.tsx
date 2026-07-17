"use client";

/**
 * "Pay for what you send" — volume-driven pricing calculator.
 *
 * The user drags to their intended monthly send volume; we derive the plan,
 * a recommended managed-inbox count (~1,000 campaign sends / inbox / month,
 * excluding warm-up ramp), and an itemized all-in monthly price.
 *
 * Self-contained + presentational: takes plans + an NGN→USD rate and does its
 * own NGN/USD + Monthly/Annual toggles, so it works both on the public v2
 * marketing tree (no CurrencyProvider) and in-app. The host supplies onCheckout.
 */

import { useMemo, useState } from "react";
import type { PlanConfig } from "@/lib/billing/getActivePlans";
import { formatLocalPrice, NGN_CONTEXT, type CurrencyContext } from "@/lib/currency/format";

// ~1,000 campaign sends per inbox per month at full send (excludes warm-up ramp).
const SENDS_PER_INBOX = 1000;
const SENDS_FLOOR = 500; // slider minimum

const PLAN_ORDER = ["starter", "growth", "scale", "enterprise"] as const;
const POPULAR_PLAN = "growth";

export interface SliderSelection {
  plan_id:          string;
  billing_interval: "monthly" | "annual";
  inbox_toggle:     boolean;
  inbox_count:      number;
  monthly_sends:    number;
}

interface Props {
  plans:       PlanConfig[];
  ngnPerUsd:   number; // 1 USD = ngnPerUsd NGN
  onCheckout:  (sel: SliderSelection) => void;
  checkoutLabel?: string;
  busy?:       boolean;
}

function capOf(p: PlanConfig): number {
  return p.max_monthly_sends === -1 ? 400000 : p.max_monthly_sends;
}
function maxInboxesFor(cap: number): number {
  return Math.max(1, Math.ceil(cap / SENDS_PER_INBOX));
}
function fmtSends(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export default function PricingSlider({ plans, ngnPerUsd, onCheckout, checkoutLabel = "Continue to checkout", busy }: Props) {
  // Order + keep only the four self-serve tiers, low → high by cap.
  const tiers = useMemo(
    () => PLAN_ORDER
      .map(id => plans.find(p => p.plan_id === id))
      .filter((p): p is PlanConfig => !!p),
    [plans],
  );

  const [pos, setPos]         = useState(0.42);          // slider position 0..1
  const [inboxOn, setInboxOn] = useState(true);
  const [manualInbox, setManualInbox] = useState<number | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");

  const segCount = Math.max(1, tiers.length);

  // Position → (sends, active tier). Each tier gets an equal visual segment.
  const { sends, tierIndex } = useMemo(() => {
    const seg = Math.min(segCount - 1, Math.floor(pos * segCount));
    const localT = pos * segCount - seg;
    const lo = seg === 0 ? SENDS_FLOOR : capOf(tiers[seg - 1]);
    const hi = capOf(tiers[seg]);
    return { sends: Math.round(lo + (hi - lo) * localT), tierIndex: seg };
  }, [pos, tiers, segCount]);

  const plan = tiers[tierIndex];
  const cap  = plan ? capOf(plan) : 0;
  const inboxMax = maxInboxesFor(cap);
  const recommendedInboxes = Math.min(inboxMax, Math.max(1, Math.ceil(sends / SENDS_PER_INBOX)));
  const inboxCount = manualInbox === null ? recommendedInboxes : Math.min(inboxMax, Math.max(1, manualInbox));

  // Currency
  const ctx: CurrencyContext = currency === "USD"
    ? { currency: "USD", rateToNgn: 1 / ngnPerUsd, symbol: "$", country: null }
    : NGN_CONTEXT;
  const fmt = (ngn: number) => formatLocalPrice(ngn, ctx);

  // Pricing. Annual = 10 months' price for the plan (2 months free), shown as a
  // per-month equivalent. Managed inboxes always bill monthly (separate system).
  const planPerMoNgn  = plan ? (interval === "annual" ? Math.round(plan.price_ngn * 10 / 12) : plan.price_ngn) : 0;
  const inboxUnitNgn  = plan?.inbox_monthly_price_ngn ?? 2500;
  const inboxPerMoNgn = inboxOn ? inboxCount * inboxUnitNgn : 0;
  const totalPerMoNgn = planPerMoNgn + inboxPerMoNgn;

  function selectTier(i: number) {
    // Snap to the middle of that tier's segment.
    setPos((i + 0.5) / segCount);
    setManualInbox(null);
  }

  const perks = useMemo(() => {
    if (!plan) return [] as string[];
    const seats = plan.max_seats >= 999999 ? "Unlimited" : String(plan.max_seats);
    const prev = tierIndex > 0 ? tiers[tierIndex - 1].name : null;
    const list: string[] = [
      `${plan.included_credits.toLocaleString()} lead credits / mo`,
      `${seats} team seat${seats === "1" ? "" : "s"}`,
      `${cap.toLocaleString()} monthly sends cap`,
    ];
    if (inboxOn) list.push(`${inboxCount} warmed sending inbox${inboxCount === 1 ? "" : "es"}`);
    if (prev) list.push(`Everything in ${prev}`);
    if (plan.can_scrape_leads) list.push("Lead scraping & enrichment");
    if (plan.feat_api_access) list.push("API access");
    list.push(`Up to ${maxInboxesFor(cap)} sending inboxes`);
    if (tierIndex >= 2) list.push("Priority support");
    return list;
  }, [plan, tierIndex, tiers, cap, inboxOn, inboxCount]);

  if (!plan) return null;

  return (
    <div className="w-full max-w-5xl mx-auto text-white">
      {/* Toggles */}
      <div className="flex items-center justify-end gap-2 mb-6">
        <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 text-xs font-semibold">
          {(["NGN", "USD"] as const).map(c => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded-md transition-colors ${currency === c ? "bg-orange-500 text-white" : "text-white/50 hover:text-white/80"}`}>
              {c === "NGN" ? "₦ NGN" : "$ USD"}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 text-xs font-semibold">
          <button onClick={() => setInterval("monthly")}
            className={`px-3 py-1.5 rounded-md transition-colors ${interval === "monthly" ? "bg-orange-500 text-white" : "text-white/50 hover:text-white/80"}`}>
            Monthly
          </button>
          <button onClick={() => setInterval("annual")}
            className={`px-3 py-1.5 rounded-md transition-colors ${interval === "annual" ? "bg-orange-500 text-white" : "text-white/50 hover:text-white/80"}`}>
            Annual · 2 mo free
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* Monthly sends card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">Monthly sends</p>
                <p className="text-4xl font-bold tabular-nums">
                  {sends.toLocaleString()}<span className="text-base font-medium text-white/40 ml-2">emails / mo</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-white/40 mb-1">Recommended plan</p>
                <span className="inline-block text-sm font-bold bg-orange-500 text-white px-3 py-1 rounded-lg">{plan.name}</span>
              </div>
            </div>

            <input
              type="range" min={0} max={1000} value={Math.round(pos * 1000)}
              onChange={e => { setPos(Number(e.target.value) / 1000); setManualInbox(null); }}
              className="w-full accent-orange-500 mb-4"
              aria-label="Monthly send volume"
            />

            <div className="grid grid-cols-4 gap-2">
              {tiers.map((t, i) => (
                <button key={t.plan_id} onClick={() => selectTier(i)}
                  className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                    i === tierIndex ? "border-orange-500/60 bg-orange-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${i === tierIndex ? "bg-orange-400" : "bg-white/30"}`} />
                    {t.name}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">up to {fmtSends(capOf(t))}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Leadash inboxes card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" className="w-4.5 h-4.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                </div>
                <div>
                  <p className="text-sm font-bold">Include Leadash inboxes</p>
                  <p className="text-xs text-white/50 mt-0.5 max-w-sm">
                    Done-for-you sending inboxes, warmed and rotated automatically. {fmt(inboxUnitNgn)} per inbox / mo.
                  </p>
                </div>
              </div>
              <button onClick={() => setInboxOn(v => !v)} aria-label="Toggle Leadash inboxes"
                className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors ${inboxOn ? "bg-orange-500" : "bg-white/15"}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${inboxOn ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {inboxOn && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">Inboxes</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {inboxCount}<span className="text-sm font-medium text-white/40 ml-1.5">× {fmt(inboxUnitNgn)}/mo</span>
                    </p>
                  </div>
                  {manualInbox !== null && manualInbox !== recommendedInboxes && (
                    <button onClick={() => setManualInbox(null)} className="text-xs font-semibold text-orange-400 hover:text-orange-300">
                      Reset to recommended
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setManualInbox(Math.max(1, inboxCount - 1))}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-lg leading-none">−</button>
                  <input
                    type="range" min={1} max={inboxMax} value={inboxCount}
                    onChange={e => setManualInbox(Number(e.target.value))}
                    className="flex-1 accent-orange-500"
                    aria-label="Inbox count"
                  />
                  <button onClick={() => setManualInbox(Math.min(inboxMax, inboxCount + 1))}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-lg leading-none">+</button>
                  <span className="text-[11px] text-white/40 w-24 text-right">max {inboxMax} on {plan.name}</span>
                </div>
                <p className="text-[11px] text-white/35 mt-3">~{SENDS_PER_INBOX.toLocaleString()} sends per inbox / mo at full send (excludes warm-up ramp).</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: summary ── */}
        <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <p className="text-base font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400" />{plan.name} plan
            </p>
            {plan.plan_id === POPULAR_PLAN && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">Popular</span>
            )}
          </div>

          <p className="text-4xl font-bold tabular-nums">
            {fmt(totalPerMoNgn)}<span className="text-base font-medium text-white/40 ml-1">/mo</span>
          </p>
          <p className="text-xs text-white/40 mt-1">
            {interval === "annual" ? "Billed annually · plan gets 2 months free" : "Billed monthly · cancel anytime"}
          </p>

          <div className="mt-5 pt-4 border-t border-white/10 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/60">{plan.name} plan <span className="text-white/35">up to {fmtSends(cap)} sends</span></span>
              <span className="font-semibold tabular-nums">{fmt(planPerMoNgn)}</span>
            </div>
            {inboxOn && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">{inboxCount} Leadash inbox{inboxCount === 1 ? "" : "es"} <span className="text-white/35">@ {fmt(inboxUnitNgn)} ea</span></span>
                <span className="font-semibold tabular-nums">{fmt(inboxPerMoNgn)}</span>
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-white/10">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">What you get</p>
            <ul className="space-y-2">
              {perks.map(p => (
                <li key={p} className="flex items-center gap-2 text-sm text-white/70">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" className="w-3.5 h-3.5 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => onCheckout({ plan_id: plan.plan_id, billing_interval: interval, inbox_toggle: inboxOn, inbox_count: inboxOn ? inboxCount : 0, monthly_sends: sends })}
            disabled={busy}
            className="mt-6 w-full py-3 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
          >
            {busy ? "…" : <>{checkoutLabel} <span aria-hidden>→</span></>}
          </button>
          <p className="text-[11px] text-white/35 text-center mt-3">Cancel anytime · secure Paystack billing</p>
        </div>
      </div>

      <p className="text-center text-xs text-white/40 mt-6">
        Sending more than 400k/mo? <a href="/contact" className="text-orange-400 hover:text-orange-300 font-semibold">Talk to us about a custom plan.</a>
      </p>
    </div>
  );
}
