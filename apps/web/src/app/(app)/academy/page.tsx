"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";
import { formatNgn } from "@/types/academy";

// Gradient placeholder thumbnails so every card always has a visual
const THUMBNAILS = [
  "from-orange-900 via-orange-800 to-yellow-900",
  "from-indigo-900 via-purple-900 to-blue-900",
  "from-emerald-900 via-teal-900 to-cyan-900",
  "from-rose-900 via-pink-900 to-orange-900",
];

function CourseThumbnail({ url, name, index, height = "h-44" }: { url: string | null; name: string; index: number; height?: string }) {
  const gradient = THUMBNAILS[index % THUMBNAILS.length];
  return (
    <div className={`w-full ${height} rounded-xl overflow-hidden bg-gray-900 flex-shrink-0 relative`}>
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <span className="text-4xl opacity-30">🎓</span>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{value} of {total} lessons complete</span>
        <span className="font-medium text-white/60">{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EnrolledCard({ p, index }: { p: ProductWithEnrollment; index: number }) {
  const completed = p.enrollment?.status === "completed";
  return (
    <Link href={`/academy/${p.slug}/learn`}
      className="block bg-white/[0.03] border border-white/8 hover:border-orange-500/30 rounded-2xl overflow-hidden transition-all group">
      <CourseThumbnail url={p.thumbnail_url} name={p.name} index={index} />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          {completed
            ? <span className="badge-emerald">Completed</span>
            : <span className="badge-orange">In Progress</span>}
        </div>
        <h3 className="text-white font-semibold text-base leading-snug mb-1 group-hover:text-orange-100 transition-colors">{p.name}</h3>
        {p.description && <p className="text-white/40 text-sm mb-3 line-clamp-2 leading-relaxed">{p.description}</p>}
        <ProgressBar value={p.completed_count} total={p.total_lessons} />
        {p.cohort && (
          <p className="text-white/25 text-xs mt-2">
            Cohort: {p.cohort.name} · {new Date(p.cohort.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        )}
      </div>
    </Link>
  );
}

function AvailableCard({ p, index }: { p: ProductWithEnrollment; index: number }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 hover:border-orange-500/20 rounded-2xl overflow-hidden transition-all">
      <CourseThumbnail url={p.thumbnail_url} name={p.name} index={index} />
      <div className="p-5">
        <h3 className="text-white font-semibold text-base leading-snug mb-1">{p.name}</h3>
        {p.description && <p className="text-white/50 text-sm mb-3 line-clamp-2 leading-relaxed">{p.description}</p>}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-white/35">
          <span>📹 {p.total_lessons} lessons</span>
          <span>🎓 Certificate</span>
          <span>💳 {p.credits_grant.toLocaleString()} credits</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {p.compare_price_ngn && (
              <p className="text-xs text-white/30 line-through">{formatNgn(p.compare_price_ngn)}</p>
            )}
            <p className="text-xl font-bold text-white">{formatNgn(p.price_ngn)}</p>
          </div>
          <Link href={`/academy/enroll/${p.slug}`}
            className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
            Enroll
          </Link>
        </div>
      </div>
    </div>
  );
}

// Hero section — shows the academy intro video or a static placeholder
function AcademyHero({ featuredProduct }: { featuredProduct: ProductWithEnrollment | null }) {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden mb-10 border border-white/8" style={{ minHeight: 320 }}>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-[#0c0c0f] to-indigo-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.12),transparent_60%)]" />

      <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8 p-8 lg:p-10">
        {/* Text */}
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400/80 mb-3">Leadash Academy</p>
          <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight mb-3">
            Land foreign clients.<br />Build your outreach machine.
          </h2>
          <p className="text-white/50 text-sm leading-relaxed mb-6 max-w-md">
            Step-by-step courses and live challenges designed for Nigerian professionals ready to earn in dollars.
            Start with the free 5-day challenge, then unlock the full $10k Academy.
          </p>
          {featuredProduct && !featuredProduct.enrollment && (
            <Link href={`/academy/enroll/${featuredProduct.slug}`}
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
              Start with the Challenge · {formatNgn(featuredProduct.price_ngn)}
            </Link>
          )}
        </div>

        {/* Video placeholder */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5 border border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-900/30 via-transparent to-indigo-900/30" />
            {/* Play button placeholder */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm hover:bg-white/15 transition-colors cursor-pointer">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-white/40 text-xs">Academy intro video</p>
              <p className="text-white/25 text-[10px]">Upload via Admin → Academy → Course Builder</p>
            </div>
          </div>
        </div>
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

  const enrolled  = products.filter(p => p.enrollment);
  const available = products.filter(p => !p.enrollment);

  // Use cheapest non-enrolled product as the featured "start here" CTA
  const featured = available.sort((a, b) => a.price_ngn - b.price_ngn)[0] ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Hero */}
      <AcademyHero featuredProduct={featured} />

      {/* Enrolled courses */}
      {enrolled.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/35 mb-4">Your Courses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolled.map((p, i) => <EnrolledCard key={p.id} p={p} index={i} />)}
          </div>
        </section>
      )}

      {/* Available courses */}
      {available.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/35 mb-4">
            {enrolled.length > 0 ? "Also Available" : "Available Courses"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {available.map((p, i) => <AvailableCard key={p.id} p={p} index={enrolled.length + i} />)}
          </div>
        </section>
      )}

      {products.length === 0 && (
        <div className="text-center py-20 text-white/25 text-sm">No courses available yet.</div>
      )}

      <style jsx global>{`
        .badge-emerald { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(52,211,153,0.1); color:#34d399; border:1px solid rgba(52,211,153,0.2); }
        .badge-orange  { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(249,115,22,0.1); color:#fb923c; border:1px solid rgba(249,115,22,0.2); }
      `}</style>
    </div>
  );
}
