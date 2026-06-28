import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

interface ChallengeConfig {
  duration_days?: number;
  grace_days?: number;
  start_mode?: string;
  auto_advance_offer?: {
    enabled?: boolean;
    trigger?: string;
    trigger_day?: number;
    window_hours?: number;
    target_product_id?: string;
    discount_type?: string;
    discount_value?: number;
  };
  [key: string]: unknown;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  pricing_type: string;
  price_ngn: number;
  product_type: string;
  challenge_config: ChallengeConfig | null;
  [key: string]: unknown;
}

interface EnrollmentRow {
  id: string;
  workspace_id: string;
  product_id: string;
  cohort_id: string | null;
  status: string;
  enrolled_at: string;
  completed_at: string | null;
  [key: string]: unknown;
}

interface TaskRow {
  id: string;
  day: number;
  position: number;
  task_type: string;
  title: string;
  points: number;
  lesson_id: string | null;
  is_published: boolean;
  [key: string]: unknown;
}

interface CompletionRow {
  task_id: string;
  day: number;
  status: string;
  points_awarded: number;
  completed_at: string;
  proof_files: unknown;
  proof_text: string | null;
  metric_value: number | null;
}

interface GamificationRow {
  points: number;
  streak_days: number;
  last_active_date: string | null;
  reported_earnings_cents: number;
  grace_days_used: number;
}

/** Compute whether a challenge day is unlocked given enrollment/cohort start and config. */
function isDayUnlocked(
  day: number,
  enrollment: EnrollmentRow,
  cohort: { starts_at: string } | null,
  challengeConfig: ChallengeConfig | null
): boolean {
  const startMode = challengeConfig?.start_mode ?? "enrollment";
  const startDate = startMode === "cohort" && cohort?.starts_at
    ? new Date(cohort.starts_at)
    : new Date(enrollment.enrolled_at);

  // day 1 unlocks immediately (offset 0), day 2 after 1 day, etc.
  const unlockTime = startDate.getTime() + (day - 1) * 86_400_000;
  return Date.now() >= unlockTime;
}

/** GET /api/academy/challenge?product_id=xxx (or ?product_slug=xxx)
 *  Returns the learner's full challenge state. */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { db, workspaceId } = auth;

  const productId = req.nextUrl.searchParams.get("product_id");
  const productSlug = req.nextUrl.searchParams.get("product_slug");
  if (!productId && !productSlug) return NextResponse.json({ error: "product_id or product_slug required" }, { status: 400 });

  // Resolve product by id or slug — the route param passed in by the learner UI
  // can legitimately be either (e.g. "challenge-30" is this product's id, while
  // its slug is "30-day-challenge"), so match against both columns.
  const lookupValue = (productId ?? productSlug) as string;
  const productRes = await db.from("academy_products").select("*").or(`id.eq.${lookupValue},slug.eq.${lookupValue}`).maybeSingle();

  if (productRes.error) return NextResponse.json({ error: productRes.error.message }, { status: 500 });
  if (!productRes.data) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const product = productRes.data as ProductRow;
  const resolvedProductId = product.id;

  // Fetch enrollment, tasks in parallel
  const [enrollmentRes, tasksRes] = await Promise.all([
    db
      .from("academy_enrollments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("product_id", resolvedProductId)
      .neq("status", "cancelled")
      .maybeSingle(),
    db
      .from("academy_challenge_tasks")
      .select("*")
      .eq("product_id", resolvedProductId)
      .eq("is_published", true)
      .order("day")
      .order("position"),
  ]);
  const enrollment = enrollmentRes.data as EnrollmentRow | null;
  const tasks = (tasksRes.data ?? []) as TaskRow[];

  // Fetch cohort if enrolled
  let cohort: { id: string; name: string; starts_at: string; ends_at: string | null } | null = null;
  if (enrollment?.cohort_id) {
    const { data } = await db
      .from("academy_cohorts")
      .select("id, name, starts_at, ends_at")
      .eq("id", enrollment.cohort_id)
      .single();
    cohort = data ?? null;
  }

  // Fetch gamification if enrolled
  let gamification: GamificationRow | null = null;
  if (enrollment) {
    const { data } = await db
      .from("academy_gamification")
      .select("points, streak_days, last_active_date, reported_earnings_cents, grace_days_used")
      .eq("enrollment_id", enrollment.id)
      .maybeSingle();
    gamification = data ?? null;
  }

  // Fetch completions if enrolled
  const completionMap = new Map<string, CompletionRow>();
  const daysCompleted: number[] = [];
  if (enrollment) {
    const { data: completions } = await db
      .from("academy_challenge_completions")
      .select("task_id, day, status, points_awarded, completed_at, proof_files, proof_text, metric_value")
      .eq("enrollment_id", enrollment.id);

    for (const c of (completions ?? []) as CompletionRow[]) {
      completionMap.set(c.task_id, c);
    }

    // Determine which days are fully complete (all published tasks done)
    const tasksByDay = new Map<number, TaskRow[]>();
    for (const t of tasks) {
      if (!tasksByDay.has(t.day)) tasksByDay.set(t.day, []);
      tasksByDay.get(t.day)!.push(t);
    }

    for (const [day, dayTasks] of tasksByDay.entries()) {
      const allDone = dayTasks.every((t) => completionMap.has(t.id));
      if (allDone) daysCompleted.push(day);
    }
    daysCompleted.sort((a, b) => a - b);
  }

  // Annotate tasks with completion state and unlock state
  const challengeConfig = product.challenge_config as ChallengeConfig | null;
  const tasksWithState = tasks.map((task) => {
    const completion = completionMap.get(task.id) ?? null;
    const unlocked = enrollment
      ? isDayUnlocked(task.day, enrollment, cohort, challengeConfig)
      : false;
    return {
      ...task,
      unlocked,
      completed: !!completion,
      completion,
    };
  });

  // Check if auto-advance offer is unlocked. Trigger types:
  //  - "day_complete": unlocks `window_hours` after the learner finishes a specific
  //    day (`trigger_day`, default 1) — the early-upsell case ("after Day 1...").
  //  - "graduate": unlocks once the whole challenge is completed.
  //  - "first_earnings": unlocks as soon as any revenue has been reported.
  let offerUnlocked = false;
  if (enrollment && challengeConfig?.auto_advance_offer?.enabled) {
    const offerCfg = challengeConfig.auto_advance_offer;
    const trigger = offerCfg.trigger ?? "graduate";
    const windowHours = offerCfg.window_hours ?? 24;

    if (trigger === "graduate" && enrollment.status === "completed") {
      offerUnlocked = true;
    } else if (trigger === "day_complete") {
      const triggerDay = offerCfg.trigger_day ?? 1;
      if (daysCompleted.includes(triggerDay)) {
        const dayCompletions = Array.from(completionMap.values()).filter((c) => c.day === triggerDay);
        const completedAt = dayCompletions.length > 0
          ? Math.max(...dayCompletions.map((c) => new Date(c.completed_at).getTime()))
          : 0;
        if (completedAt > 0 && Date.now() - completedAt <= windowHours * 3_600_000) {
          offerUnlocked = true;
        }
      }
    } else if (trigger === "first_earnings") {
      offerUnlocked = (gamification?.reported_earnings_cents ?? 0) > 0;
    }
  }

  return NextResponse.json({
    product,
    enrollment,
    cohort,
    gamification,
    tasks: tasksWithState,
    days_completed: daysCompleted,
    offer_unlocked: offerUnlocked,
  });
}
