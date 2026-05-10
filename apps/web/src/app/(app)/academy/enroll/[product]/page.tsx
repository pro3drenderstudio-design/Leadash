"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { AcademyProduct, AcademyCohort } from "@/types/academy";

export default function EnrollPage() {
  const { product: productId } = useParams<{ product: string }>();
  const router = useRouter();

  const [product,  setProduct]  = useState<AcademyProduct | null>(null);
  const [cohorts,  setCohorts]  = useState<AcademyCohort[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [phone,    setPhone]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [paying,   setPaying]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      wsGet<{ products: (AcademyProduct & { enrollment: unknown })[] }>("/api/academy/products"),
      wsGet<{ cohorts: AcademyCohort[] }>(`/api/academy/cohorts?product_id=${productId}`).catch(() => ({ cohorts: [] })),
    ]).then(([productsData, cohortsData]) => {
      const p = productsData.products.find(x => x.id === productId) ?? null;
      setProduct(p);
      const cs = cohortsData.cohorts ?? [];
      setCohorts(cs);
      if (cs.length > 0) setCohortId(cs[0].id);
      // Already enrolled — redirect
      if ((p as (AcademyProduct & { enrollment: unknown }) | null)?.enrollment) {
        router.replace(`/academy/${productId}`);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [productId, router]);

  async function handleEnroll() {
    if (!product) return;
    setPaying(true);
    setError(null);
    try {
      const callbackUrl = `${window.location.origin}/academy/enroll/${productId}/success`;
      const { url } = await wsPost<{ url: string }>("/api/academy/enroll", {
        product_id:   productId,
        cohort_id:    cohortId || undefined,
        phone:        phone || undefined,
        callback_url: callbackUrl,
      });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed. Please try again.");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-lg mx-auto space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/4 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center py-20">
        <p className="text-white/40">Course not found.</p>
      </div>
    );
  }

  const priceNgn = `₦${product.price_ngn.toLocaleString("en-NG")}`;

  return (
    <div className="p-6 md:p-8 max-w-lg mx-auto">
      <button onClick={() => router.push("/academy")} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className="space-y-6">
        {/* Product summary */}
        <div className="bg-white/4 border border-white/10 rounded-2xl p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-1">Enrolling in</p>
          <h2 className="text-white font-bold text-xl leading-tight">{product.name}</h2>
          {product.description && <p className="text-white/40 text-sm mt-2 leading-relaxed">{product.description}</p>}

          <div className="flex flex-wrap gap-3 mt-4">
            {product.credits_grant > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {product.credits_grant.toLocaleString()} credits
              </div>
            )}
            {product.leadash_months > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/6 border border-white/10 rounded-xl text-xs text-white/50">
                {product.leadash_months} month{product.leadash_months > 1 ? "s" : ""} Leadash access
              </div>
            )}
          </div>
        </div>

        {/* Cohort selector */}
        {cohorts.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Select Cohort
            </label>
            <select
              value={cohortId}
              onChange={e => setCohortId(e.target.value)}
              className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50"
            >
              {cohorts.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-900">
                  {c.name} · Starts {new Date(c.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {c.max_seats ? ` · ${c.max_seats} seats` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Phone for WhatsApp */}
        <div>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
            WhatsApp Number <span className="text-white/25 font-normal normal-case">(for reminders)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+234 800 000 0000"
            className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
          />
          <p className="text-white/25 text-xs mt-1.5">We&apos;ll send daily reminders when your next video unlocks.</p>
        </div>

        {/* Price + CTA */}
        <div className="bg-white/4 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/40 text-sm">Total</p>
              <p className="text-white font-bold text-3xl">{priceNgn}</p>
              <p className="text-white/25 text-xs mt-0.5">one-time payment</p>
            </div>
            <svg className="w-8 h-8 text-green-400 opacity-60" viewBox="0 0 48 48" fill="currentColor">
              <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm-2 29l-8-8 2.83-2.83L22 27.34l13.17-13.17L38 17 22 33z"/>
            </svg>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            onClick={handleEnroll}
            disabled={paying}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                Redirecting to Paystack…
              </>
            ) : (
              <>Pay {priceNgn} with Paystack</>
            )}
          </button>
          <p className="text-white/25 text-xs text-center mt-3">Secure payment powered by Paystack</p>
        </div>
      </div>
    </div>
  );
}
