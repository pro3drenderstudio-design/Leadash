import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: workspace }, { data: member }] = await Promise.all([
    db.from("workspaces")
      .select("name, plan_id, plan_status, grace_ends_at")
      .eq("id", workspaceId)
      .single(),
    db.from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user!.id)
      .single(),
  ]);

  return NextResponse.json({
    email:          user?.email ?? "",
    full_name:      user?.user_metadata?.full_name ?? "",
    workspace_name: workspace?.name ?? "",
    plan_id:        workspace?.plan_id ?? "free",
    plan_status:    workspace?.plan_status ?? "active",
    grace_ends_at:  workspace?.grace_ends_at ?? null,
    role:           member?.role ?? "member",
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { full_name, workspace_name } = await req.json();

  const supabase = await createClient();
  const updates: Promise<unknown>[] = [];

  if (full_name !== undefined) {
    updates.push(supabase.auth.updateUser({ data: { full_name } }));
  }
  if (workspace_name !== undefined) {
    updates.push(db.from("workspaces").update({ name: workspace_name }).eq("id", workspaceId));
  }

  await Promise.all(updates);
  return NextResponse.json({ ok: true });
}
