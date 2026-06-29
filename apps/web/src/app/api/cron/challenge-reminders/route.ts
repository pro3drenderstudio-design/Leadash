/**
 * GET /api/cron/challenge-reminders
 *
 * Runs hourly. For every active enrollment in a published `product_type: "challenge"`
 * product, computes the learner's current day (days_after_enrollment-style math,
 * matching isDayUnlocked in /api/academy/challenge) and fires two trigger events
 * into the existing Automations engine — no reminder copy is hardcoded here, that
 * stays editable in /admin/automations/builder:
 *
 *   - challenge.daily_reminder — once local time crosses challenge_config.reminders.daily_unlock_time
 *   - challenge.day_missed     — evening nudge if that day's published tasks aren't all completed
 *
 * Idempotency: each reminder is keyed by `daily_{day}` / `missed_{day}` in the
 * per-enrollment `reminders_sent` JSONB column — since `day` only increases once
 * per ~24h for a given enrollment, this naturally sends at most once per day.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";

export const maxDuration = 60;

const NUDGE_TIME = "18:00";

interface ChallengeConfigReminders {
  email: boolean;
  whatsapp: boolean;
  daily_unlock_time: string;
  timezone: string;
  nudge_missed: boolean;
}

interface ChallengeConfig {
  duration_days?: number;
  start_mode?: string;
  reminders?: ChallengeConfigReminders;
  [key: string]: unknown;
}

interface ProductRow {
  id: string;
  name: string;
  challenge_config: ChallengeConfig | null;
}

interface EnrollmentRow {
  id: string;
  user_id: string;
  workspace_id: string;
  product_id: string;
  cohort_id: string | null;
  enrolled_at: string;
  reminders_sent: Record<string, boolean> | null;
}

interface TaskRow {
  id: string;
  day: number;
  title: string;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function hhmmInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  }
}

async function resolveEmail(db: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  try {
    const { data: { user } } = await db.auth.admin.getUserById(userId);
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  let sent = 0;
  let skipped = 0;

  const { data: products } = await db
    .from("academy_products")
    .select("id, name, challenge_config")
    .eq("product_type", "challenge")
    .eq("is_published", true);

  for (const product of (products ?? []) as ProductRow[]) {
    const reminders = product.challenge_config?.reminders;
    if (!reminders || (!reminders.email && !reminders.whatsapp)) continue;

    const durationDays = product.challenge_config?.duration_days ?? 30;
    const startMode = product.challenge_config?.start_mode ?? "enrollment";
    const currentHHMM = hhmmInTimezone(reminders.timezone || "Africa/Lagos");

    const { data: enrollments } = await db
      .from("academy_enrollments")
      .select("id, user_id, workspace_id, product_id, cohort_id, enrolled_at, reminders_sent")
      .eq("product_id", product.id)
      .eq("status", "active");

    if (!enrollments?.length) continue;

    const { data: tasks } = await db
      .from("academy_challenge_tasks")
      .select("id, day, title")
      .eq("product_id", product.id)
      .eq("is_published", true);

    const tasksByDay = new Map<number, TaskRow[]>();
    for (const t of (tasks ?? []) as TaskRow[]) {
      if (!tasksByDay.has(t.day)) tasksByDay.set(t.day, []);
      tasksByDay.get(t.day)!.push(t);
    }

    for (const enrollment of enrollments as EnrollmentRow[]) {
      let startAt = new Date(enrollment.enrolled_at).getTime();
      if ((startMode === "cohort" || startMode === "fixed_cohort") && enrollment.cohort_id) {
        const { data: cohort } = await db.from("academy_cohorts").select("starts_at").eq("id", enrollment.cohort_id).maybeSingle();
        if (cohort?.starts_at) startAt = new Date(cohort.starts_at).getTime();
      }

      const day = Math.floor((Date.now() - startAt) / 86_400_000) + 1;
      if (day < 1 || day > durationDays) continue;

      const sentMap = { ...(enrollment.reminders_sent ?? {}) };
      const dayTasks = tasksByDay.get(day) ?? [];

      // ── Daily unlock reminder ────────────────────────────────────────────────
      const dailyKey = `daily_${day}`;
      if (sentMap[dailyKey]) {
        skipped++;
      } else if (currentHHMM >= (reminders.daily_unlock_time || "08:00")) {
        try {
          const email = reminders.email ? await resolveEmail(db, enrollment.user_id) : null;
          await enqueueAutomation({
            event: "challenge.daily_reminder",
            workspace_id: enrollment.workspace_id,
            user_id: enrollment.user_id,
            payload: {
              email,
              day,
              product_id: product.id,
              product_name: product.name,
              task_titles: dayTasks.map(t => t.title),
              enrollment_id: enrollment.id,
            },
          });
          sentMap[dailyKey] = true;
          await db.from("academy_enrollments").update({ reminders_sent: sentMap }).eq("id", enrollment.id);
          sent++;
        } catch (err) {
          console.error(`[challenge-reminders] daily reminder failed enrollment=${enrollment.id}:`, err instanceof Error ? err.message : err);
        }
      }

      // ── Missed-day nudge (evening check-in) ──────────────────────────────────
      const missedKey = `missed_${day}`;
      if (!reminders.nudge_missed || sentMap[missedKey] || dayTasks.length === 0 || currentHHMM < NUDGE_TIME) continue;

      const { data: completions } = await db
        .from("academy_challenge_completions")
        .select("task_id, status")
        .eq("enrollment_id", enrollment.id)
        .in("task_id", dayTasks.map(t => t.id));

      const completedIds = new Set(
        ((completions ?? []) as { task_id: string; status: string }[])
          .filter(c => c.status === "completed")
          .map(c => c.task_id),
      );
      const allDone = dayTasks.every(t => completedIds.has(t.id));
      if (allDone) continue;

      try {
        const email = reminders.email ? await resolveEmail(db, enrollment.user_id) : null;
        await enqueueAutomation({
          event: "challenge.day_missed",
          workspace_id: enrollment.workspace_id,
          user_id: enrollment.user_id,
          payload: {
            email,
            day,
            product_id: product.id,
            product_name: product.name,
            task_titles: dayTasks.filter(t => !completedIds.has(t.id)).map(t => t.title),
            enrollment_id: enrollment.id,
          },
        });
        sentMap[missedKey] = true;
        await db.from("academy_enrollments").update({ reminders_sent: sentMap }).eq("id", enrollment.id);
        sent++;
      } catch (err) {
        console.error(`[challenge-reminders] missed nudge failed enrollment=${enrollment.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
