import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { enqueueAutomation } from "@/lib/queue/client";

interface ChallengeConfig {
  duration_days?: number;
  grace_days?: number;
  start_mode?: string;
  [key: string]: unknown;
}

interface TaskRow {
  id: string;
  product_id: string;
  day: number;
  position: number;
  task_type: string;
  title: string;
  points: number;
  is_published: boolean;
}

interface EnrollmentRow {
  id: string;
  workspace_id: string;
  product_id: string;
  cohort_id: string | null;
  status: string;
  enrolled_at: string;
}

interface CohortRow {
  id: string;
  starts_at: string;
}

interface GamificationRow {
  id: string;
  enrollment_id: string;
  user_id: string;
  product_id: string;
  points: number;
  streak_days: number;
  last_active_date: string | null;
  reported_earnings_cents: number;
  grace_days_used: number;
}

/** Compute whether a challenge day is unlocked. */
function isDayUnlocked(
  day: number,
  enrollment: EnrollmentRow,
  cohort: CohortRow | null,
  challengeConfig: ChallengeConfig | null
): boolean {
  const startMode = challengeConfig?.start_mode ?? "enrollment";
  const startDate =
    startMode === "cohort" && cohort?.starts_at
      ? new Date(cohort.starts_at)
      : new Date(enrollment.enrolled_at);
  const unlockTime = startDate.getTime() + (day - 1) * 86_400_000;
  return Date.now() >= unlockTime;
}

const STREAK_BONUS_POINTS = 10;

