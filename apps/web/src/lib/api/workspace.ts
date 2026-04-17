import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Authenticate the request and return workspaceId + admin db client.
 * Returns a 401/403 NextResponse if auth fails — callers should return it.
 */
export async function requireWorkspace(req: Request): Promise<
  | { ok: true; workspaceId: string; userId: string; db: ReturnType<typeof createAdminClient> }
  | { ok: false; res: NextResponse }
> {
  const supabase = await createClient();
  // getSession() reads the JWT locally — no Supabase auth server round-trip.
  // Workspace membership is still verified against the DB below.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  // Workspace id from header (set by middleware / client)
  const workspaceId = req.headers.get("x-workspace-id");
  if (!workspaceId) return { ok: false, res: NextResponse.json({ error: "x-workspace-id header required" }, { status: 400 }) };

  const db = createAdminClient();
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member) return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { ok: true, workspaceId, userId: user.id, db };
}
