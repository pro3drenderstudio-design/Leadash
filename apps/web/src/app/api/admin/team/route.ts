/**
 * GET  /api/admin/team — list current admins + pending invites
 * POST /api/admin/team — send invite to a new team member
 * DELETE /api/admin/team — remove a team member (body: { user_id })
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const FROM    = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.com";

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin || admin.role !== "super_admin") return null;
  return { user, db };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { data: me } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch all admins
  const { data: admins } = await db.from("admins").select("user_id, role, added_by, added_at");
  const adminIds = (admins ?? []).map((a: { user_id: string }) => a.user_id);

  // Enrich with user data
  const { data: { users: allUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, { email: string; name: string | null }>(
    allUsers.map((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => [
      u.id,
      { email: u.email ?? "", name: (u.user_metadata?.full_name as string | undefined) ?? null },
    ])
  );

  const enriched = (admins ?? []).map((a: { user_id: string; role: string; added_at: string }) => ({
    ...a,
    email: userMap.get(a.user_id)?.email ?? "",
    name:  userMap.get(a.user_id)?.name  ?? null,
    is_you: a.user_id === user.id,
  }));

  // Fetch pending invites (not yet accepted, not expired)
  const { data: invites } = await db
    .from("admin_invites")
    .select("id, email, role, permissions, invited_at, expires_at")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("invited_at", { ascending: false });

  return NextResponse.json({ admins: enriched, invites: invites ?? [], myRole: me.role });
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 });

  const body = await req.json() as { email?: string; role?: string; permissions?: Record<string, boolean> };
  const { email, role = "support", permissions = {} } = body;

  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const validRoles = ["super_admin", "support", "billing", "readonly"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  // Delete any existing pending invite for this email
  await ctx.db.from("admin_invites").delete()
    .eq("email", email.toLowerCase().trim())
    .is("accepted_at", null);

  const { data: invite, error } = await ctx.db
    .from("admin_invites")
    .insert({
      email:       email.toLowerCase().trim(),
      role,
      permissions,
      invited_by:  ctx.user.id,
    })
    .select("id, email, role, token, permissions, expires_at")
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? "Failed to create invite" }, { status: 500 });
  }

  // Send invite email
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const acceptUrl = `${APP_URL}/admin/accept-invite?token=${invite.token}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    `Leadash Admin <${FROM}>`,
        to:      [invite.email],
        subject: "You've been invited to the Leadash admin panel",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="margin:0;font-size:20px;font-weight:700;color:#fff">Leadash Admin</p>
            </div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:32px">
              <p style="font-size:15px;color:#1e293b">You've been invited to join the Leadash admin panel as <strong>${role}</strong>.</p>
              <p style="font-size:14px;color:#64748b">Click the button below to accept your invitation. This link expires in 7 days.</p>
              <a href="${acceptUrl}" style="display:inline-block;margin:16px 0;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                Accept Invitation →
              </a>
              <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px">
                If you did not expect this invitation, you can safely ignore this email.
              </p>
            </div>
          </div>
        `,
        text: `You've been invited to the Leadash admin panel as ${role}.\n\nAccept your invitation:\n${acceptUrl}\n\nThis link expires in 7 days.`,
      }),
    }).catch(() => null);
  }

  const { token: _, ...safeInvite } = invite;
  return NextResponse.json({ ok: true, invite: safeInvite });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 });

  const body = await req.json() as { user_id?: string; invite_id?: string };

  if (body.invite_id) {
    await ctx.db.from("admin_invites").delete().eq("id", body.invite_id);
    return NextResponse.json({ ok: true });
  }

  if (body.user_id) {
    // Prevent removing yourself
    if (body.user_id === ctx.user.id) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }
    await ctx.db.from("admins").delete().eq("user_id", body.user_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "user_id or invite_id required" }, { status: 400 });
}
