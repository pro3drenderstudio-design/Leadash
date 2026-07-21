import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { isLessonUnlocked } from "@/types/academy";
import { enqueueAutomation } from "@/lib/queue/client";
import { awardChallengePoints } from "@/lib/academy/points";

const POINTS_PER_LESSON = 10;
const POINTS_PER_COURSE = 200;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId, userId } = auth;

  let body: { lesson_id?: string; product_id?: string; watch_percent?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { lesson_id, product_id, watch_percent = 100 } = body;
  if (!lesson_id || !product_id) return NextResponse.json({ error: "lesson_id and product_id required" }, { status: 400 });

  // The client sends the product SLUG; rows key on the product's id. Resolve either.
  const { data: prodRow } = await db.from("academy_products").select("id").or(`id.eq.${product_id},slug.eq.${product_id}`).maybeSingle();
  const resolvedProductId = (prodRow?.id as string | undefined) ?? product_id;

  const [enrollmentRes, lessonRes] = await Promise.all([
    db.from("academy_enrollments")
      .select("*, academy_cohorts(*)")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .eq("product_id", resolvedProductId)
      .in("status", ["active", "completed"])
      .maybeSingle(),
    db.from("academy_lessons").select("*").eq("id", lesson_id).single(),
  ]);

  const enrollment = enrollmentRes.data;
  const lesson     = lessonRes.data;

  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  if (!lesson)     return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const cohort = (enrollment as Record<string, unknown>).academy_cohorts as Parameters<typeof isLessonUnlocked>[2];
  if (!isLessonUnlocked(lesson, enrollment, cohort))
    return NextResponse.json({ error: "Lesson not unlocked" }, { status: 403 });

  const isComplete = watch_percent >= 85;
  const now = new Date().toISOString();

  const { data: prog } = await db.from("academy_lesson_progress")
    .upsert({
      enrollment_id:   enrollment.id,
      lesson_id,
      status:          isComplete ? "completed" : "started",
      watch_percent,
      last_watched_at: now,
      ...(isComplete ? { completed_at: now } : {}),
    }, { onConflict: "enrollment_id,lesson_id", ignoreDuplicates: false })
    .select().single();

  if (!isComplete) return NextResponse.json({ progress: prog });

  enqueueAutomation({
    event:        "academy.lesson_completed",
    workspace_id: workspaceId,
    user_id:      userId,
    payload:      { product_id, lesson_id, enrollment_id: enrollment.id },
  }).catch(() => {});

  // Score watching a lesson to completion (once per lesson).
  await awardChallengePoints(db, { userId, workspaceId, action: "lesson_watched", ref: `lesson:${lesson_id}` });

  // Check overall course completion
  const [allLessonsRes, allProgressRes] = await Promise.all([
    db.from("academy_lessons").select("id").eq("product_id", resolvedProductId).eq("is_published", true),
    db.from("academy_lesson_progress").select("lesson_id").eq("enrollment_id", enrollment.id).eq("status", "completed"),
  ]);

  const allLessonIds   = ((allLessonsRes.data ?? []) as any[]).map((l: any) => l.id);
  const completedIds   = new Set(((allProgressRes.data ?? []) as any[]).map((p: any) => p.lesson_id));
  const totalCompleted = allLessonIds.filter(id => completedIds.has(id)).length;
  const pctComplete    = allLessonIds.length ? (totalCompleted / allLessonIds.length) * 100 : 0;

  const { data: product } = await db.from("academy_products")
    .select("completion_threshold_pct, certificate_enabled")
    .eq("id", resolvedProductId).single();
  const threshold = product?.completion_threshold_pct ?? 80;

  let certificate = null;
  if (pctComplete >= threshold) {
    await db.from("academy_enrollments")
      .update({ status: "completed", completed_at: now })
      .eq("id", enrollment.id);

    // Only fire once — skip if enrollment was already in completed state
    if (enrollment.status !== "completed") {
      enqueueAutomation({
        event:        "academy.course_completed",
        workspace_id: workspaceId,
        user_id:      userId,
        payload:      { product_id, enrollment_id: enrollment.id, pct_complete: Math.round(pctComplete) },
      }).catch(() => {});
    }

    if (product?.certificate_enabled) {
      const { count } = await db.from("academy_certificates").select("*", { count: "exact", head: true });
      const certNum = `LEADASH-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(5, "0")}`;
      const { data: cert } = await db.from("academy_certificates")
        .insert({ enrollment_id: enrollment.id, user_id: userId, product_id, certificate_number: certNum })
        .select().single();
      certificate = cert;
    }
  }

  return NextResponse.json({
    progress:       prog,
    course_complete: pctComplete >= threshold,
    pct_complete:   Math.round(pctComplete),
    certificate,
  });
}
