"use client";

/**
 * "Pay for what you send" — volume-driven pricing calculator.
 *
 * Drag to intended monthly sends → derive the plan (a plan covers everything up
 * to its cap; the next plan starts one step past that cap), a recommended
 * managed-inbox count (~500 campaign sends / inbox / month, excl. warm-up),
 * and an itemized monthly price. The inbox count is a helper, not a limit —
 * every paid plan allows unlimited inboxes.
 *
 * Self-contained + presentational so it works on both the public marketing tree
 * (no CurrencyProvider) and in-app. Pass currentPlanId in-app for
 * upgrade/downgrade framing.
 */

import { useMemo, useState } from "react";
import type { PlanConfig } from "@/lib/billing/getActivePlans";
import { formatLocalPrice, NGN_CONTEXT, type CurrencyContext } from "@/lib/currency/format";

const SENDS_PER_INBOX = 500; // ~500 campaign sends / inbox / month at full send
const SENDS_STEP = 500;       // slider granularity
const SENDS_FLOOR = 500;      // slider minimum

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
  plans:          PlanConfig[];
  ngnPerUsd:      number; // 1 USD = ngnPerUsd NGN
  onCheckout:     (sel: SliderSelection) => void;
  checkoutLabel?: string;
  busy?:          boolean;
  currentPlanId?: string; // in-app: the workspace's current plan, for up/downgrade framing
}

