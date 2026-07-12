/**
 * GET /api/admin/team/invite-check?token=xxx
 *
 * PUBLIC endpoint (bypassed in middleware) used by the /admin/accept-invite
 * page BEFORE it asks for auth. Lets us tell the difference between:
 *   • "you're invited — sign in with your existing account" (email exists)
 *   • "you're invited — create your account" (email doesn't exist)
 * without leaking anything sensitive to callers who don't know a valid token.
 *
 * The response only carries the invite's email + role when the token matches
 * an active invite, so guessing tokens yields `{valid: false}` and nothing
 * else. The user-existence check uses a service-role RPC — untrusted callers
 * can't hit it directly (see migration 078).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ valid: false, reason: "missing_token" });

  const db = createAdminClient();
  const { data: invite } = await db
    .from("admin_invites")
    .select("id, email, role, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ valid: false, reason: "not_found" });

  if (invite.accepted_at) {
    return NextResponse.json({ valid: false, reason: "already_used", email: invite.email });
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    return NextResponse.json({ valid: false, reason: "expired", email: invite.email });
  }

  // Does a Leadash user already exist for this email? Steers the UI toward
  // /login (yes) vs /signup (no). If the RPC isn't yet applied (migration
  // 078) we default to `false` — the user can still log in from /signup via
  // the "already have an account?" link, so worst case is a minor UX bump.
  let existsAsUser = false;
  try {
    const { data } = await db.rpc("get_user_id_by_email", { p_email: invite.email });
    if (data) existsAsUser = true;
  } catch {
    // migration 078 not applied yet
  }

  return NextResponse.json({
    valid:          true,
    email:          invite.email,
    role:           invite.role,
    exists_as_user: existsAsUser,
  });
}
