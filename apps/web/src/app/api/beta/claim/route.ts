import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/beta/claim
 *
 * Called after a new user signs up and creates their workspace.
 * Checks if their email has an approved beta enrollment with no linked account yet.
 * If found, upgrades their workspace to Starter + grants 500 credits and links the enrollment.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ claimed: false });

  const db = createAdminClient();

  // Look for an approved enrollment for this email that has no user_id yet
  const { data: enrollment } = await db
    .from("beta_enrollments")
    .select("id, status, user_id, workspace_id")
    .eq("email", user.email ?? "")
    .eq("status", "approved")
    .is("user_id", null)
    .maybeSingle();

  if (!enrollment) return NextResponse.json({ claimed: false });

  // Get user's workspace
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) return NextResponse.json({ claimed: false });

  const workspaceId = member.workspace_id;
  const trialEnd    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Upgrade workspace
  await db.from("workspaces").update({
    plan_id:           "starter",
    plan_status:       "active",
    max_inboxes:       5,
    max_monthly_sends: 5000,
    max_seats:         3,
    trial_ends_at:     trialEnd,
    updated_at:        new Date().toISOString(),
  }).eq("id", workspaceId);

  // Grant 500 credits
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  const STARTER_CREDITS = 500;
  await db.from("workspaces")
    .update({ lead_credits_balance: (ws?.lead_credits_balance ?? 0) + STARTER_CREDITS })
    .eq("id", workspaceId);
  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    type:         "grant",
    amount:       STARTER_CREDITS,
    description:  "Beta programme — starter credits",
  });

  // Link enrollment to this user + workspace so it's not claimed again
  await db.from("beta_enrollments").update({
    user_id:      user.id,
    workspace_id: workspaceId,
    updated_at:   new Date().toISOString(),
  }).eq("id", enrollment.id);

  return NextResponse.json({ claimed: true });
}
