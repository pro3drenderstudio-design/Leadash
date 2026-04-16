/**
 * POST /api/auth/signup
 *
 * Creates a new user via Supabase admin SDK, then sends a branded
 * email-confirmation email via Resend — bypasses Supabase's default
 * email entirely.
 *
 * Body: { email: string; password: string; full_name?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const FROM    = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";
const API_KEY = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  const { email, password, full_name } = await req.json() as {
    email?: string;
    password?: string;
    full_name?: string;
  };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if signup is enabled (admin settings)
  const { data: settingsRow } = await admin
    .from("admin_settings")
    .select("value")
    .eq("key", "app_settings")
    .maybeSingle();
  const appSettings = settingsRow?.value as Record<string, unknown> | null;
  if (appSettings?.signup_enabled === false) {
    return NextResponse.json({ error: "New sign-ups are currently paused." }, { status: 403 });
  }

  // Generate signup link — this creates the user AND returns a confirmation link
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: { full_name: full_name ?? null },
      redirectTo: `${APP_URL}/api/auth/callback`,
    },
  });

  if (error) {
    // Map Supabase errors to friendly messages
    const msg = error.message ?? "";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("[signup] generateLink error:", error);
    return NextResponse.json({ error: "Could not create account. Please try again." }, { status: 500 });
  }

  const confirmLink = data?.properties?.action_link;
  if (!confirmLink) {
    return NextResponse.json({ error: "Could not generate confirmation link." }, { status: 500 });
  }

  // Send branded confirmation email via Resend
  if (API_KEY) {
    const name = full_name ?? email.split("@")[0];
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
          <p style="color:#f97316;font-size:13px;font-weight:600;margin:10px 0 0">Confirm your email address</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;margin-top:0">Hi ${name},</p>
          <p style="color:#6b7280">Thanks for signing up for Leadash! Click the button below to confirm your email address and activate your account.</p>
          <p style="margin:28px 0">
            <a href="${confirmLink}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Confirm Email →</a>
          </p>
          <p style="color:#9ca3af;font-size:13px">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
            If the button doesn't work, paste this URL into your browser:<br>
            <a href="${confirmLink}" style="color:#f97316;word-break:break-all;font-size:11px">${confirmLink}</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `;

    const text = [
      `Hi ${name},`,
      ``,
      `Thanks for signing up for Leadash!`,
      ``,
      `Click the link below to confirm your email address:`,
      confirmLink,
      ``,
      `This link expires in 24 hours.`,
      ``,
      `— The Leadash Team`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Leadash <${FROM}>`,
        to: [email],
        subject: "Confirm your Leadash account",
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[signup] Resend error:", res.status, body);
      // Don't fail the signup — user is created, just log the email failure
    }
  } else {
    console.warn("[signup] RESEND_API_KEY not set — confirmation email not sent");
  }

  return NextResponse.json({ ok: true });
}
