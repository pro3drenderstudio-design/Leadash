import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Resolve the authenticated user from either a Bearer token (mobile clients)
 * or the Supabase session cookie (web). Returns null if neither is valid.
 *
 * Bearer path: validates the access token against the Supabase auth server
 * (handles revocation correctly). Cookie path: reads the JWT locally via
 * getSession() — no auth-server round-trip.
 */
async function resolveUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin  = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user ?? null;
  }
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Authenticate the request (cookie or Bearer) without requiring a workspace.
 * For endpoints that run before workspace selection (e.g. GET /api/workspaces).
 */
export async function requireUser(req: Request): Promise<
  | { ok: true; user: User; db: ReturnType<typeof createAdminClient> }
  | { ok: false; res: NextResponse }
> {
  const user = await resolveUser(req);
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, user, db: createAdminClient() };
}

/**
 * Authenticate the request and return workspaceId + admin db client.
 * Returns a 401/403 NextResponse if auth fails — callers should return it.
 * Accepts both the web session cookie and `Authorization: Bearer <token>`
 * (mobile app). Workspace membership is always verified against the DB.
 */
export async function requireWorkspace(req: Request): Promise<
  | { ok: true; workspaceId: string; userId: string; db: ReturnType<typeof createAdminClient> }
  | { ok: false; res: NextResponse }
> {
  const user = await resolveUser(req);
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
