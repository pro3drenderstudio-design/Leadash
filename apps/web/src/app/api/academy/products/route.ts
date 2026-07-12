import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { isLessonUnlocked } from "@/types/academy";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  // userId from requireWorkspace resolves BOTH cookie sessions (web) and
  // Bearer tokens (mobile) — a separate cookie-only getSession() here left
  // mobile requests with no enrollment/progress state.
  const { db, workspaceId, userId } = auth;

  const [publishedProductsRes, enrollmentsRes, cohortsRes, certificatesRes] = await Promise.all([
    db.from("academy_products").select("*").eq("is_active", true).eq("is_published", true).order("price_ngn"),
    userId
      ? db.from("academy_enrollments").select("*").eq("user_id", userId).eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] }),
    db.from("academy_cohorts").select("*").in("status", ["upcoming", "active"]).order("starts_at"),
    userId
      ? db.from("academy_certificates").select("*").eq("user_id", userId)
      : Promise.resolve({ data: [] }),
  ]);

  const enrollments  = enrollmentsRes.data  ?? [];
  const cohorts      = cohortsRes.data      ?? [];
  const certificates = certificatesRes.data ?? [];

  // A learner who is already enrolled must keep seeing their product even if an
  // admin later unpublishes it from new sales — fetch those separately and merge.
  let productsData = publishedProductsRes.data ?? [];
  const publishedIds = new Set(productsData.map((p: { id: string }) => p.id));
  const enrolledOnlyIds = [...new Set(enrollments.map((e: { product_id: string }) => e.product_id))]
    .filter(id => !publishedIds.has(id));
  if (enrolledOnlyIds.length > 0) {
    const { data: extraProducts } = await db.from("academy_products").select("*").in("id", enrolledOnlyIds);
    productsData = [...productsData, ...(extraProducts ?? [])];
  }

  // Fetch sections + lessons for all products
  const { data: sections } = await db.from("academy_sections").select("*").order("position");
  const { data: lessons }  = await db.from("academy_lessons").select("*").eq("is_published", true).order("position");

  // Fetch progress for enrolled products
  let progressMap: Record<string, Set<string>> = {};
  if (userId && enrollments.length) {
    const enrollmentIds = (enrollments as any[]).map(e => e.id);
    const { data: progress } = await db
      .from("academy_lesson_progress")
      .select("enrollment_id, lesson_id")
      .in("enrollment_id", enrollmentIds)
      .eq("status", "completed");
    for (const p of (progress ?? []) as any[]) {
      if (!progressMap[p.enrollment_id]) progressMap[p.enrollment_id] = new Set();
      progressMap[p.enrollment_id].add(p.lesson_id);
    }
  }

  const products = (productsData as any[]).map(p => {
    const enrollment = (enrollments as any[]).find(e => e.product_id === p.id) ?? null;
    const cohort = enrollment?.cohort_id
      ? (cohorts as any[]).find(c => c.id === enrollment.cohort_id) ?? null
      : (cohorts as any[]).find(c => c.product_id === p.id && c.is_default) ?? null;
    const certificate = (certificates as any[]).find(c => c.product_id === p.id) ?? null;

    const productSections = ((sections ?? []) as any[]).filter(s => s.product_id === p.id);
    const productLessons  = ((lessons  ?? []) as any[]).filter(l => l.product_id === p.id);

    const completedSet = enrollment ? (progressMap[enrollment.id] ?? new Set()) : new Set();

    const sectionsWithLessons = productSections.map((s: any) => ({
      ...s,
      lessons: productLessons
        .filter((l: any) => l.section_id === s.id)
        .map((l: any) => ({
          ...l,
          unlocked:  enrollment ? isLessonUnlocked(l, enrollment, cohort) : l.is_free_preview,
          completed: completedSet.has(l.id),
          progress:  null,
        })),
    }));

    const totalLessons    = productLessons.length;
    const completedCount  = enrollment ? productLessons.filter((l: any) => completedSet.has(l.id)).length : 0;

    return { ...p, enrollment, cohort, certificate, sections: sectionsWithLessons, total_lessons: totalLessons, completed_count: completedCount };
  });

  return NextResponse.json({ products });
}
