import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: workspace } = await db
    .from("workspaces")
    .select("name, plan_id")
    .eq("id", workspaceId)
    .single();

  const { data: member } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user!.id)
    .single();

  return NextResponse.json({
    email:          user?.email ?? "",
    full_name:      user?.user_metadata?.full_name ?? "",
    workspace_name: workspace?.name ?? "",
    plan_id:        workspace?.plan_id ?? "free",
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
