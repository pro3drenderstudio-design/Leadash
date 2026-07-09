import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Courses",
  description: "Practical courses for Nigerian professionals — freelancing, client acquisition, and building a career that pays in dollars.",
};

type Product = {
  id: string; slug: string; name: string; description: string | null;
  price_ngn: number | null; compare_price_ngn: number | null;
  thumbnail_url: string | null; product_type: string;
  total_lessons: number;
};

const GRADIENTS = [
  "linear-gradient(135deg,#ea580c,#dc2626)",
  "linear-gradient(135deg,#7c3aed,#4f46e5)",
  "linear-gradient(135deg,#059669,#0891b2)",
  "linear-gradient(135deg,#db2777,#ea580c)",
];

async function getCatalog(): Promise<Product[]> {
  try {
    const db = createAdminClient();
    const { data: products } = await db
      .from("academy_products")
      .select("id, slug, name, description, price_ngn, compare_price_ngn, thumbnail_url, product_type")
      .eq("is_active", true)
      .eq("is_published", true)
      .order("price_ngn", { ascending: true });

    if (!products?.length) return [];

    const ids = products.map((p: { id: string }) => p.id);
    const { data: sections } = await db.from("academy_sections").select("id, product_id").in("product_id", ids);
    const sIds = (sections ?? []).map((s: { id: string }) => s.id);
    const lessonCounts: Record<string, number> = {};

    if (sIds.length > 0) {
      const { data: lessons } = await db.from("academy_lessons").select("section_id").in("section_id", sIds);
      for (const l of lessons ?? []) {
        const sec = (sections ?? []).find((s: { id: string }) => s.id === (l as { section_id: string }).section_id);
        if (sec) lessonCounts[(sec as { product_id: string }).product_id] = (lessonCounts[(sec as { product_id: string }).product_id] ?? 0) + 1;
      }
    }

    return products.map((p: { id: string; slug: string; name: string; description: string | null; price_ngn: number | null; compare_price_ngn: number | null; thumbnail_url: string | null; product_type: string }) => ({
      ...p,
      total_lessons: lessonCounts[p.id] ?? 0,
    }));
  } catch { return []; }
}

function CourseCard({ product, index }: { product: Product; index: number }) {
  const gradient = GRADIENTS[index % GRADIENTS.length];
  const isFree = !product.price_ngn || product.price_ngn === 0;

  return (
    <Link href={`/academy/courses/${product.slug}`} style={{ textDecoration: "none", display: "block" }}>
      <div className="course-card" style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden", transition: "box-shadow .2s, transform .2s" }}>
        {/* Thumbnail */}
        <div style={{ height: 180, background: product.thumbnail_url ? undefined : gradient, backgroundImage: product.thumbnail_url ? `url(${product.thumbnail_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center", display: "flex", alignItems: "flex-end", padding: 16 }}>
          <span style={{ background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, backdropFilter: "blur(4px)" }}>
            {product.product_type === "challenge" ? "Challenge" : "Course"}
          </span>
        </div>
        {/* Content */}
        <div style={{ padding: "20px 20px 24px" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.4 }}>{product.name}</h3>
          {product.description && (
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 16, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {product.description}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              {product.compare_price_ngn && (
                <span style={{ fontSize: 12, color: "#9ca3af", textDecoration: "line-through", marginRight: 6 }}>
                  ₦{product.compare_price_ngn.toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 17, fontWeight: 800, color: isFree ? "#059669" : "#111827" }}>
                {isFree ? "Free" : `₦${product.price_ngn!.toLocaleString()}`}
              </span>
            </div>
            {product.total_lessons > 0 && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{product.total_lessons} lessons</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function AcademyCoursesPage() {
  const products = await getCatalog();

  return (
    <main>
      <style>{`.course-card:hover{box-shadow:0 8px 30px -8px rgba(0,0,0,.12);transform:translateY(-2px)}`}</style>
      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg,#fff7ed 0%,#fff 60%)", padding: "72px 20px 64px", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.12em", background: "#fff7ed", padding: "4px 14px", borderRadius: 99, border: "1px solid #fed7aa", marginBottom: 20 }}>
            Leadash Academy
          </span>
          <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 900, color: "#111827", lineHeight: 1.15, marginBottom: 16, letterSpacing: "-0.03em" }}>
            Practical training for the<br />African professional
          </h1>
          <p style={{ fontSize: 17, color: "#6b7280", lineHeight: 1.7, marginBottom: 32 }}>
            Courses and challenges designed to help you land clients, earn in dollars, and build a career that grows — without leaving Nigeria.
          </p>
          <Link href="/f/challenge-7day/main" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 28px", borderRadius: 10, textDecoration: "none", boxShadow: "0 8px 24px -8px rgba(249,115,22,.5)" }}>
            Start with the 7-Day Challenge →
          </Link>
        </div>
      </section>

      {/* Course grid */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 20px" }}>
        {products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 20px", color: "#9ca3af" }}>
            <p style={{ fontSize: 16 }}>Courses coming soon. Check back shortly.</p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 32 }}>All Courses</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {products.map((p, i) => <CourseCard key={p.id} product={p} index={i} />)}
            </div>
          </>
        )}
      </section>

      {/* Challenge CTA */}
      <section style={{ background: "#111827", padding: "64px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem,4vw,2.25rem)", fontWeight: 800, color: "#fff", marginBottom: 12, letterSpacing: "-0.02em" }}>
            Ready to land your first client?
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
            Start with the 7-Day Job & Client Acquisition Challenge. ₦10,000. Proven system. Real results.
          </p>
          <Link href="/f/challenge-7day/main" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 28px", borderRadius: 10, textDecoration: "none" }}>
            Join the 7-Day Challenge — ₦10,000
          </Link>
        </div>
      </section>
    </main>
  );
}
