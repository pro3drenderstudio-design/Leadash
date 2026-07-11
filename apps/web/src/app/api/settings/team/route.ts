import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const FROM     = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "no-reply@notifications.leadash.com";

export type InviteEmailResult = {
  status: "sent" | "skipped" | "failed";
  error:  string | null;
};

// Sends the workspace invite email and reports success/failure instead of
// swallowing it. Previously every Resend / Postal failure was silently dropped
// via `.catch(() => null)`, leaving operators with no way to tell whether the
// recipient actually got the email.
async function sendInviteEmail(opts: { to: string; workspaceName: string; role: string; acceptUrl: string }): Promise<InviteEmailResult> {
  const { to, workspaceName, role, acceptUrl } = opts;
  const subject = `You've been invited to join ${workspaceName} on Leadash`;
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#374151">
      <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
        <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
        <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">You've been invited!</p>
        <p style="color:#6b7280">You've been invited to join <strong style="color:#111">${workspaceName}</strong> on Leadash as a <strong style="color:#111">${role}</strong>.</p>
        <p style="color:#6b7280;font-size:14px">Click the button below to accept your invitation. This link expires in 7 days.</p>
        <p style="margin:24px 0">
          <a href="${acceptUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept Invitation →</a>
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
  const text = [
    `You've been invited to join ${workspaceName} on Leadash as ${role}.`,
    `Accept your invitation: ${acceptUrl}`,
    `This link expires in 7 days.`,
  ].join("\n");

  // Always send transactional invites through Resend. The rest of the platform
  // (welcome emails, Postal health alerts, etc.) routes through Resend on the
  // same domain, and we want a single source of truth for deliverability.
  // Postal is reserved for outreach sends, not internal/system mail — using it
  // here was previously causing invites to vanish silently because Postal's
  // /send/message endpoint can return 200 while the message is dropped at the
  // server level.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "No email provider configured (RESEND_API_KEY and POSTAL_API_KEY both missing).";
    console.error("[settings/team] " + error);
    return { status: "skipped", error };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Leadash <${FROM}>`, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      const error = `Resend ${res.status}: ${body.slice(0, 300)}`;
      console.error("[settings/team] invite email via Resend failed:", error);
      return { status: "failed", error };
    }
    return { status: "sent", error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[settings/team] invite email via Resend threw:", error);
    return { status: "failed", error };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from("workspace_members")
      .select("id, role, joined_at, user_id")
      .eq("workspace_id", workspaceId),
    db.from("workspace_invites")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  // Enrich members with email from auth.users via admin client
  const adminDb = createAdminClient();
  type RawMember = { id: string; role: string; joined_at: string; user_id: string };
  const enriched = await Promise.all(
    (members as RawMember[] ?? []).map(async (m) => {
      const { data } = await adminDb.auth.admin.getUserById(m.user_id);
      return {
        id:        m.id,
        user_id:   m.user_id,
        role:      m.role,
        joined_at: m.joined_at,
        email:     data.user?.email ?? "",
        full_name: data.user?.user_metadata?.full_name ?? "",
      };
    }),
  );

  return NextResponse.json({ members: enriched, invites: invites ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { email, role = "member" } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data, error } = await db.from("workspace_invites").upsert(
    {
      workspace_id: workspaceId,
      email:        email.toLowerCase().trim(),
      role,
      invited_by:   user!.id,
      expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at:  null,
    },
    { onConflict: "workspace_id,email" },
  ).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send the invite email. Whatever happens, we always return the invite row
  // (it was created successfully); the client decides how to surface the
  // email outcome.
  let emailResult: InviteEmailResult = { status: "skipped", error: "Email send was not attempted." };
  const acceptUrl = `${APP_URL}/invite/${data.token}`;
  try {
    const adminDb = createAdminClient();
    const { data: ws } = await adminDb.from("workspaces").select("name").eq("id", workspaceId).single();
    const workspaceName = (ws as { name: string } | null)?.name ?? "your team";
    emailResult = await sendInviteEmail({ to: data.email, workspaceName, role: data.role, acceptUrl });
  } catch (e) {
    emailResult = { status: "failed", error: e instanceof Error ? e.message : String(e) };
    console.error("[settings/team] sendInviteEmail threw:", emailResult.error);
  }

  return NextResponse.json({
    ...data,
    email_status: emailResult.status,
    email_error:  emailResult.error,
    // When the email didn't go through, we expose the accept URL so the
    // operator can copy-paste it to the invitee until delivery is fixed.
    accept_url:   emailResult.status === "sent" ? null : acceptUrl,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, userId, db } = auth;

  const { member_id, invite_id } = await req.json() as { member_id?: string; invite_id?: string };

  // Delete a pending invite
  if (invite_id) {
    await db.from("workspace_invites")
      .delete()
      .eq("id", invite_id)
      .eq("workspace_id", workspaceId);
    return NextResponse.json({ ok: true });
  }

  if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 });

  // Fetch target member
  const { data: target } = await db
    .from("workspace_members")
    .select("user_id, role")
    .eq("id", member_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Block removing the last owner — workspace would become ownerless
  if (target.role === "owner") {
    const { count } = await db
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the only owner. Transfer ownership first." },
        { status: 400 },
      );
    }
  }

  // Block non-owners from removing others (only admins/owners can remove members)
  const { data: actor } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  const actorRole = actor?.role ?? "member";
  const canRemove = actorRole === "owner" || actorRole === "admin" || target.user_id === userId;
  if (!canRemove) {
    return NextResponse.json({ error: "Not authorized to remove this member." }, { status: 403 });
  }

  await db.from("workspace_members")
    .delete()
    .eq("id", member_id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true });
}
