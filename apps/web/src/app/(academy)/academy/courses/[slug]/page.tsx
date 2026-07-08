import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

interface Props { params: Promise<{ slug: string }> }

type Lesson = { id: string; section_id: string; title: string; order_index: number; duration_seconds: number | null; is_free_preview: boolean };
type Section = { id: string; title: string; order_index: number; lessons: Lesson[] };
type Product = {
  id: string; slug: string; name: string; description: string | null;
  price_ngn: number | null; compare_price_ngn: number | null;
  thumbnail_url: string | null; product_type: string;
  credits_grant: number | null; certificate_enabled: boolean;
  sales_page_body: string | null; trailer_playback_id: string | null;
  sections: Section[]; total_lessons: number;
};

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const db = createAdminClient();
    const { data: product, error } = await db
      .from("academy_products")
      .select("id, slug, name, description, price_ngn, compare_price_ngn, thumbnail_url, product_type, credits_grant, certificate_enabled, sales_page_body, trailer_playback_id")
      .eq("slug", slug).eq("is_active", true).eq("is_published", true).single();

    if (error || !product) return null;

    const { data: sections } = await db
      .from("academy_sections")
      .select("id, title, order_index")
      .eq("product_id", product.id)
      .order("order_index", { ascending: true });

    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);
    let lessons: Lesson[] = [];
    if (sectionIds.length > 0) {
      const { data: ls } = await db
        .from("academy_lessons")
        .select("id, section_id, title, order_index, duration_seconds, is_free_preview")
        .in("section_id", sectionIds)
        .order("order_index", { ascending: true });
      lessons = (ls ?? []) as Lesson[];
    }

    const enrichedSections: Section[] = (sections ?? []).map((s: { id: string; title: string; order_index: number }) => ({
      ...s,
      lessons: lessons.filter(l => l.section_id === s.id),
    }));

    return { ...(product as Omit<Product, "sections" | "total_lessons">), sections: enrichedSections, total_lessons: lessons.length };
  } catch { return null; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Course Not Found" };
  return { title: product.name, description: product.description ?? undefined };
}

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

const GRADIENT = "linear-gradient(135deg,#ea580c,#dc2626)";

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const isFree = !product.price_ngn || product.price_ngn === 0;
  const isChallenge = product.product_type === "challenge";
  const enrollUrl = isChallenge ? "/f/challenge-7day/main" : `/academy/enroll/${product.slug}`;

  return (
    <main>
      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg,#111827 0%,#1f2937 100%)", padding: "56px 20px 64px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 48, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Link href="/academy" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Academy</Link>
              <span style={{ color: "#4b5563" }}>›</span>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{isChallenge ? "Challenge" : "Course"}</span>
            </div>
            <h1 style={{ fontSize: "clamp(1.75rem,4vw,2.75rem)", fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 16, letterSpacing: "-0.03em" }}>
              {product.name}
            </h1>
            {product.description && (
              <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, marginBottom: 28, maxWidth: 560 }}>{product.description}</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              {product.total_lessons > 0 && (
                <span style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
                  {product.total_lessons} lessons
                </span>
              )}
              {product.certificate_enabled && (
                <span style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/></svg>
                  Certificate
                </span>
              )}
            </div>
          </div>

          {/* Enroll card */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", minWidth: 260, boxShadow: "0 20px 60px -20px rgba(0,0,0,.5)" }}>
            <div style={{ height: 140, borderRadius: 10, marginBottom: 20, background: product.thumbnail_url ? undefined : GRADIENT, backgroundImage: product.thumbnail_url ? `url(${product.thumbnail_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ marginBottom: 20 }}>
              {product.compare_price_ngn && (
                <div style={{ fontSize: 13, color: "#9ca3af", textDecoration: "line-through", marginBottom: 2 }}>₦{product.compare_price_ngn.toLocaleString()}</div>
              )}
              <div style={{ fontSize: 28, fontWeight: 900, color: isFree ? "#059669" : "#111827" }}>
                {isFree ? "Free" : `₦${product.price_ngn!.toLocaleString()}`}
              </div>
            </div>
            <Link href={enrollUrl} style={{ display: "block", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 0", borderRadius: 10, textDecoration: "none", textAlign: "center", marginBottom: 12 }}>
              {isChallenge ? "Join the Challenge →" : isFree ? "Enroll for Free →" : "Enroll Now →"}
            </Link>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              {isChallenge ? "One-time payment · Lifetime community access" : isFree ? "No credit card required" : "One-time payment · Lifetime access"}
            </p>
          </div>
        </div>
      </section>

      {/* Curriculum */}
      {product.sections.length > 0 && (
        <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 28 }}>What you&apos;ll learn</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {product.sections.map((section, si) => (
              <div key={section.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
                    Day {si + 1}: {section.title}
                  </h3>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{section.lessons.length} lessons</span>
                </div>
                {section.lessons.length > 0 && (
                  <div style={{ padding: "8px 0" }}>
                    {section.lessons.map(lesson => (
                      <div key={lesson.id} style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                          <svg width="14" height="14" fill="none" stroke={lesson.is_free_preview ? "#f97316" : "#d1d5db"} strokeWidth="1.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                          </svg>
                          <span style={{ fontSize: 14, color: "#374151" }}>{lesson.title}</span>
                          {lesson.is_free_preview && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#f97316", background: "#fff7ed", padding: "2px 7px", borderRadius: 99, border: "1px solid #fed7aa" }}>Preview</span>
                          )}
                        </div>
                        {lesson.duration_seconds && (
                          <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{formatDuration(lesson.duration_seconds)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section style={{ background: "#f9fafb", padding: "56px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Ready to start?</h2>
          <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 24 }}>
            {isFree ? "Enroll for free and start learning today." : `Get instant access for ₦${product.price_ngn!.toLocaleString()}.`}
          </p>
          <Link href={enrollUrl} style={{ display: "inline-block", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 32px", borderRadius: 10, textDecoration: "none" }}>
            {isChallenge ? "Join the Challenge — ₦10,000" : isFree ? "Enroll for Free" : "Enroll Now"}
          </Link>
        </div>
      </section>
    </main>
  );
}
