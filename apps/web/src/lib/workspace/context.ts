import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * Resolves the current workspace from the x-workspace-id header.
 * Verifies the authenticated user is a member.
 * Cached per request via React cache().
 */
export const getWorkspaceContext = cache(async () => {
  const supabase    = await createClient();
  const headerStore = await headers();
  const workspaceId = headerStore.get("x-workspace-id");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (!workspaceId) {
    // Fall back: get first workspace the user belongs to
    const db = createAdminClient();
    const { data } = await db
      .from("workspace_members")
      .select("workspace_id, role, workspace:workspaces(*)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .single();
    if (!data) return null;
    return { workspaceId: data.workspace_id, role: data.role, userId: user.id, workspace: data.workspace };
  }

  const db = createAdminClient();
  const { data } = await db
    .from("workspace_members")
    .select("workspace_id, role, workspace:workspaces(*)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!data) return null;
  return { workspaceId: data.workspace_id, role: data.role, userId: user.id, workspace: data.workspace };
});
