import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/workspace";

/**
 * GET /api/workspaces — list the caller's workspace memberships.
 * Used by the mobile app's workspace picker. Accepts cookie or Bearer auth.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req);
  if (!ctx.ok) return ctx.res;
  const { user, db } = ctx;

  const { data, error } = await db
    .from("workspace_members")
    .select("role, workspaces ( id, name, slug )")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type MemberRow = { role: string; workspaces: { id: string; name: string; slug: string } | null };
  const workspaces = ((data ?? []) as unknown as MemberRow[])
    .map((m) => m.workspaces ? { id: m.workspaces.id, name: m.workspaces.name, slug: m.workspaces.slug, role: m.role } : null)
    .filter(Boolean);

  return NextResponse.json({ workspaces });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Workspace name required" }, { status: 400 });

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const db   = createAdminClient();

  // Guard: prevent creating a second workspace if user already has one
  const { data: existing } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.workspace_id }, { status: 200 });

  // Every new workspace starts on a 14-day free trial: full page access, up to
  // 2 inboxes, can build sequences (but not activate — that needs a plan), and
  // up to 2,000 leads in the pool. The trial's limits come from the "free"
  // plan_config; access.ts allows "free" while trial_ends_at is in the future
  // and blocks it (pick-a-plan) once it lapses. A starter-sized credit grant
  // makes the pool usable during the trial.
  const TRIAL_DAYS = 14;
  const TRIAL_CREDITS = 2000;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: workspace, error } = await db
    .from("workspaces")
    .insert({
      name:                 name.trim(),
      slug:                 `${slug}-${Date.now().toString(36)}`,
      owner_id:             user.id,
      plan_id:              "free",
      plan_status:          "trial",
      max_inboxes:          2,
      trial_ends_at:        trialEndsAt,
      lead_credits_balance: TRIAL_CREDITS,
      billing_email:        user.email ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add owner as member
  await db.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id:      user.id,
    role:         "owner",
  });

  // Create default workspace settings
  await db.from("workspace_settings").insert({ workspace_id: workspace.id });

  // Link any anonymous CRM contact (e.g. a funnel opt-in lead) created under
  // this same email before the person had an account, so their journey shows
  // up as one contact timeline instead of two disconnected records.
  if (user.email) {
    await db.from("crm_contacts")
      .update({ user_id: user.id, workspace_id: workspace.id })
      .ilike("email", user.email)
      .is("user_id", null);
  }

  // Affiliate attribution — read the ld_ref cookie set by /r/[handle]
  const refCookie = req.cookies.get("ld_ref")?.value;
  if (refCookie) {
    const { data: affiliate } = await db
      .from("affiliates")
      .select("id, signups")
      .eq("id", refCookie)
      .maybeSingle();

    if (affiliate) {
      // Link workspace to affiliate
      await db.from("workspaces")
        .update({ referred_by_affiliate_id: affiliate.id })
        .eq("id", workspace.id);

      // Create referral record
      await db.from("referrals").insert({
        affiliate_id:          affiliate.id,
        referred_user_id:      user.id,
        referred_workspace_id: workspace.id,
        source:                "cookie",
        status:                "lead",
      });

      // Increment signup count atomically. Supabase's query builder only
      // implements PromiseLike.then() (no .catch()), so fall back via
      // the rejection handler of .then() instead of .catch().
      await db.rpc("increment_affiliate_signups", { aff_id: affiliate.id }).then(undefined, () =>
        db.from("affiliates")
          .update({ signups: (affiliate.signups ?? 0) + 1 })
          .eq("id", affiliate.id)
      );
    }
  }

  return NextResponse.json(workspace, { status: 201 });
}
