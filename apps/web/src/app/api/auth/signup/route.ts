/**
 * POST /api/auth/signup
 *
 * Dev:  Creates user with email pre-confirmed (no verification step).
 * Prod: Generates a confirmation link and sends it via Resend.
 *
 * Body: { email: string; password: string; full_name?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure the signing-up user has a crm_contacts row so future inbound
 * WhatsApp/email messages resolve to a named contact with tags. If a row
 * exists on this email already (e.g. from a funnel or challenge signup),
 * we link it to the auth user by setting user_id instead of duplicating.
 * All failures are swallowed — never block signup on a CRM bookkeeping
 * error.
 */
async function upsertCrmContactForUser(
  admin: SupabaseClient,
  userId: string,
  email: string,
  fullName: string | null,
): Promise<void> {
  try {
    const displayName = fullName?.trim() || email.split("@")[0];
    const { data: existing } = await admin
      .from("crm_contacts").select("id").eq("email", email).limit(1).maybeSingle();
    if (existing?.id) {
      await admin.from("crm_contacts").update({
        user_id: userId,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await admin.from("crm_contacts").insert({
        user_id: userId,
        email,
        display_name: displayName,
        lifecycle_stage: "lead",
        status: "active",
      });
    }
  } catch (e) {
    console.error("[signup] crm upsert failed:", e);
  }
}

const FROM    = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";
const API_KEY = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  // Rate limit: 10 signups per hour per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const admin0 = createAdminClient();
  const allowed = await checkRateLimit(admin0, `signup:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { email, password, full_name, redirect } = await req.json() as {
    email?:     string;
    password?:  string;
    full_name?: string;
    redirect?:  string;   // where to bounce after confirming email (e.g. /admin/accept-invite?token=…)
  };

  // Only accept in-app relative paths — blocks open-redirect abuse via the
  // confirmation email's ?next= param.
  const safeRedirect = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Bot detection: bots submit single-word random-char names (no spaces, >14 chars, embedded caps)
  if (full_name) {
    const n = full_name.trim();
    if (!n.includes(" ") && n.length > 14 && /[A-Z]/.test(n.slice(1))) {
      return NextResponse.json({ error: "Please enter your full name (first and last)." }, { status: 400 });
    }
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

  // Dev mode: no RESEND_API_KEY set — create user with email pre-confirmed
  if (!API_KEY) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null },
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      console.error("[signup] createUser error:", error);
      return NextResponse.json({ error: "Could not create account. Please try again." }, { status: 500 });
    }

    if (created?.user?.id) await upsertCrmContactForUser(admin, created.user.id, email, full_name ?? null);
    return NextResponse.json({ ok: true, confirmed: true });
  }

  // Production: generate confirmation link and send via Resend
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: { full_name: full_name ?? null },
      redirectTo: safeRedirect
        ? `${APP_URL}/api/auth/callback?next=${encodeURIComponent(safeRedirect)}`
        : `${APP_URL}/api/auth/callback`,
    },
  });

  if (error) {
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

  // generateLink also creates the auth user (unconfirmed). Upsert a CRM
  // contact now so inbound WhatsApp resolves even before the user confirms
  // their email. Failures here don't unwind the signup — the user still
  // gets their confirmation email.
  if (data?.user?.id) {
    await upsertCrmContactForUser(admin, data.user.id, email, full_name ?? null);
  }

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
          <a href="${confirmLink}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Confirm Email</a>
        </p>
        <p style="color:#9ca3af;font-size:13px">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
          If the button does not work, paste this URL into your browser:<br>
          <a href="${confirmLink}" style="color:#f97316;word-break:break-all;font-size:11px">${confirmLink}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px">- The Leadash Team</p>
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
    `- The Leadash Team`,
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
    // Don't fail the signup -- user is created, just log the email failure
  }

  return NextResponse.json({ ok: true });
}
