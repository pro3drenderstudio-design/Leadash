"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";
import { formatNgn } from "@/types/academy";
import "@/v2-app/v2-app.css";

// Per-card accent — drives the thumbnail tint, play button, and progress ring.
const ACCENTS = [
  { c: "#60A5FA" }, // blue
  { c: "#F97316" }, // orange
  { c: "#A78BFA" }, // purple
  { c: "#34D399" }, // green
  { c: "#22D3EE" }, // teal
  { c: "#F472B6" }, // pink
];
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length].c;

// ─── Challenge / course progress helpers ─────────────────────────────────────

function challengeState(p: ProductWithEnrollment) {
  const duration = p.challenge_config?.duration_days ?? 7;
  const start = p.cohort?.starts_at ? new Date(p.cohort.starts_at).getTime() : null;
  if (!start || start > Date.now()) {
    return { started: false, day: 0, duration, startsAt: p.cohort?.starts_at ?? null };
  }
  const day = Math.min(duration, Math.floor((Date.now() - start) / 86_400_000) + 1);
  return { started: true, day, duration, startsAt: p.cohort?.starts_at ?? null };
}

function progressPct(p: ProductWithEnrollment): number {
  if (p.product_type === "challenge") {
    const s = challengeState(p);
    return s.started ? Math.round((s.day / s.duration) * 100) : 0;
  }
  return p.total_lessons > 0 ? Math.round((p.completed_count / p.total_lessons) * 100) : 0;
}

function statusLine(p: ProductWithEnrollment): string {
  if (p.product_type === "challenge") {
    const s = challengeState(p);
    if (!s.started) {
      return s.startsAt
        ? `Starts ${new Date(s.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "Challenge";
    }
    return `Day ${s.day} of ${s.duration}`;
  }
  const pct = progressPct(p);
  return pct >= 100 ? "Completed" : "Course in progress";
}

// ─── Progress ring ───────────────────────────────────────────────────────────

function Ring({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--app-text)" }}>
        {pct}%
      </div>
    </div>
  );
}

function PlayIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ marginLeft: 2 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// ─── Continue-learning card (progress ring, horizontal) ──────────────────────

function ContinueCard({ p, accent }: { p: ProductWithEnrollment; accent: string }) {
  return (
    <Link href={`/academy/${p.slug}/learn`}
      className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05] transition-all p-4">
      <Ring pct={progressPct(p)} color={accent} />
      <div className="min-w-0 flex-1">
        <h3 className="text-white font-semibold text-sm leading-snug truncate">{p.name}</h3>
        <p className="text-white/40 text-xs mt-0.5">{statusLine(p)}</p>
      </div>
      <svg className="w-4 h-4 text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ─── Browse card ─────────────────────────────────────────────────────────────

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "green" | "orange" | "purple" }) {
  const cls = {
    neutral: "bg-black/40 text-white/70 border-white/15",
    green:   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    orange:  "bg-orange-500/15 text-orange-300 border-orange-500/30",
    purple:  "bg-purple-500/15 text-purple-300 border-purple-500/30",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border backdrop-blur-sm ${cls}`}>
      {children}
    </span>
  );
}

