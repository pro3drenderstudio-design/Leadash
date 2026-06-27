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

interface WinnerEntry {
  rank: number;
  enrollment_id: string;
  awarded_at?: string;
}

/** GET /api/admin/academy/challenge-winners?product_id=xxx
 *  Returns saved winners + top 3 by points from gamification. */
export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  // Fetch product to get saved winners
  const { data: product, error: productError } = await db
    .from("academy_products")
    .select("id, name, challenge_winners")
    .eq("id", productId)
    .maybeSingle();

  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const savedWinners = (product.challenge_winners ?? []) as WinnerEntry[];

  // Fetch top 3 by points from gamification for this product
  const { data: topGam, error: gamError } = await db
    .from("academy_gamification")
    .select("enrollment_id, points, streak_days, reported_earnings_cents, earnings_verified")
    .eq("product_id", productId)
    .order("points", { ascending: false })
    .limit(3);

  if (gamError) return NextResponse.json({ error: gamError.message }, { status: 500 });

  // Fetch enrollment + workspace details for top gamification rows
  const topEnrollmentIds = ((topGam ?? []) as { enrollment_id: string }[]).map((g) => g.enrollment_id);

  let enrollmentDetails: Array<{ id: string; workspace_id: string; workspaces: { name: string } | null }> = [];
  if (topEnrollmentIds.length > 0) {
    const { data: enrData } = await db
      .from("academy_enrollments")
      .select("id, workspace_id, workspaces(name)")
      .in("id", topEnrollmentIds);
    enrollmentDetails = (enrData ?? []) as typeof enrollmentDetails;
  }

  const enrollmentMap = new Map(enrollmentDetails.map((e) => [e.id, e]));

  const topByPoints = ((topGam ?? []) as {
    enrollment_id: string;
    points: number;
    streak_days: number;
    reported_earnings_cents: number;
    earnings_verified: boolean;
  }[]).map((g, idx) => {
    const enr = enrollmentMap.get(g.enrollment_id);
    const workspaceName =
      enr?.workspaces && typeof enr.workspaces === "object" && "name" in enr.workspaces
        ? (enr.workspaces as { name: string }).name
        : "";
    return {
      rank: idx + 1,
      enrollment_id: g.enrollment_id,
      workspace_id: enr?.workspace_id ?? null,
      workspace_name: workspaceName,
      points: g.points,
      streak_days: g.streak_days,
      reported_earnings_cents: g.reported_earnings_cents,
      earnings_verified: g.earnings_verified,
    };
  });

  return NextResponse.json({
    saved_winners: savedWinners,
    top_by_points: topByPoints,
  });
}

/** POST /api/admin/academy/challenge-winners
 *  Body: { product_id, winners: [{rank, enrollment_id}] }
 *  Saves winners to the challenge_winners column on academy_products. */
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { product_id?: string; winners?: WinnerEntry[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, winners } = body;
  if (!product_id || !Array.isArray(winners))
    return NextResponse.json({ error: "product_id and winners array required" }, { status: 400 });

  const now = new Date().toISOString();
  const winnersWithTimestamp = winners.map((w) => ({
    rank: w.rank,
    enrollment_id: w.enrollment_id,
    awarded_at: w.awarded_at ?? now,
  }));

  const { data, error } = await db
    .from("academy_products")
    .update({ challenge_winners: winnersWithTimestamp })
    .eq("id", product_id)
    .select("id, name, challenge_winners")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}
