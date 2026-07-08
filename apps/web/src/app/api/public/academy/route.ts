import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Count lessons per product
  const productIds = (products ?? []).map(p => p.id);
  const { data: sections } = await db
    .from("academy_sections")
    .select("product_id")
    .in("product_id", productIds);

  const lessonCounts: Record<string, number> = {};
  if (sections) {
    const sectionIds = sections.map(s => s.id as string).filter(Boolean);
    if (sectionIds.length > 0) {
      const { data: lessons } = await db
        .from("academy_lessons")
        .select("section_id")
        .in("section_id", sectionIds);
      if (lessons) {
        for (const l of lessons) {
          const sec = sections.find(s => s.id === (l as Record<string, string>).section_id);
          if (sec?.product_id) lessonCounts[sec.product_id as string] = (lessonCounts[sec.product_id as string] ?? 0) + 1;
        }
      }
    }
  }

  const result = (products ?? []).map(p => ({
    ...p,
    total_lessons: lessonCounts[p.id] ?? 0,
  }));

  return NextResponse.json({ products: result });
}
