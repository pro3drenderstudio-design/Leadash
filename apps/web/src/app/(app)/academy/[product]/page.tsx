"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";
import { formatNgn, lessonDuration } from "@/types/academy";
import MuxPlayer from "@mux/mux-player-react";
import "@/v2-app/v2-app.css";

// ─── Challenge config type ────────────────────────────────────────────────────

interface ChallengeConfig {
  duration_days?: number;
  week_titles?: string[];
  cohort_name?: string;
}

type ProductWithChallenge = ProductWithEnrollment & {
  product_type?: string;
  challenge_config?: ChallengeConfig | null;
};

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  const totalSecs = Math.floor(remaining / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return { d, h, m, s };
}

// ─── Challenge sales page ─────────────────────────────────────────────────────

function ChallengeSalesPage({ product, onReload }: { product: ProductWithChallenge; onReload: () => Promise<void> }) {
  const slug = product.slug;
  const enrolled = !!product.enrollment;
  const cfg = product.challenge_config ?? {};
  const cohortName = cfg.cohort_name ?? "June Cohort";
  const searchParams = useSearchParams();

  // Paystack checkout callback — webhook may still be processing, so retry the reload once.
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const bundleStatus  = searchParams.get("bundle");
    if (paymentStatus === "success" || bundleStatus === "success") {
      const timer = setTimeout(() => { onReload(); }, 2000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, onReload]);

  // Enrollment closes in 2 days for demo — in production this comes from cohort.ends_at
  const [closeTarget] = useState(() => Date.now() + 2 * 86400000 + 11 * 3600000);
  const { d, h, m, s } = useCountdown(closeTarget);

  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  async function handleFreeEnroll() {
    if (product.price_ngn > 0) return;
    setEnrolling(true);
    setEnrollError(null);
    try {
      await wsPost("/api/academy/enroll", { product_id: product.id });
      window.location.href = `/academy/${slug}/learn`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      setEnrollError(err?.message ?? "Failed to enroll. Please try again.");
      setEnrolling(false);
    }
  }

  const featureCards = [
    { color: "#60A5FA", icon: "▶", title: "Daily lessons", desc: "Short, action-first video lessons you can finish in under 30 minutes before breakfast." },
    { color: "#A78BFA", icon: "📊", title: "Real metrics", desc: "Tasks like 'send 20 messages' auto-track from your Leadash outbox. No manual counting." },
    { color: "#F97316", icon: "📸", title: "Submit proof", desc: "Screenshot your wins. Accountability is what gets you to $2,500 — not just watching videos." },
    { color: "#34D399", icon: "🏆", title: "Live leaderboard", desc: "Compete on points and on real revenue. Top 3 win prizes at the end of the 30 days." },
    { color: "#F472B6", icon: "📡", title: "Weekly live calls", desc: "Teardown clinics and Q&A sessions every Friday to unblock you in real time." },
    { color: "#FBBF24", icon: "🔥", title: "Streaks & grace", desc: "Build a streak, earn bonuses. 2 grace days so one slip won't break your entire sprint." },
  ];

  const faqs = [
    { q: "How much time per day?", a: "About 30–45 minutes. Watch the lesson, complete the task, submit proof. That's it. The curriculum is built for people with full-time jobs." },
    { q: "What if I miss a day?", a: "You get 2 grace days per 30-day sprint. Use them wisely. Miss more and you enter catch-up mode — you can still finish, but you lose streak bonuses." },
    { q: "Is it really refundable?", a: "Yes — 7-day full refund, no questions asked. Just email support@leadash.com within 7 days of purchase. After that, no refunds." },
    { q: "What happens after 30 days?", a: "Top earners win prizes. Everyone who finishes gets a $300 discount off the full Academy Package (₦450k value). The offer is open for 58 hours after graduation." },
  ];

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 22px 140px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          {/* Pill badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 999, padding: "5px 14px", marginBottom: 24 }}>
            <span style={{ fontSize: 13, color: "var(--app-accent)", fontWeight: 600 }}>
              🔥 30-Day Challenge · {cohortName}
            </span>
          </div>

          {/* H1 */}
          <h1 style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--app-text)", marginBottom: 20 }}>
            Go from{" "}
            <span style={{ color: "var(--app-text-muted)" }}>$0</span>
            {" "}to{" "}
            <span style={{ color: "var(--app-accent)" }}>$2,500</span>
            <br />
            in 30 days
          </h1>

          {/* Subtext */}
          <p style={{ color: "var(--app-text-muted)", fontSize: 17, lineHeight: 1.65, maxWidth: 520, margin: "0 auto 32px" }}>
            A structured, task-based sprint that turns complete beginners into B2B freelancers generating real revenue — with daily accountability built in.
          </p>

          {/* CTA row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            {enrolled ? (
              <Link href={`/academy/${slug}/learn`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: "var(--app-radius-lg)", textDecoration: "none" }}>
                Go to dashboard →
              </Link>
            ) : product.price_ngn === 0 ? (
              <button onClick={handleFreeEnroll} disabled={enrolling}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: "var(--app-radius-lg)", border: "none", cursor: enrolling ? "default" : "pointer", opacity: enrolling ? 0.7 : 1 }}>
                {enrolling ? "Enrolling…" : "Enrol now · Free"}
              </button>
            ) : (
              <Link href={`/academy/enroll/${slug}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: "var(--app-radius-lg)", textDecoration: "none" }}>
                Enrol now · {formatNgn(product.price_ngn)}
              </Link>
            )}
            {product.compare_price_ngn && (
              <span style={{ color: "var(--app-text-quiet)", fontSize: 15, textDecoration: "line-through" }}>
                {formatNgn(product.compare_price_ngn)}
              </span>
            )}
          </div>
          {enrollError && (
            <p style={{ color: "var(--app-danger, #f87171)", fontSize: 13, marginBottom: 12 }}>{enrollError}</p>
          )}
          <p style={{ color: "var(--app-text-quiet)", fontSize: 12, marginBottom: 28 }}>7-day money-back guarantee · No questions asked</p>

          {/* Countdown timer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
            {[{ label: "Days", val: d }, { label: "Hrs", val: h }, { label: "Min", val: m }, { label: "Sec", val: s }].map(({ label, val }) => (
              <div key={label} style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "12px 16px", minWidth: 62, textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "var(--app-text)", lineHeight: 1 }}>
                  {String(val).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 10, color: "var(--app-text-quiet)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>Enrollment closes soon · Cohort starts July 1</p>
        </div>

        {/* Social proof strip */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "24px 20px", marginBottom: 56, display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16 }}>
          {[
            { val: "1,200+", label: "Challengers enrolled" },
            { val: "$2,500", label: "Avg earnings target" },
            { val: "27%", label: "Hit target in 30 days" },
            { val: "4.9★", label: "Avg rating" },
          ].map(({ val, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--app-text)", marginBottom: 4 }}>{val}</div>
              <div style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* How 30 days work */}
        <div style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--app-text)", textAlign: "center", marginBottom: 10 }}>
            How the 30 days work
          </h2>
          <p style={{ color: "var(--app-text-muted)", fontSize: 15, textAlign: "center", marginBottom: 32, maxWidth: 480, margin: "0 auto 32px" }}>
            Every day has a lesson, a task, and a proof submission. You&apos;ll build real skills, track real revenue, and compete on a live leaderboard.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {featureCards.map((card) => (
              <div key={card.title} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "20px 18px" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: card.color + "22", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 16 }}>
                  <span>{card.icon}</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text)", marginBottom: 6 }}>{card.title}</p>
                <p style={{ fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.55 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div style={{ marginBottom: 56, background: "linear-gradient(135deg, rgba(249,115,22,0.10) 0%, var(--app-surface) 100%)", border: "1px solid rgba(249,115,22,0.18)", borderRadius: "var(--app-radius-lg)", padding: "28px 24px" }}>
          <div style={{ fontSize: 48, color: "var(--app-accent)", lineHeight: 1, marginBottom: 12, opacity: 0.7 }}>&quot;</div>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--app-text)", marginBottom: 20, fontStyle: "italic" }}>
            I&apos;d been trying to get my first freelance client for 6 months. On Day 19 of the challenge I closed my first ₦150k deal using exactly the outreach sequence from Day 11. This sprint is the accountability I needed — nothing else comes close.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 999, background: "var(--app-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>A</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>Adaeze O.</p>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>May Cohort · Lagos</p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text)", marginBottom: 20, textAlign: "center" }}>Frequently asked questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map((faq) => (
              <div key={faq.q} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "18px 20px" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)", marginBottom: 8 }}>{faq.q}</p>
                <p style={{ fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.6 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ textAlign: "center" }}>
          {enrolled ? (
            <Link href={`/academy/${slug}/learn`}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 26px", borderRadius: "var(--app-radius-lg)", textDecoration: "none" }}>
              Continue the challenge →
            </Link>
          ) : product.price_ngn === 0 ? (
            <button onClick={handleFreeEnroll} disabled={enrolling}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 26px", borderRadius: "var(--app-radius-lg)", border: "none", cursor: enrolling ? "default" : "pointer" }}>
              {enrolling ? "Enrolling…" : "Enrol now · Free"}
            </button>
          ) : (
            <Link href={`/academy/enroll/${slug}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 26px", borderRadius: "var(--app-radius-lg)", textDecoration: "none" }}>
              Enrol now · {formatNgn(product.price_ngn)}
            </Link>
          )}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, background: "rgba(7,7,10,0.92)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--app-border)", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>{formatNgn(product.price_ngn)}</span>
          {product.compare_price_ngn && (
            <span style={{ fontSize: 14, color: "var(--app-text-quiet)", textDecoration: "line-through" }}>{formatNgn(product.compare_price_ngn)}</span>
          )}
          <span style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>· closes in {d}d {h}h</span>
        </div>
        {enrolled ? (
          <Link href={`/academy/${slug}/learn`}
            style={{ background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: "var(--app-radius)", textDecoration: "none" }}>
            Go to dashboard
          </Link>
        ) : product.price_ngn === 0 ? (
          <button onClick={handleFreeEnroll} disabled={enrolling}
            style={{ background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: "var(--app-radius)", border: "none", cursor: enrolling ? "default" : "pointer" }}>
            {enrolling ? "Enrolling…" : "Enrol free"}
          </button>
        ) : (
          <Link href={`/academy/enroll/${slug}`}
            style={{ background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: "var(--app-radius)", textDecoration: "none" }}>
            Enrol now
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseLandingPage() {
  return (
    <Suspense fallback={
      <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
      </div>
    }>
      <CourseLandingPageInner />
    </Suspense>
  );
}

function CourseLandingPageInner() {
  const { product: slug } = useParams<{ product: string }>();

  const [product,  setProduct]  = useState<ProductWithChallenge | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    return wsGet<{ products: ProductWithChallenge[] }>("/api/academy/products")
      .then(d => {
        const p = d.products.find(x => x.slug === slug || x.id === slug) ?? null;
        setProduct(p);
        if (p?.sections?.length) setExpanded(p.sections[0].id);
      });
  }, [slug]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
    </div>
  );
  if (!product) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)" }}>Course not found.</div>
    </div>
  );

  // Challenge products get their own sales page
  if (product.product_type === "challenge") {
    return <ChallengeSalesPage product={product} onReload={load} />;
  }

  // ── Course sales page (existing) ──────────────────────────────────────────

  const enrolled     = !!product.enrollment;
  const allLessons   = product.sections.flatMap(s => s.lessons);
  const freePreviews = allLessons.filter(l => l.is_free_preview);
  const totalMins    = Math.round(allLessons.reduce((a, l) => a + (l.duration_secs ?? 0), 0) / 60);

  const p = product as unknown as {
    banner_image_url?:  string | null;
    banner_headline?:   string | null;
    banner_sub?:        string | null;
    banner_cta_text?:   string | null;
    banner_cta_url?:    string | null;
  };
  const hasBanner = Boolean(p.banner_image_url || p.banner_headline || p.banner_sub || p.banner_cta_text);

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      {hasBanner && (
        <CourseBanner
          imageUrl={p.banner_image_url ?? null}
          headline={p.banner_headline ?? null}
          sub={p.banner_sub ?? null}
          ctaText={p.banner_cta_text ?? null}
          ctaUrl={p.banner_cta_url ?? null}
        />
      )}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-5 gap-10">
          {/* Left: course info */}
          <div className="lg:col-span-3">
            <Link href="/academy" className="mb-5 inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-opacity">
              <img src="/Leadash_academy_logo_white.png" alt="Leadash Academy" style={{ height: 22, width: "auto", opacity: 0.7 }} />
            </Link>
            <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-4">{product.name}</h1>
            {product.description && (
              <p className="text-white/60 text-lg leading-relaxed mb-6">{product.description}</p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-white/50 mb-8">
              <span>📹 {allLessons.length} lessons</span>
              {totalMins > 0 && <span>⏱ {totalMins} min total</span>}
              <span>🎓 Certificate of completion</span>
              <span>💳 {product.credits_grant.toLocaleString()} Leadash credits</span>
              {product.leadash_months > 0 && <span>🔑 {product.leadash_months} months Leadash access</span>}
            </div>

            {product.sales_page_body && (
              <div className="text-white/70 text-sm leading-relaxed mb-8 whitespace-pre-wrap">
                {product.sales_page_body}
              </div>
            )}

            {/* Curriculum */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Curriculum</h2>
              <div className="space-y-2">
                {product.sections.map(section => (
                  <div key={section.id} className="border border-white/8 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpanded(expanded === section.id ? null : section.id)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/4 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-white">{section.title}</p>
                        <p className="text-xs text-white/40 mt-0.5">{section.lessons.length} lessons</p>
                      </div>
                      <svg className={`w-4 h-4 text-white/30 transition-transform ${expanded === section.id ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded === section.id && (
                      <div className="border-t border-white/8">
                        {section.lessons.map(l => (
                          <div key={l.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/5 last:border-0">
                            <span className="text-xs text-white/30 flex-shrink-0">
                              {l.lesson_type === "video" ? "▶" : l.lesson_type === "live" ? "📡" : "📝"}
                            </span>
                            {l.is_free_preview ? (
                              <Link href={`/academy/${slug}/learn/${l.id}`}
                                className="flex-1 text-sm text-orange-400 hover:text-orange-300">
                                {l.title}
                              </Link>
                            ) : (
                              <span className="flex-1 text-sm text-white/50">{l.title}</span>
                            )}
                            {l.is_free_preview && <span className="text-[10px] text-orange-400/70 border border-orange-500/20 px-1.5 py-0.5 rounded">Free</span>}
                            {l.duration_secs && <span className="text-xs text-white/25">{lessonDuration(l.duration_secs)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: sticky CTA card */}
          <div className="lg:col-span-2">
            <div className="sticky top-6 bg-white/4 border border-white/10 rounded-2xl overflow-hidden">
              {product.trailer_playback_id && (
                <div className="aspect-video bg-black">
                  <MuxPlayer
                    playbackId={product.trailer_playback_id}
                    streamType="on-demand"
                    style={{ width: "100%", height: "100%" }}
                    muted autoPlay
                  />
                </div>
              )}
              {!product.trailer_playback_id && product.thumbnail_url && (
                <div className="aspect-video bg-black overflow-hidden">
                  <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-6">
                {enrolled ? (
                  <>
                    <p className="text-xs text-emerald-400 font-semibold mb-4">✓ You&apos;re enrolled</p>
                    <Link href={`/academy/${slug}/learn`}
                      className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition-colors">
                      Continue Learning
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-3xl font-bold text-white">{formatNgn(product.price_ngn)}</span>
                      {product.compare_price_ngn && (
                        <span className="text-lg text-white/30 line-through">{formatNgn(product.compare_price_ngn)}</span>
                      )}
                    </div>
                    <Link href={`/academy/enroll/${slug}`}
                      className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-white font-bold py-3.5 rounded-xl text-base transition-colors mb-3">
                      Enroll Now
                    </Link>
                    <p className="text-xs text-white/30 text-center">Secure payment via Paystack</p>
                    {freePreviews.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/8">
                        <p className="text-xs text-white/40 mb-2">Try free:</p>
                        {freePreviews.slice(0, 3).map(l => (
                          <Link key={l.id} href={`/academy/${slug}/learn/${l.id}`}
                            className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300 py-1">
                            <span>▶</span> {l.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Course banner — sits above the main split. If banner_image_url is set, the
 * image fills the background with a dark gradient overlay; otherwise the
 * banner is a clean accent-tinted strip with the headline + optional CTA.
 *
 * Authored via the banner editor in the admin academy panel; all fields are
 * optional so authors can use just the headline + CTA without an image.
 */
function CourseBanner({
  imageUrl, headline, sub, ctaText, ctaUrl,
}: {
  imageUrl: string | null;
  headline: string | null;
  sub:      string | null;
  ctaText:  string | null;
  ctaUrl:   string | null;
}) {
  return (
    <div
      style={{
        position: "relative",
        borderBottom: "1px solid var(--app-border)",
        background: imageUrl ? `#000` : "var(--app-bg-elevated)",
        minHeight: 220,
        overflow: "hidden",
      }}
    >
      {imageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(7,7,10,0.45) 0%, rgba(7,7,10,0.92) 100%)",
            }}
          />
        </>
      )}
      <div
        style={{
          position: "relative",
          maxWidth: 1024,
          margin: "0 auto",
          padding: "44px 24px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1, maxWidth: 640 }}>
          {headline && (
            <h2
              style={{
                fontSize: 32,
                letterSpacing: "-0.025em",
                fontWeight: 500,
                color: "var(--app-text)",
                lineHeight: 1.15,
                marginBottom: sub ? 12 : 0,
              }}
            >
              {headline}
            </h2>
          )}
          {sub && (
            <p style={{ color: "var(--app-text-muted)", fontSize: 15, lineHeight: 1.55, maxWidth: 560 }}>
              {sub}
            </p>
          )}
        </div>
        {ctaText && ctaUrl && (
          <a href={ctaUrl} target="_blank" rel="noreferrer noopener" className="app-btn app-btn-primary app-btn-lg">
            {ctaText}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17L17 7"/><path d="M9 7h8v8"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
