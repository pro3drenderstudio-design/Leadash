/**
 * Shared challenge-task completion engine.
 *
 * Owns the "insert a completion row → if the day is now fully done, roll the
 * streak, award points, maybe finish the challenge, fire events" logic that
 * used to live inline in api/academy/task-completion. Both the manual
 * completion endpoint AND the auto-detect path (lib/academy/auto-detect, run
 * from the challenge GET) call this so scoring is identical no matter how a
 * task got completed.
 *
 * Points model is unchanged from the original inline version: points are
 * awarded once, when the *day* becomes fully complete, using the triggering
 * task's `points` plus a streak bonus.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueAutomation } from "@/lib/queue/client";

export interface ChallengeConfigLike {
  duration_days?: number;
  grace_days?: number;
  start_mode?: string;
  [key: string]: unknown;
}

export interface TaskRowLike {
  id: string;
  product_id: string;
  day: number;
  points: number;
}

export interface EnrollmentRowLike {
  id: string;
  workspace_id: string;
  product_id: string;
}

interface GamificationRow {
  id: string;
  points: number;
  streak_days: number;
  last_active_date: string | null;
}

const STREAK_BONUS_POINTS = 10;

export interface FinalizeResult {
  completion: unknown;
  gamification: GamificationRow | null;
  dayComplete: boolean;
  pointsAwarded: number;
  streakDays: number;
}

/**
 * Records a completion for `taskRow` on behalf of `enrollmentRow` and applies
 * all day-completion side effects. Idempotent per (enrollment, task): a repeat
 * call for the same task is a no-op for points (the completion upsert ignores
 * duplicates and the streak logic guards on `last_active_date`).
 *
 * Callers are responsible for auth, enrollment lookup, and the day-unlock check
 * BEFORE calling this.
 */
export async function finalizeTaskCompletion(
  db: SupabaseClient,
  params: {
    taskRow: TaskRowLike;
    enrollmentRow: EnrollmentRowLike;
    userId: string;
    challengeConfig: ChallengeConfigLike | null;
    completionThresholdPct: number;
    proofText?: string | null;
    proofFiles?: Array<{ url: string; name: string; type: string }> | null;
    metricValue?: number | null;
  },
): Promise<FinalizeResult> {
  const { taskRow, enrollmentRow, userId, challengeConfig, completionThresholdPct } = params;

  // Insert completion (ignore if already exists due to UNIQUE constraint)
  const { data: completion, error: completionError } = await db
    .from("academy_challenge_completions")
    .upsert(
      {
        enrollment_id: enrollmentRow.id,
        task_id: taskRow.id,
        product_id: taskRow.product_id,
        day: taskRow.day,
        status: "completed",
        proof_text: params.proofText ?? null,
        proof_files: params.proofFiles ?? null,
        metric_value: params.metricValue ?? null,
        points_awarded: 0, // updated below after streak calc
        completed_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,task_id", ignoreDuplicates: true },
    )
    .select()
    .single();

  if (completionError) throw new Error(completionError.message);

  // Check if all published tasks for this day are now complete
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
    ((dayCompletions ?? []) as { task_id: string }[]).map((c) => c.task_id),
  );
  const dayComplete = dayTaskIds.length > 0 && dayTaskIds.every((id) => completedTaskIds.has(id));

  let gamification: GamificationRow | null = null;
  let pointsAwarded = 0;
  let newStreakDays = 0;

  if (dayComplete) {
    const { data: existingGam } = await db
      .from("academy_gamification")
      .select("id, points, streak_days, last_active_date")
      .eq("enrollment_id", enrollmentRow.id)
      .maybeSingle();

    const todayStr = new Date().toISOString().split("T")[0];
    const graceDays = challengeConfig?.grace_days ?? 0;

    if (!existingGam) {
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
        .select("id, points, streak_days, last_active_date")
        .single();
      gamification = newGam as GamificationRow | null;
    } else {
      const gam = existingGam as GamificationRow;
      const lastActiveDate = gam.last_active_date;

      if (lastActiveDate === todayStr) {
        newStreakDays = gam.streak_days;
        pointsAwarded = 0; // don't double-award within the same day
      } else if (lastActiveDate) {
        const lastDate = new Date(lastActiveDate);
        const today = new Date(todayStr);
        const diffDays = Math.round((today.getTime() - lastDate.getTime()) / 86_400_000);

        if (diffDays === 1) {
          newStreakDays = gam.streak_days + 1;
        } else if (graceDays > 0 && diffDays <= graceDays + 1) {
          newStreakDays = gam.streak_days + 1;
        } else {
          newStreakDays = 1;
        }

        pointsAwarded = taskRow.points + (newStreakDays > 1 ? STREAK_BONUS_POINTS : 0);
      } else {
        newStreakDays = 1;
        pointsAwarded = taskRow.points;
      }

      const newPoints = gam.points + pointsAwarded;

      const { data: updatedGam } = await db
        .from("academy_gamification")
        .update({ points: newPoints, streak_days: newStreakDays, last_active_date: todayStr })
        .eq("id", gam.id)
        .select("id, points, streak_days, last_active_date")
        .single();
      gamification = updatedGam as GamificationRow | null;
    }

    if (pointsAwarded > 0) {
      await db
        .from("academy_challenge_completions")
        .update({ points_awarded: pointsAwarded })
        .eq("enrollment_id", enrollmentRow.id)
        .eq("task_id", taskRow.id);
    }

    // Mark the whole challenge complete once enough days are done
    const totalDurationDays = challengeConfig?.duration_days ?? 30;
    const requiredDays = Math.ceil(totalDurationDays * (completionThresholdPct / 100));
    const { data: allCompletions } = await db
      .from("academy_challenge_completions")
      .select("day")
      .eq("enrollment_id", enrollmentRow.id);

    const completedDays = new Set(((allCompletions ?? []) as { day: number }[]).map((c) => c.day));
    if (completedDays.size >= requiredDays) {
      await db
        .from("academy_enrollments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", enrollmentRow.id);
    }

    enqueueAutomation({
      event: "academy.challenge_day_completed",
      workspace_id: enrollmentRow.workspace_id,
      user_id: userId,
      payload: {
        product_id: taskRow.product_id,
        day: taskRow.day,
        points_awarded: pointsAwarded,
        streak_days: newStreakDays || (gamification?.streak_days ?? 0),
        enrollment_id: enrollmentRow.id,
      },
    }).catch(() => {});

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
          { onConflict: "user_id" },
        );
        await enqueueAutomation({
          event: "user.day1_completed",
          workspace_id: enrollmentRow.workspace_id,
          user_id: userId,
          payload: {
            completed_at: completedAt,
            bundle_offer_expires_at: fs?.bundle_offer_expires_at ?? null,
          },
        }).catch((err) => console.error("[complete-task] automation enqueue:", err));
      }
    }
  }

  return {
    completion,
    gamification,
    dayComplete,
    pointsAwarded,
    streakDays: newStreakDays || (gamification?.streak_days ?? 0),
  };
}
