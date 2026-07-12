import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { isLessonUnlocked, AcademyLesson, AcademyEnrollment, AcademyCohort } from "@/types/academy";

/** GET /api/academy/lessons?product_id=xxx
 *  Returns sections+lessons with unlock/complete state for current user.
 *  Accessible to non-enrolled users (free preview lessons visible). */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  // auth.userId works for both cookie sessions (web) and Bearer tokens (mobile)
  const { db, workspaceId, userId } = auth;

  const [sectionsRes, lessonsRes, enrollmentRes] = await Promise.all([
    db.from("academy_sections").select("*").eq("product_id", productId).eq("is_published", true).order("position"),
    db.from("academy_lessons").select("*").eq("product_id", productId).eq("is_published", true).order("position"),
    userId
      ? db.from("academy_enrollments")
          .select("*")
          .eq("user_id", userId)
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sections   = sectionsRes.data   ?? [];
  const lessons    = lessonsRes.data    ?? [];
  const enrollment = enrollmentRes.data ?? null;

  let cohort = null;
  if (enrollment?.cohort_id) {
    const { data } = await db.from("academy_cohorts").select("*").eq("id", enrollment.cohort_id).single();
    cohort = data;
  }

  let progressMap: Record<string, { status: string; watch_percent: number; completed_at: string | null }> = {};
  if (enrollment) {
    const { data: progress } = await db
      .from("academy_lesson_progress")
      .select("lesson_id, status, watch_percent, completed_at")
      .eq("enrollment_id", enrollment.id);
    for (const p of progress ?? []) {
      progressMap[p.lesson_id] = p;
    }
  }

  const sectionsWithLessons = ((sections ?? []) as any[]).map((s: any) => ({
    ...s,
    lessons: ((lessons ?? []) as any[])
      .filter((l: any) => l.section_id === s.id)
      .map((l: any) => {
        const prog = progressMap[l.id] ?? null;
        return {
          ...l,
          unlocked:  enrollment ? isLessonUnlocked(l, enrollment as AcademyEnrollment, cohort as AcademyCohort | null) : l.is_free_preview,
          completed: prog?.status === "completed",
          progress:  prog ? { ...prog, lesson_id: l.id, enrollment_id: enrollment!.id } : null,
        };
      }),
  }));

  return NextResponse.json({ sections: sectionsWithLessons, enrollment, cohort });
}
