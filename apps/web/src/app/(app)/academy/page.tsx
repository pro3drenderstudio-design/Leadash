"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";

function formatNgn(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function EnrolledCard({ p }: { p: ProductWithEnrollment }) {
  const pct = p.module_count > 0 ? Math.round((p.progress_count / p.module_count) * 100) : 0;
  const completed = p.enrollment?.status === "completed";
  return (
    <Link href={`/academy/${p.id}`} className="block bg-white/4 border border-white/10 hover:border-orange-500/40 rounded-2xl p-6 transition-all group">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {completed ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Completed</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25">Enrolled</span>
            )}
          </div>
          <h3 className="text-white font-bold text-lg leading-tight group-hover:text-orange-100 transition-colors">{p.name}</h3>
          {p.description && <p className="text-white/40 text-sm mt-1">{p.description}</p>}
        </div>
        <svg className="w-5 h-5 text-white/20 group-hover:text-orange-400 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{p.progress_count} of {p.module_count} days complete</span>
          <span>{pct}%</span>
        </div>
        <ProgressBar value={p.progress_count} total={p.module_count} />
      </div>
      {p.cohort && (
        <p className="text-white/30 text-xs mt-3">
          Cohort: {p.cohort.name} · Started {new Date(p.cohort.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}
    </Link>
  );
}

function ProductCard({ p }: { p: ProductWithEnrollment }) {
  return (
    <div className="bg-white/4 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h3 className="text-white font-bold text-lg leading-tight">{p.name}</h3>
        {p.description && <p className="text-white/40 text-sm mt-1 leading-relaxed">{p.description}</p>}
      </div>
      <div className="flex items-center gap-4 text-sm text-white/50">
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {p.module_count} days
        </span>
        {p.credits_grant > 0 && (
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {p.credits_grant.toLocaleString()} credits included
          </span>
        )}
        {p.leadash_months > 0 && (
          <span>{p.leadash_months} month{p.leadash_months > 1 ? "s" : ""} Leadash access</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/8">
        <div>
          <p className="text-white font-bold text-2xl">{formatNgn(p.price_ngn * 100)}</p>
          <p className="text-white/30 text-xs">one-time</p>
        </div>
        <Link
          href={`/academy/enroll/${p.id}`}
          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Enroll Now
        </Link>
      </div>
    </div>
  );
}

export default function AcademyPage() {
  const [products, setProducts] = useState<ProductWithEnrollment[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    wsGet<{ products: ProductWithEnrollment[] }>("/api/academy/products")
      .then(d => setProducts(d.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const enrolled    = products.filter(p => p.enrollment);
  const available   = products.filter(p => !p.enrollment);

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        {[1, 2].map(i => <div key={i} className="h-40 bg-white/4 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Leadash Academy</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Learn to land foreign clients</h1>
        <p className="text-white/40 text-sm mt-1">Hands-on training that uses Leadash to get you real results.</p>
      </div>

      {/* Enrolled courses */}
      {enrolled.length > 0 && (
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Your Courses</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {enrolled.map(p => <EnrolledCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {/* Available courses */}
      {available.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">
            {enrolled.length > 0 ? "More Courses" : "Available Courses"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {available.map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {products.length === 0 && (
        <div className="text-center py-20 text-white/30">
          <p>No courses available yet.</p>
        </div>
      )}
    </div>
  );
}
