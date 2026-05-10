"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";
import { formatNgn } from "@/types/academy";

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{value} of {total} lessons complete</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EnrolledCard({ p }: { p: ProductWithEnrollment }) {
  const completed = p.enrollment?.status === "completed";
  return (
    <Link href={`/academy/${p.slug}/learn`}
      className="block bg-white/4 border border-white/10 hover:border-orange-500/40 rounded-2xl p-6 transition-all group">
      {p.thumbnail_url && (
        <div className="w-full h-36 rounded-xl overflow-hidden mb-4 bg-white/5">
          <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {completed ? (
              <span className="badge-emerald">Completed</span>
            ) : p.certificate ? (
              <span className="badge-emerald">Certified</span>
            ) : (
              <span className="badge-orange">Enrolled</span>
            )}
          </div>
          <h3 className="text-white font-bold text-lg leading-tight group-hover:text-orange-100 transition-colors">{p.name}</h3>
          {p.description && <p className="text-white/40 text-sm mt-1 line-clamp-2">{p.description}</p>}
        </div>
        <svg className="w-5 h-5 text-white/20 group-hover:text-orange-400 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <ProgressBar value={p.completed_count} total={p.total_lessons} />
      {p.cohort && (
        <p className="text-white/30 text-xs mt-3">
          Cohort: {p.cohort.name} · {new Date(p.cohort.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}
      {completed && p.certificate && (
        <Link href={`/academy/${p.slug}/certificate`}
          onClick={e => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
          🏆 View Certificate
        </Link>
      )}
    </Link>
  );
}

function AvailableCard({ p }: { p: ProductWithEnrollment }) {
  return (
    <div className="bg-white/4 border border-white/10 rounded-2xl p-6">
      {p.thumbnail_url && (
        <div className="w-full h-36 rounded-xl overflow-hidden mb-4 bg-white/5">
          <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">{p.name}</h3>
          {p.description && <p className="text-white/50 text-sm mt-1 line-clamp-3">{p.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3 text-xs text-white/40">
        <span>📹 {p.total_lessons} lessons</span>
        <span>·</span>
        <span>🎓 Certificate included</span>
        <span>·</span>
        <span>💳 {p.credits_grant.toLocaleString()} credits</span>
      </div>

      {/* Free preview lessons */}
      {p.sections.some(s => s.lessons.some(l => l.is_free_preview)) && (
        <div className="mb-4">
          {p.sections.flatMap(s => s.lessons.filter(l => l.is_free_preview)).slice(0, 2).map(l => (
            <Link key={l.id} href={`/academy/${p.slug}/learn/${l.id}`}
              className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300 py-1">
              <span>▶</span> {l.title} <span className="text-white/30">(free preview)</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          {p.compare_price_ngn && (
            <span className="text-xs text-white/30 line-through mr-2">{formatNgn(p.compare_price_ngn)}</span>
          )}
          <span className="text-2xl font-bold text-white">{formatNgn(p.price_ngn)}</span>
        </div>
        <Link href={`/academy/enroll/${p.slug}`}
          className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
          Enroll Now
        </Link>
      </div>
    </div>
  );
}

export default function AcademyPage() {
  const [products, setProducts] = useState<ProductWithEnrollment[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    wsGet<{ products: ProductWithEnrollment[] }>("/api/academy/products")
      .then(d => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  const enrolled   = products.filter(p => p.enrollment);
  const available  = products.filter(p => !p.enrollment);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-6 py-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Academy</h1>
        <p className="text-white/50">Courses and challenges to land foreign clients and build your outreach machine.</p>
      </div>

      {enrolled.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-4">Your Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {enrolled.map(p => <EnrolledCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {available.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-4">
            {enrolled.length > 0 ? "Also Available" : "Available Courses"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {available.map(p => <AvailableCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {products.length === 0 && (
        <div className="text-center py-20 text-white/30">No courses available yet.</div>
      )}

      <style jsx global>{`
        .badge-emerald { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(52,211,153,0.1); color:#34d399; border:1px solid rgba(52,211,153,0.2); }
        .badge-orange  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(249,115,22,0.1); color:#fb923c; border:1px solid rgba(249,115,22,0.2); }
      `}</style>
    </div>
  );
}