function BrowseCard({ p, index, isFlagship }: { p: ProductWithEnrollment; index: number; isFlagship: boolean }) {
  const accent = accentFor(index);
  const enrolled = !!p.enrollment;
  const isChallenge = p.product_type === "challenge";
  const isFree = p.pricing_type === "free" || p.price_ngn === 0;
  const href = enrolled ? `/academy/${p.slug}/learn` : `/academy/enroll/${p.slug}`;

  return (
    <Link href={href}
      className="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.03] hover:border-white/15 overflow-hidden transition-all">
      {/* Thumbnail */}
      <div className="relative h-40 flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent}22, #0B0B10 70%)` }}>
        {p.thumbnail_url && (
          <img src={p.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        )}
        <div className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
          style={{ background: `${accent}26`, border: `1px solid ${accent}55` }}>
          <PlayIcon color={accent} />
        </div>
        {/* Top-left badges */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {isFree && <Badge tone="neutral">Free</Badge>}
          {isChallenge && <Badge tone="orange">🔥 Live Cohort</Badge>}
          {isFlagship && <Badge tone="purple">Flagship</Badge>}
        </div>
        {/* Top-right badge */}
        {enrolled && (
          <div className="absolute top-3 right-3">
            <Badge tone="green">Enrolled</Badge>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        <h3 className="text-white font-semibold text-sm leading-snug mb-1">{p.name}</h3>
        {p.description && <p className="text-white/40 text-xs leading-relaxed line-clamp-2 mb-3">{p.description}</p>}

        <div className="mt-auto pt-1">
          {enrolled ? (
            <>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-white/40">
                  {isChallenge ? statusLine(p) : `${progressPct(p)}% complete`}
                </span>
                <span className="font-semibold" style={{ color: accent }}>Continue</span>
              </div>
              <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${progressPct(p)}%`, background: accent }} />
              </div>
            </>
          ) : (
            <div className="flex items-end justify-between">
              <div>
                {p.compare_price_ngn && p.compare_price_ngn > p.price_ngn && (
                  <p className="text-[11px] text-white/25 line-through leading-none mb-0.5">{formatNgn(p.compare_price_ngn)}</p>
                )}
                <p className="text-base font-bold text-white leading-none">{isFree ? "Free" : formatNgn(p.price_ngn)}</p>
              </div>
              <span className="text-[11px] text-white/35">
                {isChallenge
                  ? `${p.challenge_config?.duration_days ?? 7} days`
                  : `${p.total_lessons} lesson${p.total_lessons === 1 ? "" : "s"}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Tab = "all" | "courses" | "challenges";

export default function AcademyPage() {
  const [products, setProducts] = useState<ProductWithEnrollment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("all");

  useEffect(() => {
    wsGet<{ products: ProductWithEnrollment[] }>("/api/academy/products")
      .then(d => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = useMemo(
    () => products.filter(p => p.enrollment && (p.enrollment.status ?? "active") !== "cancelled"),
    [products],
  );

  // Flagship = the priciest paid product (matches the "Full Stack" package in the design).
  const flagshipId = useMemo(() => {
    const paid = products.filter(p => p.price_ngn > 0);
    if (!paid.length) return null;
    return paid.reduce((a, b) => (b.price_ngn > a.price_ngn ? b : a)).id;
  }, [products]);

  const browse = useMemo(() => {
    if (tab === "courses")    return products.filter(p => p.product_type === "course");
    if (tab === "challenges") return products.filter(p => p.product_type === "challenge");
    return products;
  }, [products, tab]);

  if (loading) {
    return (
      <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 16px" }}>
        <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div className="px-6 py-8 max-w-6xl mx-auto">

        {/* Continue learning */}
        {inProgress.length > 0 && (
          <section className="mb-10">
            <h1 className="text-white text-2xl font-bold tracking-tight">Continue learning</h1>
            <p className="text-white/40 text-sm mt-1 mb-5">Pick up where you left off, or explore what&apos;s next.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inProgress.map((p) => (
                <ContinueCard key={p.id} p={p} accent={accentFor(products.indexOf(p))} />
              ))}
            </div>
          </section>
        )}

        {/* Browse everything */}
        <section>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5 pt-4 border-t border-white/6">
            <h2 className="text-white text-lg font-bold">Browse everything</h2>
            <div className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/8 p-1">
              {([["all", "All"], ["courses", "Courses"], ["challenges", "Challenges"]] as [Tab, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    tab === key ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {browse.length === 0 ? (
            <div className="text-center py-16 text-white/25 text-sm">Nothing here yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {browse.map((p) => (
                <BrowseCard key={p.id} p={p} index={products.indexOf(p)} isFlagship={p.id === flagshipId} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
