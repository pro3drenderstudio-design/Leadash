"use client";

import { useEffect, useMemo, useState } from "react";

interface ValueItem { label: string; value_ngn: number }
interface Perk { title: string; desc?: string }
interface Faq { q: string; a: string }
interface BuyerField { key: string; label: string; enabled: boolean; required: boolean; type: string }

interface SalesPageConfig {
  badge?: string;
  headline?: string;
  subhead?: string;
  sponsored?: boolean;
  today_ngn?: number;
  value_items?: ValueItem[];
  perks?: Perk[];
  guarantee?: string;
  faq?: Faq[];
}

export interface SalesOffer {
  id:              string;
  slug:            string;
  name:            string;
  price_ngn:       number;
  compare_at_ngn:  number | null;
  billing_interval: string | null;
  sales_page?:     SalesPageConfig | null;
  checkout?:       { fields?: BuyerField[] } | null;
}

const ngn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true };
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
    done: false,
  };
}

export default function OfferSalesClient({ offer, slug, blocked, expiresAt }: { offer: SalesOffer; slug: string; blocked: boolean; expiresAt: string | null }) {
  const sp = offer.sales_page ?? {};
  const fields = (offer.checkout?.fields ?? []).filter(f => f.enabled);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(expiresAt);

  const valueTotal = useMemo(() => (sp.value_items ?? []).reduce((s, v) => s + v.value_ngn, 0), [sp.value_items]);
  const today = sp.today_ngn ?? offer.price_ngn;
  const anchor = offer.compare_at_ngn && offer.compare_at_ngn > today ? offer.compare_at_ngn : valueTotal;
  const period = offer.billing_interval === "annual" ? "/year" : offer.billing_interval === "monthly" ? "/month" : "";

  async function submit() {
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) { setError(`Please enter your ${f.label.toLowerCase()}.`); return; }
    }
    setSubmitting(true);
    setError(null);
    try {
      const sessionId = globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}`;
      const res = await fetch(`/api/offers/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          buyer: { full_name: form.full_name, email: form.email, phone: form.phone },
        }),
      });
      const data = await res.json() as { url?: string; free?: boolean; error?: string; purchase_id?: string };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) { window.location.href = data.url; return; }
      if (data.free) { window.location.href = `/o/${slug}/success?purchase_id=${data.purchase_id}`; return; }
      throw new Error("Unexpected response");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setSubmitting(false);
    }
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">This offer isn&apos;t available</h1>
          <p className="text-white/50">This is a limited, invite-only offer. If you joined the challenge, make sure you&apos;re signed in with the same account — or the window may have closed.</p>
          <a href="/dashboard" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 font-semibold text-sm">Go to dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white">
      {/* ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-orange-500/10 blur-[120px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-16">
        {/* Countdown */}
        {countdown && !countdown.done && (
          <div className="mb-8 flex items-center justify-center gap-3 text-sm">
            <span className="text-orange-300 font-semibold">Offer closes in</span>
            <span className="font-mono font-bold tabular-nums bg-orange-500/15 border border-orange-500/25 rounded-lg px-3 py-1">
              {countdown.d}d {String(countdown.h).padStart(2, "0")}h {String(countdown.m).padStart(2, "0")}m {String(countdown.s).padStart(2, "0")}s
            </span>
          </div>
        )}

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          {sp.badge && <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1 mb-5">{sp.badge}</span>}
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-balance">{sp.headline ?? offer.name}</h1>
          {sp.subhead && <p className="text-white/50 text-lg mt-5 leading-relaxed">{sp.subhead}</p>}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Left: value maths + perks */}
          <div className="space-y-6">
            {(sp.value_items?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-4">What it&apos;s worth</p>
                <div className="space-y-3">
                  {sp.value_items!.map(v => (
                    <div key={v.label} className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">{v.label}</span>
                      <span className="font-semibold tabular-nums">{ngn(v.value_ngn)}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                    <span className="text-white/50 text-sm font-semibold">Total value</span>
                    <span className="font-bold tabular-nums text-lg line-through decoration-orange-400/60 decoration-2">{ngn(valueTotal)}</span>
                  </div>
                </div>
                <div className="mt-5 rounded-xl bg-orange-500/10 border border-orange-500/25 p-4 text-center">
                  <p className="text-white/60 text-sm">{sp.sponsored ? "Sponsored by Leadash — you pay only" : "Today"}</p>
                  <p className="text-4xl font-bold tabular-nums mt-1">{ngn(today)}<span className="text-base font-medium text-white/40">{period}</span></p>
                  {anchor > today && <p className="text-emerald-400 text-sm font-semibold mt-1">You save {ngn(anchor - today)}</p>}
                </div>
              </div>
            )}

            {(sp.perks?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-4">What you get</p>
                <div className="space-y-4">
                  {sp.perks!.map(p => (
                    <div key={p.title} className="flex gap-3">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" className="w-4 h-4 flex-shrink-0 mt-1"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <p className="font-semibold text-sm">{p.title}</p>
                        {p.desc && <p className="text-white/45 text-sm mt-0.5">{p.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: checkout card (sticky) */}
          <div className="lg:sticky lg:top-8">
            <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-6">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold tabular-nums">{ngn(today)}</span>
                <span className="text-white/40 text-sm">{period}</span>
                {anchor > today && <span className="text-white/30 line-through text-sm ml-1">{ngn(anchor)}</span>}
              </div>
              <p className="text-white/45 text-sm mb-5">{offer.name}</p>

              <div className="space-y-3">
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-[11px] text-white/50 mb-1">{f.label}{f.required && <span className="text-orange-400"> *</span>}</label>
                    <input
                      type={f.type}
                      value={form[f.key] ?? ""}
                      onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                ))}
              </div>

              {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

              <button onClick={submit} disabled={submitting}
                className="mt-5 w-full py-3 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white transition-colors">
                {submitting ? "…" : `Get instant access — ${ngn(today)}${period}`}
              </button>
              {sp.guarantee && <p className="text-white/35 text-[11px] text-center mt-3">{sp.guarantee} · Secure Paystack billing</p>}
            </div>
          </div>
        </div>

        {/* FAQ */}
        {(sp.faq?.length ?? 0) > 0 && (
          <div className="max-w-2xl mx-auto mt-16">
            <h2 className="text-xl font-bold mb-6 text-center">Questions</h2>
            <div className="space-y-3">
              {sp.faq!.map(f => (
                <details key={f.q} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <summary className="font-semibold text-sm cursor-pointer">{f.q}</summary>
                  <p className="text-white/50 text-sm mt-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
