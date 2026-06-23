/**
 * POST /api/funnel/complete-day1
 *
 * Called when a user completes Day 1 of the 30-day challenge.
 * Sets funnel_states.day1_completed_at and fires the automation event
 * that unlocks the bundle offer UI.
 * Idempotent — safe to call multiple times.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Check already completed — idempotent
  const { data: fs } = await db
    .from("funnel_states")
    .select("day1_completed_at, bundle_offer_expires_at, upsell_shown_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fs?.day1_completed_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const completedAt = new Date().toISOString();

  await db.from("funnel_states").upsert({
    user_id:           user.id,
    day1_completed_at: completedAt,
  }, { onConflict: "user_id" });

  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (member?.workspace_id) {
    await enqueueAutomation({
      event:        "user.day1_completed",
      workspace_id: member.workspace_id,
      user_id:      user.id,
      payload: {
        completed_at:            completedAt,
        bundle_offer_expires_at: fs?.bundle_offer_expires_at ?? null,
      },
    }).catch(err => console.error("[complete-day1] automation enqueue:", err));
  }

  return NextResponse.json({ ok: true, completed_at: completedAt });
}
