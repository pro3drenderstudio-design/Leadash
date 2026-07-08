import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/public/academy/[slug] — public product detail with free-preview lessons
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  const { data: product, error } = await db
    .from("academy_products")
    .select("id, slug, name, description, price_ngn, compare_price_ngn, thumbnail_url, product_type, credits_grant, certificate_enabled, sales_page_body, trailer_playback_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_published", true)
    .single();

  if (error || !product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch sections + their free-preview lessons
  const { data: sections } = await db
    .from("academy_sections")
    .select("id, title, order_index")
    .eq("product_id", product.id)
    .order("order_index", { ascending: true });

  const sectionIds = (sections ?? []).map(s => s.id as string);
  let lessons: Array<{ id: string; section_id: string; title: string; order_index: number; duration_seconds: number | null; is_free_preview: boolean }> = [];

  if (sectionIds.length > 0) {
    const { data: ls } = await db
      .from("academy_lessons")
      .select("id, section_id, title, order_index, duration_seconds, is_free_preview")
      .in("section_id", sectionIds)
      .order("order_index", { ascending: true });
    lessons = (ls ?? []) as typeof lessons;
  }

  const enrichedSections = (sections ?? []).map(s => ({
    ...s,
    lessons: lessons.filter(l => l.section_id === s.id).map(l => ({
      id:              l.id,
      title:           l.title,
      order_index:     l.order_index,
      duration_seconds: l.duration_seconds,
      is_free_preview:  l.is_free_preview,
    })),
  }));

  const totalLessons = lessons.length;

  return NextResponse.json({ product: { ...product, sections: enrichedSections, total_lessons: totalLessons } });
}
