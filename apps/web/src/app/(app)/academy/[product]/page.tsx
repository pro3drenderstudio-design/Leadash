"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet } from "@/lib/workspace/client";
import type { ProductWithEnrollment } from "@/types/academy";
import { formatNgn, lessonDuration } from "@/types/academy";
import MuxPlayer from "@mux/mux-player-react";
import "@/v2-app/v2-app.css";

/**
 * Sales landing page for a course — visible to enrolled and non-enrolled alike.
 *
 * The 30-day challenge has its own funnel-aware page at /academy/challenge-30
 * (countdown timer, Day-1 detection, bundle upsell). When a visitor lands
 * here via the slug-based route, we forward them so they get the full
 * experience instead of this generic landing.
 */
export default function CourseLandingPage() {
  const { product: slug } = useParams<{ product: string }>();
  const router = useRouter();

  const [product,  setProduct]  = useState<ProductWithEnrollment | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    // Forward the 30-day challenge to its funnel-aware page so users who
    // discover it via the catalog get the same experience as funnel users.
    if (slug === "30-day-challenge" || slug === "challenge-30") {
      router.replace("/academy/challenge-30");
      return;
    }
    wsGet<{ products: ProductWithEnrollment[] }>("/api/academy/products")
      .then(d => {
        const p = d.products.find(x => x.slug === slug || x.id === slug) ?? null;
        setProduct(p);
        if (p?.sections.length) setExpanded(p.sections[0].id);
      })
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) return <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div></div>;
  if (!product) return <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "var(--app-text-muted)" }}>Course not found.</div></div>;

  const enrolled     = !!product.enrollment;
  const allLessons   = product.sections.flatMap(s => s.lessons);
  const freePreviews = allLessons.filter(l => l.is_free_preview);
  const totalMins    = Math.round(allLessons.reduce((a, l) => a + (l.duration_secs ?? 0), 0) / 60);

  // Banner fields come from migration 054 — surfaced via select("*") on
  // /api/academy/products. Render the banner above the main split if any of
  // the banner_* fields are set.
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
            <Link href="/academy" className="text-sm text-white/40 hover:text-white/60 mb-5 inline-block">← Academy</Link>
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
                    <p className="text-xs text-emerald-400 font-semibold mb-4">✓ You're enrolled</p>
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