function capOf(p: PlanConfig): number {
  return p.max_monthly_sends === -1 ? 400000 : p.max_monthly_sends;
}
function fmtSends(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
function snap(n: number): number {
  return Math.round(n / SENDS_STEP) * SENDS_STEP;
}

export default function PricingSlider({ plans, ngnPerUsd, onCheckout, checkoutLabel = "Continue to checkout", busy, currentPlanId }: Props) {
  const tiers = useMemo(
    () => PLAN_ORDER
      .map(id => plans.find(p => p.plan_id === id))
      .filter((p): p is PlanConfig => !!p),
    [plans],
  );
  const segCount = Math.max(1, tiers.length);

  const [pos, setPos]         = useState(0.42);
  const [inboxOn, setInboxOn] = useState(true);
  const [manualInbox, setManualInbox] = useState<number | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");

  // Each tier owns an equal visual segment. Within tier i the send range is
  // [prevCap + STEP, cap] (so cap → this tier, cap + STEP → the next tier),
  // stepped by 500.
  const { sends, tierIndex } = useMemo(() => {
    const seg = Math.min(segCount - 1, Math.floor(pos * segCount));
    const localT = pos * segCount - seg;
    const lo = seg === 0 ? SENDS_FLOOR : capOf(tiers[seg - 1]) + SENDS_STEP;
    const hi = capOf(tiers[seg]);
    const raw = lo + (hi - lo) * localT;
    return { sends: Math.min(hi, Math.max(lo, snap(raw))), tierIndex: seg };
  }, [pos, tiers, segCount]);

  const plan = tiers[tierIndex];
  const cap  = plan ? capOf(plan) : 0;
  const recommendedInboxes = Math.max(1, Math.ceil(sends / SENDS_PER_INBOX));
  const inboxCount = manualInbox === null ? recommendedInboxes : Math.max(1, manualInbox);
  const inboxSliderMax = Math.max(500, inboxCount); // range is a helper; the + button can go past it

  const ctx: CurrencyContext = currency === "USD"
    ? { currency: "USD", rateToNgn: 1 / ngnPerUsd, symbol: "$", country: null }
    : NGN_CONTEXT;
  const fmt = (ngn: number) => formatLocalPrice(ngn, ctx);

  const planPerMoNgn  = plan ? (interval === "annual" ? Math.round(plan.price_ngn * 10 / 12) : plan.price_ngn) : 0;
  const planLineNgn   = plan ? (interval === "annual" ? plan.price_ngn * 10 : plan.price_ngn) : 0;
  const inboxUnitNgn  = plan?.inbox_monthly_price_ngn ?? 2500;
  const inboxPerMoNgn = inboxOn ? inboxCount * inboxUnitNgn : 0;
  const totalPerMoNgn = planPerMoNgn + inboxPerMoNgn;

  function selectTier(i: number) {
    setPos((i + 0.5) / segCount);
    setManualInbox(null);
  }

  const currentIdx = currentPlanId ? tiers.findIndex(t => t.plan_id === currentPlanId) : -1;
  const onCurrentPlan = currentIdx >= 0 && currentIdx === tierIndex;

  const ctaLabel = useMemo(() => {
    if (currentIdx < 0) return checkoutLabel;
    if (tierIndex > currentIdx) return `Upgrade to ${plan?.name}`;
    if (tierIndex < currentIdx) return `Downgrade to ${plan?.name}`;
    return inboxOn ? "Add inboxes to your plan" : "Your current plan";
  }, [currentIdx, tierIndex, plan, inboxOn, checkoutLabel]);
  const ctaDisabled = busy || (onCurrentPlan && !inboxOn);

  const perks = useMemo(() => {
    if (!plan) return [] as string[];
    const seats = plan.max_seats >= 999999 ? "Unlimited" : String(plan.max_seats);
    const prev = tierIndex > 0 ? tiers[tierIndex - 1].name : null;
    const list: string[] = [
      `${plan.included_credits.toLocaleString()} lead credits / mo`,
      `${cap.toLocaleString()} emails / mo`,
      `${plan.max_leads_pool.toLocaleString()} leads pool`,
      `${seats} team seat${seats === "1" ? "" : "s"}`,
    ];
    if (inboxOn) list.push(`${inboxCount} warmed sending inbox${inboxCount === 1 ? "" : "es"}`);
    if (prev) list.push(`Everything in ${prev}`);
    if (plan.can_scrape_leads) list.push("Lead scraping & enrichment");
    if (plan.feat_api_access) list.push("API access");
    list.push("Unlimited sending inboxes");
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
              {tiers.map((t, i) => {
                const isCurrent = t.plan_id === currentPlanId;
                return (
                  <button key={t.plan_id} onClick={() => selectTier(i)}
                    className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                      i === tierIndex ? "border-orange-500/60 bg-orange-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}>
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${i === tierIndex ? "bg-orange-400" : "bg-white/30"}`} />
                      {t.name}
                    </p>
                    <p className="text-[11px] text-white/40 mt-0.5">up to {fmtSends(capOf(t))}{isCurrent ? " · current" : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Leadash inboxes card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" className="w-[18px] h-[18px]"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                </div>
                <div>
                  <p className="text-sm font-bold">Include Leadash inboxes</p>
                  <p className="text-xs text-white/50 mt-0.5 max-w-sm">
                    Done-for-you sending inboxes, warmed and rotated automatically. {fmt(inboxUnitNgn)} per inbox / mo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={inboxOn}
                aria-label="Toggle Leadash inboxes"
                onClick={() => setInboxOn(v => !v)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${inboxOn ? "bg-orange-500" : "bg-white/20"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${inboxOn ? "translate-x-[18px]" : "translate-x-0.5"}`} />
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
                    type="range" min={1} max={inboxSliderMax} value={Math.min(inboxCount, inboxSliderMax)}
                    onChange={e => setManualInbox(Number(e.target.value))}
                    className="flex-1 accent-orange-500"
                    aria-label="Inbox count"
                  />
                  <button onClick={() => setManualInbox(inboxCount + 1)}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-lg leading-none">+</button>
                </div>
                <p className="text-[11px] text-white/35 mt-3">Plan on ~1 inbox per {SENDS_PER_INBOX.toLocaleString()} sends / mo at full send (excludes warm-up ramp). Add as many as you like.</p>
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
            {onCurrentPlan
              ? <span className="text-[10px] font-bold uppercase tracking-wide text-white/50 bg-white/10 px-2 py-0.5 rounded-full">Current</span>
              : plan.plan_id === POPULAR_PLAN
                ? <span className="text-[10px] font-bold uppercase tracking-wide text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">Popular</span>
                : null}
          </div>

          <p className="text-4xl font-bold tabular-nums">
            {fmt(totalPerMoNgn)}<span className="text-base font-medium text-white/40 ml-1">/mo</span>
          </p>
          <p className="text-xs text-white/40 mt-1">
            {interval === "annual" ? "Plan billed annually (2 months free) · inboxes billed monthly" : "Billed monthly · cancel anytime"}
          </p>

          <div className="mt-5 pt-4 border-t border-white/10 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/60">{plan.name} plan <span className="text-white/35">up to {fmtSends(cap)} sends</span></span>
              <span className="font-semibold tabular-nums">{fmt(planLineNgn)}{interval === "annual" ? "/yr" : ""}</span>
            </div>
            {inboxOn && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">{inboxCount} Leadash inbox{inboxCount === 1 ? "" : "es"} <span className="text-white/35">@ {fmt(inboxUnitNgn)} ea</span></span>
                <span className="font-semibold tabular-nums">{fmt(inboxPerMoNgn)}/mo</span>
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
            disabled={ctaDisabled}
            className="mt-6 w-full py-3 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
          >
            {busy ? "…" : <>{ctaLabel} {!ctaDisabled && <span aria-hidden>→</span>}</>}
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
