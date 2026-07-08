import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type SectionRow = { id: string; product_id: string };
type LessonRow  = { section_id: string };

// GET /api/public/academy — returns published, active products for the public catalog (no auth required)
export async function GET() {
  const db = createAdminClient();

  const { data: products, error } = await db
    .from("academy_products")
    .select("id, slug, name, description, price_ngn, compare_price_ngn, thumbnail_url, product_type, credits_grant, certificate_enabled")
    .eq("is_active", true)
    .eq("is_published", true)
    .order("price_ngn", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const productIds = (products ?? []).map((p: { id: string }) => p.id);
  const { data: sections } = await db
    .from("academy_sections")
    .select("id, product_id")
    .in("product_id", productIds);

  const lessonCounts: Record<string, number> = {};
  const typedSections = (sections ?? []) as SectionRow[];

  if (typedSections.length > 0) {
    const sectionIds = typedSections.map(s => s.id).filter(Boolean);
    if (sectionIds.length > 0) {
      const { data: lessons } = await db
        .from("academy_lessons")
        .select("section_id")
        .in("section_id", sectionIds);

      for (const l of (lessons ?? []) as LessonRow[]) {
        const sec = typedSections.find(s => s.id === l.section_id);
        if (sec?.product_id) {
          lessonCounts[sec.product_id] = (lessonCounts[sec.product_id] ?? 0) + 1;
        }
      }
    }
  }

  const result = (products ?? []).map((p: { id: string }) => ({
    ...p,
    total_lessons: lessonCounts[(p as { id: string }).id] ?? 0,
  }));

  return NextResponse.json({ products: result });
}
