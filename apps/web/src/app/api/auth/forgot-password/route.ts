/**
 * POST /api/auth/forgot-password
 *
 * Generates a Supabase password-reset link server-side (admin SDK),
 * then sends a branded email via Resend — bypasses Supabase's unreliable
 * built-in email and the 3 emails/hour free-tier rate limit.
 *
 * Body: { email: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const FROM     = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";
const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";
const API_KEY  = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  const { email } = await req.json() as { email?: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Always return success to the client to prevent email enumeration
  const ok = NextResponse.json({ ok: true });

  if (!API_KEY) {
    console.error("[forgot-password] RESEND_API_KEY not set");
    return ok;
  }

  try {
    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${APP_URL}/api/auth/callback?next=/reset-password`,
      },
    });

    if (error || !data?.properties?.action_link) {
      // User not found — don't leak existence, just return ok silently
      return ok;
    }

    const resetLink = data.properties.action_link;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">Reset your password</p>
          <p style="color:#6b7280">We received a request to reset the password for your Leadash account associated with <strong style="color:#111">${email}</strong>.</p>
          <p style="color:#6b7280">Click the button below to choose a new password. This link expires in <strong style="color:#111">1 hour</strong>.</p>
          <p style="margin:28px 0">
            <a href="${resetLink}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reset Password →</a>
          </p>
          <p style="color:#9ca3af;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
            If the button doesn't work, copy and paste this link:<br>
            <a href="${resetLink}" style="color:#f97316;word-break:break-all;font-size:11px">${resetLink}</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `;

    const text = [
      `Reset your Leadash password`,
      ``,
      `We received a request to reset the password for ${email}.`,
      ``,
      `Click the link below to set a new password (expires in 1 hour):`,
      resetLink,
      ``,
      `If you didn't request this, ignore this email.`,
      ``,
      `— The Leadash Team`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Leadash <${FROM}>`,
        to: [email],
        subject: "Reset your Leadash password",
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[forgot-password] Resend error:", res.status, body);
    }
  } catch (err) {
    console.error("[forgot-password] error:", err);
  }

  return ok;
}
