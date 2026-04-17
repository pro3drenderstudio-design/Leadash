import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { invite_id } = await req.json() as { invite_id?: string };
  if (!invite_id) return NextResponse.json({ error: "invite_id required" }, { status: 400 });

  // Look up the invite (must belong to this workspace, must not be accepted)
  const { data: invite } = await db
    .from("workspace_invites")
    .select("id, email, role, token")
    .eq("id", invite_id)
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  // Extend expiry by 7 days from now
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .from("workspace_invites")
    .update({ expires_at: newExpiry })
    .eq("id", invite_id);

  // Send email
  const adminDb  = createAdminClient();
  const { data: ws } = await adminDb
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single();

  const workspaceName = (ws as { name: string } | null)?.name ?? "your team";
  const acceptUrl = `${APP_URL}/invite/${invite.token}`;

  await sendInviteEmail({ to: invite.email, workspaceName, role: invite.role, acceptUrl });

  return NextResponse.json({ ok: true });
}

async function sendInviteEmail(opts: {
  to: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
}): Promise<void> {
  const { to, workspaceName, role, acceptUrl } = opts;
  const FROM = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "notifications@leadash.com";

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
    ``,
    `Accept your invitation:`,
    acceptUrl,
    ``,
    `This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.`,
  ].join("\n");

  const postalHost   = process.env.POSTAL_HOST ?? process.env.SMTP_HOST;
  const postalApiKey = process.env.POSTAL_API_KEY;

  if (postalHost && postalApiKey) {
    await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Leadash <${FROM}>`, to: [to], subject, html_body: html, plain_body: text }),
    });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Leadash <${FROM}>`, to: [to], subject, html, text }),
    });
  }
}
