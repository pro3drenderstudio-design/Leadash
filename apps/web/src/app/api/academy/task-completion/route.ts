import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { finalizeTaskCompletion } from "@/lib/academy/complete-task";
import { getAutoMetricValue, isAutoMetricSource, type MetricConfigLike } from "@/lib/academy/auto-detect";

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
  metric_config: MetricConfigLike | null;
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
    .in("status", ["active", "completed"])
    .maybeSingle();

  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled in this challenge" }, { status: 403 });

  const enrollmentRow = enrollment as EnrollmentRow;

  // Fetch product challenge_config + completion threshold
  const { data: product } = await db
    .from("academy_products")
    .select("challenge_config, completion_threshold_pct")
    .eq("id", taskRow.product_id)
    .maybeSingle();

  const challengeConfig = (product?.challenge_config ?? null) as ChallengeConfig | null;
  const completionThresholdPct = product?.completion_threshold_pct ?? 100;

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

  // Auto-detected metric tasks (inbox / plan) are completed by Leadash itself,
  // never self-reported — reject a manual completion until the condition holds
  // so the "Mark day complete" button can't skip the actual work.
  if (taskRow.task_type === "metric" && isAutoMetricSource(taskRow.metric_config?.source)) {
    const target = taskRow.metric_config?.target ?? 1;
    const value = await getAutoMetricValue(db, workspaceId, taskRow.metric_config!.source as "has_inbox" | "has_plan");
    if (value < target) {
      return NextResponse.json(
        { error: "This task completes automatically once you've done it — nothing to submit yet." },
        { status: 403 },
      );
    }
  }

  let result;
  try {
    result = await finalizeTaskCompletion(db, {
      taskRow,
      enrollmentRow,
      userId,
      challengeConfig,
      completionThresholdPct,
      proofText: proof_text,
      proofFiles: proof_files,
      metricValue: metric_value,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to complete task" }, { status: 500 });
  }

  return NextResponse.json({
    completion: result.completion,
    gamification: result.gamification,
    day_complete: result.dayComplete,
    points_awarded: result.pointsAwarded,
    streak_days: result.streakDays,
  });
}
