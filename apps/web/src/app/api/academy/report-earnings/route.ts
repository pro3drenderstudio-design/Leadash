import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

/** POST /api/academy/report-earnings
 *  Body: { product_id, amount_cents, proof_url? }
 *  Records or updates the learner's self-reported earnings for a challenge product.
 *  Admin must separately verify (earnings_verified flag). */
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { db, workspaceId, userId } = auth;

  let body: { product_id?: string; amount_cents?: number; proof_url?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, amount_cents, proof_url } = body;
  if (!product_id || amount_cents === undefined)
    return NextResponse.json({ error: "product_id and amount_cents required" }, { status: 400 });

  if (typeof amount_cents !== "number" || amount_cents < 0)
    return NextResponse.json({ error: "amount_cents must be a non-negative number" }, { status: 400 });

  // Verify the user is enrolled in this product
  const { data: enrollment, error: enrollmentError } = await db
    .from("academy_enrollments")
    .select("id, product_id, status")
    .eq("workspace_id", workspaceId)
    .eq("product_id", product_id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled in this product" }, { status: 403 });

  // UPSERT gamification row with new earnings data
  // earnings_verified resets to false when the learner re-submits
  const { data: existing } = await db
    .from("academy_gamification")
    .select("id, points, streak_days, last_active_date, grace_days_used")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle();

  let gamification;
  if (existing) {
    const { data, error } = await db
      .from("academy_gamification")
      .update({
        reported_earnings_cents: amount_cents,
        earnings_proof_url: proof_url ?? null,
        earnings_verified: false,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    gamification = data;
  } else {
    // Create gamification record if it doesn't exist yet
    const { data, error } = await db
      .from("academy_gamification")
      .insert({
        enrollment_id: enrollment.id,
        user_id: userId,
        product_id,
        points: 0,
        streak_days: 0,
        last_active_date: null,
        reported_earnings_cents: amount_cents,
        earnings_proof_url: proof_url ?? null,
        earnings_verified: false,
        grace_days_used: 0,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    gamification = data;
  }

  return NextResponse.json({ gamification });
}
