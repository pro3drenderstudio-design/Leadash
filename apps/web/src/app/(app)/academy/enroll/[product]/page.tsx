"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { AcademyProduct, AcademyCohort } from "@/types/academy";
import { formatNgn } from "@/types/academy";

export default function EnrollPage() {
  const { product: productId } = useParams<{ product: string }>();
  const router = useRouter();

  const [product,        setProduct]        = useState<AcademyProduct | null>(null);
  const [cohorts,        setCohorts]        = useState<AcademyCohort[]>([]);
  const [cohortId,       setCohortId]       = useState("");
  const [phone,          setPhone]          = useState("");
  const [whatsapp,       setWhatsapp]       = useState(true);
  const [discountCode,   setDiscountCode]   = useState("");
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean; code_id: string; discount_ngn: number;
    original_ngn: number; final_ngn: number; discount_value: number; discount_type: string;
  } | null>(null);
  const [discountError,  setDiscountError]  = useState<string | null>(null);
  const [validating,     setValidating]     = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [paying,         setPaying]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      wsGet<{ products: (AcademyProduct & { enrollment: unknown; slug: string })[] }>("/api/academy/products"),
      wsGet<{ cohorts: AcademyCohort[] }>(`/api/academy/cohorts?product_id=${productId}`).catch(() => ({ cohorts: [] })),
    ]).then(([productsData, cohortsData]) => {
      const p = productsData.products.find(x => x.id === productId || x.slug === productId) ?? null;
      setProduct(p);
      const cs = cohortsData.cohorts ?? [];
      setCohorts(cs);
      const defaultCohort = cs.find(c => c.is_default) ?? cs[0];
      if (defaultCohort) setCohortId(defaultCohort.id);
      if ((p as (AcademyProduct & { enrollment: unknown }) | null)?.enrollment) {
        router.replace(`/academy/${productId}/learn`);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [productId, router]);

  async function applyDiscount() {
    if (!discountCode.trim() || !product) return;
    setValidating(true);
    setDiscountError(null);
    try {
      const res = await wsPost<typeof discountResult>("/api/academy/discount-codes/validate", {
        code: discountCode.trim(), product_id: product.id,
      });
      if (res?.valid) { setDiscountResult(res); }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setDiscountError(err?.message ?? "Invalid code");
      setDiscountResult(null);
    } finally { setValidating(false); }
  }

  async function handleEnroll() {
    if (!product) return;
    setPaying(true);
    setError(null);
    try {
      const res = await wsPost<{ url?: string; error?: string }>("/api/academy/enroll", {
        product_id:   product.id,
        cohort_id:    cohortId || null,
        phone:        phone || null,
        whatsapp_opted_in: whatsapp,
        discount_code_id:  discountResult?.code_id ?? null,
        callback_url: `${window.location.origin}/academy/enroll/${productId}/success`,
      });
      if (res.url) { window.location.href = res.url; }
      else setError(res.error ?? "Failed to start payment");
    } catch {
      setError("Payment failed. Please try again.");
    } finally { setPaying(false); }
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading…</div></div>;
  if (!product) return <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center"><div className="text-white/40">Product not found.</div></div>;

  const displayPrice = discountResult?.final_ngn ?? product.price_ngn;

  return (
    <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Enroll</h1>
          <p className="text-white/50 text-sm">{product.name}</p>
        </div>

        <div className="bg-white/4 border border-white/10 rounded-2xl p-6 space-y-5">
          {/* Cohort selector */}
          {cohorts.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Start date</label>
              <select value={cohortId} onChange={e => setCohortId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/50">
                {cohorts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {new Date(c.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {c.max_seats ? ` · ${c.enrolled_count}/${c.max_seats} seats` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Phone */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">WhatsApp number</label>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+2348012345678"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50" />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)} className="rounded" />
              <span className="text-xs text-white/40">Send me daily reminders on WhatsApp</span>
            </label>
          </div>

          {/* Discount code */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discount code</label>
            <div className="flex gap-2">
              <input
                value={discountCode} onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="LAUNCH50"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50 uppercase" />
              <button onClick={applyDiscount} disabled={validating || !discountCode.trim()}
                className="bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white px-4 py-3 rounded-xl text-sm transition-colors">
                Apply
              </button>
            </div>
            {discountResult && (
              <p className="text-emerald-400 text-xs mt-1.5">
                ✓ {discountResult.discount_type === "percent" ? `${discountResult.discount_value}% off` : formatNgn(discountResult.discount_ngn)} applied
              </p>
            )}
            {discountError && <p className="text-red-400 text-xs mt-1.5">✕ {discountError}</p>}
          </div>

          {/* Price summary */}
          <div className="border-t border-white/8 pt-4">
            {discountResult && (
              <div className="flex justify-between text-sm text-white/40 mb-1">
                <span>Original price</span>
                <span className="line-through">{formatNgn(product.price_ngn)}</span>
              </div>
            )}
            {discountResult && (
              <div className="flex justify-between text-sm text-emerald-400 mb-1">
                <span>Discount</span>
                <span>−{formatNgn(discountResult.discount_ngn)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatNgn(displayPrice)}</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button onClick={handleEnroll} disabled={paying}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2">
            {paying ? "Redirecting…" : `Pay ${formatNgn(displayPrice)} with Paystack`}
          </button>

          <p className="text-xs text-white/30 text-center">
            Secure payment. You'll get {product.credits_grant.toLocaleString()} Leadash credits immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