/** POST /api/academy/task-completion
 *  Body: { task_id, proof_text?, proof_files?, metric_value? }
 *  Marks a challenge task complete, updates gamification. */
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { db, workspaceId, userId } = auth;

  let body: {
    task_id?: string;
    proof_text?: string;
    proof_files?: Array<{ url: string; name: string; type: string }>;
    metric_value?: number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { task_id, proof_text, proof_files, metric_value } = body;
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  // Fetch the task
  const { data: task, error: taskError } = await db
    .from("academy_challenge_tasks")
    .select("*")
    .eq("id", task_id)
    .eq("is_published", true)
    .maybeSingle();

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const taskRow = task as TaskRow;

  // Verify the user is enrolled in the task's product
  const { data: enrollment, error: enrollmentError } = await db
    .from("academy_enrollments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("product_id", taskRow.product_id)
    .eq("status", "active")
    .maybeSingle();

  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled in this challenge" }, { status: 403 });

  const enrollmentRow = enrollment as EnrollmentRow;

  // Fetch product challenge_config
  const { data: product } = await db
    .from("academy_products")
    .select("challenge_config")
    .eq("id", taskRow.product_id)
    .maybeSingle();

  const challengeConfig = (product?.challenge_config ?? null) as ChallengeConfig | null;

  // Fetch cohort if applicable
  let cohort: CohortRow | null = null;
  if (enrollmentRow.cohort_id) {
    const { data } = await db
      .from("academy_cohorts")
      .select("id, starts_at")
      .eq("id", enrollmentRow.cohort_id)
      .single();
    cohort = data ?? null;
  }

  // Check if this day is unlocked
  if (!isDayUnlocked(taskRow.day, enrollmentRow, cohort, challengeConfig)) {
    return NextResponse.json({ error: "Day not yet unlocked" }, { status: 403 });
  }

  // Insert completion (ignore if already exists due to UNIQUE constraint)
  const { data: completion, error: completionError } = await db
    .from("academy_challenge_completions")
    .upsert(
      {
        enrollment_id: enrollmentRow.id,
        task_id,
        product_id: taskRow.product_id,
        day: taskRow.day,
        status: "completed",
        proof_text: proof_text ?? null,
        proof_files: proof_files ?? null,
        metric_value: metric_value ?? null,
        points_awarded: 0, // will update below after streak calc
        completed_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,task_id", ignoreDuplicates: true }
    )
    .select()
    .single();

  if (completionError) return NextResponse.json({ error: completionError.message }, { status: 500 });

  // Check if all tasks for this day are now complete
  const { data: dayTasks } = await db
    .from("academy_challenge_tasks")
    .select("id")
    .eq("product_id", taskRow.product_id)
    .eq("day", taskRow.day)
    .eq("is_published", true);

  const dayTaskIds = ((dayTasks ?? []) as { id: string }[]).map((t) => t.id);

  const { data: dayCompletions } = await db
    .from("academy_challenge_completions")
    .select("task_id")
    .eq("enrollment_id", enrollmentRow.id)
    .in("task_id", dayTaskIds);

  const completedTaskIds = new Set(
    ((dayCompletions ?? []) as { task_id: string }[]).map((c) => c.task_id)
  );
  const dayComplete = dayTaskIds.every((id) => completedTaskIds.has(id));

  // Update gamification if the day is now complete
  let gamification: GamificationRow | null = null;
  let pointsAwarded = 0;
  let newStreakDays = 0;

  if (dayComplete) {
    // Fetch or create gamification row
    const { data: existingGam } = await db
      .from("academy_gamification")
      .select("*")
      .eq("enrollment_id", enrollmentRow.id)
      .maybeSingle();

    const todayStr = new Date().toISOString().split("T")[0];
    const graceDays = challengeConfig?.grace_days ?? 0;

    if (!existingGam) {
      // First day complete — create gamification record
      pointsAwarded = taskRow.points;
      newStreakDays = 1;

      const { data: newGam } = await db
        .from("academy_gamification")
        .insert({
          enrollment_id: enrollmentRow.id,
          user_id: userId,
          product_id: taskRow.product_id,
          points: pointsAwarded,
          streak_days: 1,
          last_active_date: todayStr,
          reported_earnings_cents: 0,
          grace_days_used: 0,
        })
        .select()
        .single();
      gamification = newGam as GamificationRow | null;
    } else {
      const gam = existingGam as GamificationRow;
      const lastActiveDate = gam.last_active_date;

      // Streak logic
      if (lastActiveDate === todayStr) {
        // Already recorded today — no streak change
        newStreakDays = gam.streak_days;
        pointsAwarded = 0; // don't double-award
      } else if (lastActiveDate) {
        const lastDate = new Date(lastActiveDate);
        const today = new Date(todayStr);
        const diffDays = Math.round(
          (today.getTime() - lastDate.getTime()) / 86_400_000
        );

        if (diffDays === 1) {
          // Consecutive day — increment streak
          newStreakDays = gam.streak_days + 1;
        } else if (graceDays > 0 && diffDays <= graceDays + 1) {
          // Within grace period — maintain streak
          newStreakDays = gam.streak_days + 1;
        } else {
          // Gap too large — reset streak
          newStreakDays = 1;
        }

        // Points = task points + streak bonus (10 per day if streak > 1)
        pointsAwarded = taskRow.points + (newStreakDays > 1 ? STREAK_BONUS_POINTS : 0);
      } else {
        newStreakDays = 1;
        pointsAwarded = taskRow.points;
      }

      const newPoints = gam.points + pointsAwarded;

      const { data: updatedGam } = await db
        .from("academy_gamification")
        .update({
          points: newPoints,
          streak_days: newStreakDays,
          last_active_date: todayStr,
        })
        .eq("id", gam.id)
        .select()
        .single();
      gamification = updatedGam as GamificationRow | null;
    }

    // Update points_awarded on the completion record
    if (pointsAwarded > 0) {
      await db
        .from("academy_challenge_completions")
        .update({ points_awarded: pointsAwarded })
        .eq("enrollment_id", enrollmentRow.id)
        .eq("task_id", task_id);
    }

    // Check if the entire challenge is complete (all days done)
    const totalDurationDays = challengeConfig?.duration_days ?? 30;
    const { data: allCompletions } = await db
      .from("academy_challenge_completions")
      .select("day")
      .eq("enrollment_id", enrollmentRow.id);

    const completedDays = new Set(
      ((allCompletions ?? []) as { day: number }[]).map((c) => c.day)
    );
    if (completedDays.size >= totalDurationDays) {
      await db
        .from("academy_enrollments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", enrollmentRow.id);
    }

    // Legacy funnel compat: the 30-Day Challenge's Day-1 completion drives the
    // Mizark bundle-upsell automation via funnel_states, predating challenge_config.
    if (taskRow.product_id === "challenge-30" && taskRow.day === 1) {
      const { data: fs } = await db
        .from("funnel_states")
        .select("day1_completed_at, bundle_offer_expires_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!fs?.day1_completed_at) {
        const completedAt = new Date().toISOString();
        await db.from("funnel_states").upsert(
          { user_id: userId, day1_completed_at: completedAt },
          { onConflict: "user_id" }
        );
        await enqueueAutomation({
          event: "user.day1_completed",
          workspace_id: enrollmentRow.workspace_id,
          user_id: userId,
          payload: {
            completed_at: completedAt,
            bundle_offer_expires_at: fs?.bundle_offer_expires_at ?? null,
          },
        }).catch((err) => console.error("[task-completion] automation enqueue:", err));
      }
    }
  }

  return NextResponse.json({
    completion,
    gamification,
    day_complete: dayComplete,
    points_awarded: pointsAwarded,
    streak_days: newStreakDays || (gamification?.streak_days ?? 0),
  });
}
