/**
 * POST /api/admin/users/[userId]/message
 *
 * Sends a one-off email from the admin to a specific user via Resend.
 * Body: { subject: string; message: string }
 *
 * The message is sent as plain text wrapped in a minimal HTML template
 * that matches the Leadash brand. The admin's name is shown as the sender
 * and replies go to the RESEND_FROM_EMAIL address.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const FROM    = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { adminUser: user, db };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  const { userId } = await params;
  const body = await req.json() as { subject?: string; message?: string };

  const { subject, message } = body;
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
  }

  // Fetch the target user's email
  const { data: { user: target }, error } = await ctx.db.auth.admin.getUserById(userId);
  if (error || !target?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const recipientName = (target.user_metadata?.full_name as string | undefined) ?? target.email;

  // Convert newlines to <br> for HTML
  const messageHtml = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px 32px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Leadash</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Hi ${recipientName.split(" ")[0]},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">${messageHtml}</p>
      <p style="margin:0;font-size:14px;color:#64748b;">— The Leadash Team</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        You received this message because you have a Leadash account.
        <a href="${APP_URL}" style="color:#f97316;text-decoration:none;">leadash.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${recipientName.split(" ")[0]},\n\n${message}\n\n— The Leadash Team`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:     `Leadash <${FROM}>`,
      to:       [target.email],
      subject:  subject.trim(),
      html,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[admin/message] Resend error for ${target.email}:`, errBody);
    return NextResponse.json({ error: `Failed to send: ${errBody}` }, { status: 500 });
  }

  console.log(`[admin/message] Sent to ${target.email} by admin ${ctx.adminUser.email} — subject: "${subject}"`);
  return NextResponse.json({ ok: true, to: target.email });
}
