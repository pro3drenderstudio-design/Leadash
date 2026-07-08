"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";

interface Lesson {
  id: string;
  title: string;
  order_index: number;
  duration_seconds: number | null;
  is_free_preview: boolean;
}

interface Section {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
}

interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_ngn: number;
  compare_price_ngn: number | null;
  thumbnail_url: string | null;
  product_type: string;
  credits_grant: number;
  certificate_enabled: boolean;
  sales_page_body: string | null;
  trailer_playback_id: string | null;
  total_lessons: number;
  sections: Section[];
}

function fmt(n: number) {
  if (n === 0) return "Free";
  return `₦${n.toLocaleString("en-NG")}`;
}

function fmtDuration(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/academy/${slug}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then((d: { product?: Product } | null) => { if (d?.product) setProduct(d.product); })
      .finally(() => setLoading(false));
  }, [slug]);

  // auto-open first section
  useEffect(() => {
    if (product?.sections?.[0]) setOpenSection(product.sections[0].id);
  }, [product]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#9ca3af" }}>Loading...</p>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", gap: 16 }}>
        <p style={{ color: "#374151", fontWeight: 600 }}>Course not found</p>
        <Link href="/courses" style={{ color: "#f97316" }}>← Back to all courses</Link>
      </div>
    );
  }

  const is7Day       = product.slug === "challenge-7day";
  const enrollUrl    = is7Day ? "/challenge" : `/login?redirect=/academy/enroll/${product.slug}`;
  const isFree       = product.price_ngn === 0;
  const previewCount = product.sections.flatMap(s => s.lessons).filter(l => l.is_free_preview).length;

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f9fafb", minHeight: "100vh", color: "#111827" }}>

      {/* Nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/courses" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← All courses</Link>
          <span style={{ color: "#d1d5db" }}>|</span>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <span style={{ width: 24, height: 24, background: "#f97316", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Leadash Academy</span>
          </a>
        </div>
        <a href={enrollUrl} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#f97316", borderRadius: 8, padding: "7px 16px", textDecoration: "none" }}>
          {isFree ? "Enroll Free" : `Get Access — ${fmt(product.price_ngn)}`}
        </a>
      </nav>

      {/* Hero */}
      <section style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "48px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "inline-block", background: "#fff7ed", color: "#c2410c", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
              {product.product_type === "challenge" ? "Live Challenge" : "Course"}
            </div>
            <h1 style={{ fontSize: "clamp(24px,4vw,40px)", fontWeight: 800, lineHeight: 1.15, color: "#111827", marginBottom: 14, letterSpacing: "-0.02em" }}>
              {product.name}
            </h1>
            {product.description && (
              <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.65, marginBottom: 24 }}>{product.description}</p>
            )}

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
              {product.total_lessons > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
                  <span>📹</span> {product.total_lessons} lessons
                </div>
              )}
              {previewCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
                  <span>🔓</span> {previewCount} free preview{previewCount !== 1 ? "s" : ""}
                </div>
              )}
              {product.certificate_enabled && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
                  <span>🎓</span> Certificate
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div>
                {product.compare_price_ngn && (
                  <div style={{ fontSize: 13, color: "#9ca3af", textDecoration: "line-through" }}>{fmt(product.compare_price_ngn)}</div>
                )}
                <div style={{ fontSize: 30, fontWeight: 800, color: "#111827" }}>{fmt(product.price_ngn)}</div>
              </div>
              <a href={enrollUrl} style={{ background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 32px", borderRadius: 11, textDecoration: "none", boxShadow: "0 10px 24px -8px rgba(249,115,22,.5)" }}>
                {isFree ? "Enroll Free →" : "Get Access →"}
              </a>
            </div>
          </div>

          {/* Thumbnail / preview */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: product.thumbnail_url ? `url(${product.thumbnail_url}) center/cover` : "linear-gradient(135deg,#ea580c,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {!product.thumbnail_url && <span style={{ fontSize: 60 }}>🚀</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Curriculum */}
      {product.sections.length > 0 && (
        <section style={{ maxWidth: 860, margin: "48px auto", padding: "0 24px" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Course Curriculum</h2>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>
            {product.total_lessons} lessons · {previewCount > 0 ? `${previewCount} free preview${previewCount !== 1 ? "s" : ""}` : "Enroll to access all lessons"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {product.sections.map(section => (
              <div key={section.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: openSection === section.id ? "#fff7ed" : "#fff", border: "none", cursor: "pointer", textAlign: "left", gap: 12 }}
                >
                  <span style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>{section.title}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{section.lessons.length} lessons</span>
                    <span style={{ color: "#9ca3af", fontSize: 16 }}>{openSection === section.id ? "−" : "+"}</span>
                  </div>
                </button>
                {openSection === section.id && (
                  <div style={{ borderTop: "1px solid #f3f4f6" }}>
                    {section.lessons.map(lesson => (
                      <div key={lesson.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: "1px solid #f9fafb" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>
                          {lesson.is_free_preview ? "🔓" : "🔒"}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: lesson.is_free_preview ? "#111827" : "#6b7280" }}>{lesson.title}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {lesson.is_free_preview && (
                            <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600, background: "#fff7ed", padding: "2px 7px", borderRadius: 6 }}>Preview</span>
                          )}
                          {lesson.duration_seconds && (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDuration(lesson.duration_seconds)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Enroll CTA */}
      <section style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Ready to start?</h2>
        <p style={{ color: "#6b7280", fontSize: 15, marginBottom: 24 }}>
          {isFree ? "Enroll for free and start immediately." : `Get full access for ${fmt(product.price_ngn)}.`}
        </p>
        <a href={enrollUrl} style={{ display: "inline-block", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 36px", borderRadius: 11, textDecoration: "none", boxShadow: "0 10px 24px -8px rgba(249,115,22,.5)" }}>
          {isFree ? "Enroll Free →" : `Get Access — ${fmt(product.price_ngn)} →`}
        </a>
        {is7Day && (
          <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 12 }}>
            Pay via bank transfer (OPay 9021060638) or card. Confirmed within 2 hours.
          </p>
        )}
      </section>

      {/* Footer */}
      <footer style={{ background: "#0f172a", padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#475569", fontSize: 12 }}>
          © 2025 Leadash · <a href="/courses" style={{ color: "#64748b" }}>All Courses</a> ·{" "}
          <a href="/terms" style={{ color: "#64748b" }}>Terms</a> ·{" "}
          <a href="/privacy" style={{ color: "#64748b" }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
