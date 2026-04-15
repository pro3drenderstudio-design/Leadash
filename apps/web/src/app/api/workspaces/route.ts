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

  // Create workspace — free plan gets 3 inboxes and a 14-day warmup trial
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: workspace, error } = await db
    .from("workspaces")
    .insert({
      name:          name.trim(),
      slug:          `${slug}-${Date.now().toString(36)}`,
      owner_id:      user.id,
      max_inboxes:   3,
      trial_ends_at: trialEndsAt,
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

  return NextResponse.json(workspace, { status: 201 });
}
