import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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

  // Create workspace on the free plan with no trial. The trial program was
  // discontinued — users now sign up directly to the free plan, pay for
  // credits as they need them, and upgrade to a subscription when they want
  // subscription-gated features (more inboxes, warmup, etc.).
  const { data: workspace, error } = await db
    .from("workspaces")
    .insert({
      name:          name.trim(),
      slug:          `${slug}-${Date.now().toString(36)}`,
      owner_id:      user.id,
      plan_id:       "free",
      plan_status:   "active",
      max_inboxes:   3,
      trial_ends_at: null,
      billing_email: user.email ?? null,
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

  return NextResponse.json(workspace, { status: 201 });
}
