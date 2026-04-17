import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { cache } from "react";
import { unstable_cache } from "next/cache";

// DB lookup cached per user+workspace for 30 seconds.
// Avoids a DB round-trip on every server-side navigation.
const cachedWorkspaceLookup = unstable_cache(
  async (userId: string, workspaceId: string | null) => {
    const db = createAdminClient();
    if (!workspaceId) {
      const { data } = await db
        .from("workspace_members")
        .select("workspace_id, role, workspace:workspaces(*)")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .single();
      return data ?? null;
    }
    const { data } = await db
      .from("workspace_members")
      .select("workspace_id, role, workspace:workspaces(*)")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .single();
    return data ?? null;
  },
  ["workspace-context"],
  { revalidate: 30 },
);

/**
 * Resolves the current workspace from the x-workspace-id header.
 * Verifies the authenticated user is a member.
 * Cached per request via React cache(), and per user via unstable_cache (30s TTL).
 */
export const getWorkspaceContext = cache(async () => {
  const supabase    = await createClient();
  const headerStore = await headers();
  const workspaceId = headerStore.get("x-workspace-id") ?? null;

  // getSession() reads JWT from cookie — no Supabase auth server round-trip.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return null;

  const data = await cachedWorkspaceLookup(user.id, workspaceId);
  if (!data) return null;

  return { workspaceId: data.workspace_id, role: data.role, userId: user.id, workspace: data.workspace };
});
