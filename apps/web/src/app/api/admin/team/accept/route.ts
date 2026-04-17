/**
 * POST /api/admin/team/accept — accept an admin invite
 * Body: { token: string }
 * The calling user must be authenticated. If the email matches their account,
 * they are added to the admins table with the invite's role.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be logged in to accept an invitation" }, { status: 401 });

  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const db = createAdminClient();

  const { data: invite, error } = await db
    .from("admin_invites")
    .select("id, email, role, permissions, accepted_at, expires_at")
    .eq("token", token)
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: "Invitation not found or already used" }, { status: 404 });
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 400 });
  }

  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({
      error: `This invitation was sent to ${invite.email}. Please sign in with that email address to accept it.`,
    }, { status: 403 });
  }

  // Check if already an admin
  const { data: existing } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!existing) {
    await db.from("admins").insert({
      user_id:  user.id,
      role:     invite.role,
      added_by: null,
      added_at: new Date().toISOString(),
    });
  } else {
    // Update role if already admin
    await db.from("admins").update({ role: invite.role }).eq("user_id", user.id);
  }

  // Mark invite as accepted
  await db.from("admin_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  return NextResponse.json({ ok: true, role: invite.role });
}
