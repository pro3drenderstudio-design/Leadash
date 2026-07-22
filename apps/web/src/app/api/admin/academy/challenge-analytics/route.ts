import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

interface EnrollmentRow {
  id: string;
  workspace_id: string;
  status: string;
  completed_at: string | null;
  cohort_id: string | null;
  access_type: string;
  workspaces: { name: string } | null;
  academy_cohorts: { name: string } | null;
}

interface GamificationRow {
  enrollment_id: string;
  points: number;
  streak_days: number;
  last_active_date: string | null;
  reported_earnings_cents: number;
}

interface CompletionCountRow {
  day: number;
  completed: number;
}

/** GET /api/admin/academy/challenge-analytics?product_id=xxx&cohort_id=yyy */
export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const cohortId = req.nextUrl.searchParams.get("cohort_id");

  // 0. Fetch the product's duration so the frontend never has to hardcode it
  const { data: productRow } = await db
    .from("academy_products")
    .select("challenge_config")
    .eq("id", productId)
    .maybeSingle();
  const durationDays = (productRow?.challenge_config as { duration_days?: number } | null)?.duration_days ?? 30;

  // 1. Fetch enrollments for the product
  let enrollmentQuery = db
    .from("academy_enrollments")
    // FK hint required — see api/admin/academy/enrollments/route.ts for why a bare
    // academy_cohorts embed is ambiguous (PGRST201).
    .select("id, workspace_id, status, completed_at, cohort_id, access_type, workspaces(name), academy_cohorts!academy_enrollments_cohort_id_fkey(name)")
    .eq("product_id", productId);

  if (cohortId) enrollmentQuery = enrollmentQuery.eq("cohort_id", cohortId);

  const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });

  const rows = (enrollments ?? []) as EnrollmentRow[];
  const enrollmentIds = rows.map((e) => e.id);
  const totalEnrolled = rows.length;

  if (totalEnrolled === 0) {
    return NextResponse.json({
      duration_days: durationDays,
      tiles: {
        enrolled: 0,
        active_today: 0,
        completion_rate: 0,
        avg_streak: 0,
        revenue_reported_cents: 0,
        earning_count: 0,
      },
      retention: [],
      participants: [],
    });
  }

  // 2. Fetch gamification rows for all enrollments
  const { data: gamRows, error: gamError } = await db
    .from("academy_gamification")
    .select("enrollment_id, points, streak_days, last_active_date, reported_earnings_cents")
    .in("enrollment_id", enrollmentIds);

  if (gamError) return NextResponse.json({ error: gamError.message }, { status: 500 });

  const gamMap = new Map<string, GamificationRow>();
  for (const g of (gamRows ?? []) as GamificationRow[]) {
    gamMap.set(g.enrollment_id, g);
  }

  // 3. Fetch retention data (completions grouped by day)
  const { data: retentionRows, error: retentionError } = await db
    .from("academy_challenge_completions")
    .select("day")
    .eq("product_id", productId)
    .in("enrollment_id", enrollmentIds);

  if (retentionError) return NextResponse.json({ error: retentionError.message }, { status: 500 });

  // Group by day and count distinct enrollment_ids
  const dayMap = new Map<number, Set<string>>();
  for (const row of (retentionRows ?? []) as { day: number; enrollment_id?: string }[]) {
    if (!dayMap.has(row.day)) dayMap.set(row.day, new Set());
  }

  // Re-query with enrollment_id to count distinct
  const { data: retentionDetailed, error: retDetailError } = await db
    .from("academy_challenge_completions")
    .select("day, enrollment_id")
    .eq("product_id", productId)
    .in("enrollment_id", enrollmentIds);

  if (retDetailError) return NextResponse.json({ error: retDetailError.message }, { status: 500 });

  const dayEnrollmentMap = new Map<number, Set<string>>();
  for (const row of (retentionDetailed ?? []) as { day: number; enrollment_id: string }[]) {
    if (!dayEnrollmentMap.has(row.day)) dayEnrollmentMap.set(row.day, new Set());
    dayEnrollmentMap.get(row.day)!.add(row.enrollment_id);
  }

  const retention: CompletionCountRow[] = Array.from(dayEnrollmentMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, enrollmentSet]) => ({
      day,
      completed: enrollmentSet.size,
      pct: totalEnrolled > 0 ? Math.round((enrollmentSet.size / totalEnrolled) * 100) : 0,
    }));

  // 4. Compute tiles
  const todayStr = new Date().toISOString().split("T")[0];
  let activeTodayCount = 0;
  let graduatedCount = 0;
  let totalStreak = 0;
  let totalEarningsCents = 0;
  let earningCount = 0;
  let streakDataCount = 0;

  for (const enrollment of rows) {
    if (enrollment.status === "completed") graduatedCount++;

    const gam = gamMap.get(enrollment.id);
    if (gam) {
      if (gam.last_active_date === todayStr) activeTodayCount++;
      totalStreak += gam.streak_days ?? 0;
      streakDataCount++;
      if (gam.reported_earnings_cents > 0) {
        totalEarningsCents += gam.reported_earnings_cents;
        earningCount++;
      }
    }
  }

  const completionRate = totalEnrolled > 0 ? Math.round((graduatedCount / totalEnrolled) * 100) : 0;
  const avgStreak = streakDataCount > 0 ? Math.round(totalStreak / streakDataCount) : 0;

  // 5. Build participants list
  const participants = rows.map((enrollment) => {
    const gam = gamMap.get(enrollment.id);
    const workspaceName =
      enrollment.workspaces && typeof enrollment.workspaces === "object" && "name" in enrollment.workspaces
        ? (enrollment.workspaces as { name: string }).name
        : "";

    let participantStatus: "active" | "at_risk" | "graduated" = "active";
    if (enrollment.status === "completed") {
      participantStatus = "graduated";
    } else if (gam && gam.last_active_date && gam.last_active_date < todayStr) {
      // Last active was before today — at risk
      const daysDiff = Math.floor(
        (Date.now() - new Date(gam.last_active_date).getTime()) / 86_400_000
      );
      if (daysDiff >= 2) participantStatus = "at_risk";
    }

    return {
      enrollment_id: enrollment.id,
      workspace_id: enrollment.workspace_id,
      workspace_name: workspaceName,
      current_day: gam ? (gam.streak_days ?? 0) : 0,
      streak_days: gam?.streak_days ?? 0,
      points: gam?.points ?? 0,
      reported_earnings_cents: gam?.reported_earnings_cents ?? 0,
      status: participantStatus,
      completed_at: enrollment.completed_at,
      cohort_id: enrollment.cohort_id,
      cohort_name: enrollment.academy_cohorts?.name ?? null,
      access_type: enrollment.access_type,
    };
  });

  return NextResponse.json({
    duration_days: durationDays,
    tiles: {
      enrolled: totalEnrolled,
      active_today: activeTodayCount,
      completion_rate: completionRate,
      avg_streak: avgStreak,
      revenue_reported_cents: totalEarningsCents,
      earning_count: earningCount,
    },
    retention,
    participants,
  });
}
