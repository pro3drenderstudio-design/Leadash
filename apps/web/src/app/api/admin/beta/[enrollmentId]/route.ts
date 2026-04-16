import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendBetaDecisionEmail } from "@/lib/email/notifications";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

// PATCH /api/admin/beta/[enrollmentId] — approve or reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> }
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { enrollmentId } = await params;
  const { action, review_note } = await req.json() as { action: "approve" | "reject"; review_note?: string };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const { data: enrollment } = await ctx.db
    .from("beta_enrollments")
    .select("workspace_id, user_id, status, email, name")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enrollment.status !== "pending") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  const { error } = await ctx.db
    .from("beta_enrollments")
    .update({
      status:      newStatus,
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: review_note ?? null,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", enrollmentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const hasAccount = !!enrollment.user_id && !!enrollment.workspace_id;

  if (action === "approve") {
    if (hasAccount) {
      // User already has an account — upgrade workspace immediately
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await ctx.db
        .from("workspaces")
        .update({
          plan_id:           "starter",
          plan_status:       "active",
          max_inboxes:       5,
          max_monthly_sends: 5000,
          max_seats:         3,
          trial_ends_at:     trialEnd,
          updated_at:        new Date().toISOString(),
        })
        .eq("id", enrollment.workspace_id);

      const { data: ws } = await ctx.db
        .from("workspaces")
        .select("lead_credits_balance")
        .eq("id", enrollment.workspace_id)
        .single();

      if (ws) {
        const STARTER_CREDITS = 500;
        await ctx.db.from("workspaces")
          .update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + STARTER_CREDITS })
          .eq("id", enrollment.workspace_id);
        await ctx.db.from("lead_credit_transactions").insert({
          workspace_id: enrollment.workspace_id,
          type:         "grant",
          amount:       STARTER_CREDITS,
          description:  "Beta programme — starter credits",
        });
      }
    }
    // If no account: the upgrade is deferred — handled by /api/beta/claim after signup
  }

  // Fire-and-forget decision email
  if (enrollment.email) {
    sendBetaDecisionEmail({
      userEmail:   enrollment.email,
      userName:    (enrollment as { name?: string | null }).name ?? null,
      approved:    action === "approve",
      reviewNote:  review_note ?? null,
      needsSignup: action === "approve" && !hasAccount,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
