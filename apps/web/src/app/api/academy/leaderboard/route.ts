import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

type BoardType = "points" | "earnings";
type ScopeType = "all_time" | "week";

interface GamificationRow {
  enrollment_id: string;
  points: number;
  streak_days: number;
  last_active_date: string | null;
  reported_earnings_cents: number;
  earnings_verified: boolean;
}

interface EnrollmentRow {
  id: string;
  workspace_id: string;
  status: string;
  workspaces: { name: string } | null;
}

interface ChallengeConfig {
  earnings_require_proof?: boolean;
  [key: string]: unknown;
}

const LEADERBOARD_LIMIT = 50;

/** GET /api/academy/leaderboard?product_id=xxx&board=points|earnings&scope=all_time|week
 *  Returns ranked participants. For earnings board, respects earnings_require_proof flag. */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { db, workspaceId } = auth;

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const board = (req.nextUrl.searchParams.get("board") ?? "points") as BoardType;
  const scope = (req.nextUrl.searchParams.get("scope") ?? "all_time") as ScopeType;

  if (!["points", "earnings"].includes(board))
    return NextResponse.json({ error: "board must be 'points' or 'earnings'" }, { status: 400 });
  if (!["all_time", "week"].includes(scope))
    return NextResponse.json({ error: "scope must be 'all_time' or 'week'" }, { status: 400 });

  // Workspace for current user (to identify "me" in the leaderboard)
  const myWorkspaceId = workspaceId;

  // Fetch product challenge_config (for earnings_require_proof setting)
  const { data: product } = await db
    .from("academy_products")
    .select("challenge_config")
    .eq("id", productId)
    .maybeSingle();

  const challengeConfig = (product?.challenge_config ?? null) as ChallengeConfig | null;
  const earningsRequireProof = challengeConfig?.earnings_require_proof ?? true;

  // Build gamification query
  let gamQuery = db
    .from("academy_gamification")
    .select("enrollment_id, points, streak_days, last_active_date, reported_earnings_cents, earnings_verified")
    .eq("product_id", productId);

  // For week scope, filter by last_active_date within the past 7 days
  if (scope === "week") {
    const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split("T")[0];
    gamQuery = gamQuery.gte("last_active_date", oneWeekAgo);
  }

  // Sort by the chosen board metric
  if (board === "points") {
    gamQuery = gamQuery.order("points", { ascending: false });
  } else {
    gamQuery = gamQuery.order("reported_earnings_cents", { ascending: false });
  }

  gamQuery = gamQuery.limit(LEADERBOARD_LIMIT);

  const { data: gamRows, error: gamError } = await gamQuery;
  if (gamError) return NextResponse.json({ error: gamError.message }, { status: 500 });

  let rows = (gamRows ?? []) as GamificationRow[];

  // For earnings board, filter out unverified earnings when proof is required
  if (board === "earnings" && earningsRequireProof) {
    rows = rows.filter((g) => g.earnings_verified);
  }

  if (rows.length === 0) {
    return NextResponse.json({
      board,
      scope,
      rows: [],
      me: null,
    });
  }

  // Fetch enrollment details for workspace names
  const enrollmentIds = rows.map((g) => g.enrollment_id);
  const { data: enrollments, error: enrollmentError } = await db
    .from("academy_enrollments")
    .select("id, workspace_id, status, workspaces(name)")
    .in("id", enrollmentIds);

  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });

  const enrollmentMap = new Map<string, EnrollmentRow>();
  for (const e of (enrollments ?? []) as EnrollmentRow[]) {
    enrollmentMap.set(e.id, e);
  }

  // Build ranked rows
  const rankedRows = rows.map((g, idx) => {
    const enr = enrollmentMap.get(g.enrollment_id);
    const workspaceName =
      enr?.workspaces && typeof enr.workspaces === "object" && "name" in enr.workspaces
        ? (enr.workspaces as { name: string }).name
        : "";

    return {
      rank: idx + 1,
      enrollment_id: g.enrollment_id,
      workspace_name: workspaceName,
      current_day: g.streak_days ?? 0,
      streak_days: g.streak_days ?? 0,
      points: g.points ?? 0,
      reported_earnings_cents: g.reported_earnings_cents ?? 0,
      earnings_verified: g.earnings_verified ?? false,
      is_me: myWorkspaceId ? enr?.workspace_id === myWorkspaceId : false,
      graduated: enr?.status === "completed",
    };
  });

  // Find "me" entry
  const meRow = myWorkspaceId
    ? rankedRows.find((r) => r.is_me) ?? null
    : null;

  // If "me" is not in top N, fetch their rank separately
  let me = meRow;
  if (!meRow && myWorkspaceId) {
    // Find the enrollment for "me" in this product
    const { data: myEnrollment } = await db
      .from("academy_enrollments")
      .select("id, workspace_id, status, workspaces(name)")
      .eq("workspace_id", myWorkspaceId)
      .eq("product_id", productId)
      .neq("status", "cancelled")
      .maybeSingle();

    if (myEnrollment) {
      const { data: myGam } = await db
        .from("academy_gamification")
        .select("enrollment_id, points, streak_days, last_active_date, reported_earnings_cents, earnings_verified")
        .eq("enrollment_id", myEnrollment.id)
        .maybeSingle();

      if (myGam) {
        const myGamRow = myGam as GamificationRow;
        const myEnrRow = myEnrollment as EnrollmentRow;
        const workspaceName =
          myEnrRow.workspaces && typeof myEnrRow.workspaces === "object" && "name" in myEnrRow.workspaces
            ? (myEnrRow.workspaces as { name: string }).name
            : "";

        // Count how many have a higher score to determine rank
        const scoreField = board === "points" ? "points" : "reported_earnings_cents";
        const myScore = board === "points" ? myGamRow.points : myGamRow.reported_earnings_cents;

        const { count: higherCount } = await db
          .from("academy_gamification")
          .select("*", { count: "exact", head: true })
          .eq("product_id", productId)
          .gt(scoreField, myScore);

        me = {
          rank: (higherCount ?? 0) + 1,
          enrollment_id: myGamRow.enrollment_id,
          workspace_name: workspaceName,
          current_day: myGamRow.streak_days ?? 0,
          streak_days: myGamRow.streak_days ?? 0,
          points: myGamRow.points ?? 0,
          reported_earnings_cents: myGamRow.reported_earnings_cents ?? 0,
          earnings_verified: myGamRow.earnings_verified ?? false,
          is_me: true,
          graduated: myEnrRow.status === "completed",
        };
      }
    }
  }

  return NextResponse.json({
    board,
    scope,
    rows: rankedRows,
    me,
  });
}
