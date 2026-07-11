/**
 * POST /api/funnel/join
 *
 * Public opt-in endpoint for the /join funnel page.
 * Atomically creates: auth user → workspace → workspace_member → funnel_state.
 * Captures UTM params + WhatsApp number. Fires automation trigger on success.
 *
 * Body: {
 *   email: string;
 *   full_name: string;
 *   whatsapp_number: string;
 *   utm_source?: string; utm_medium?: string; utm_campaign?: string;
 *   utm_content?: string; utm_term?: string;
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { enqueueAutomation } from "@/lib/queue/client";

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";
const API_KEY    = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const db  = createAdminClient();

  // Rate limit: 5 join attempts per hour per IP
  const allowed = await checkRateLimit(db, `funnel:join:${ip}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await req.json() as {
    email?:           string;
    full_name?:       string;
    whatsapp_number?: string;
    utm_source?:      string;
    utm_medium?:      string;
    utm_campaign?:    string;
    utm_content?:     string;
    utm_term?:        string;
  };

  const { email, full_name, whatsapp_number } = body;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!full_name?.trim()) {
    return NextResponse.json({ error: "Your full name is required." }, { status: 400 });
  }
  if (!whatsapp_number?.trim()) {
    return NextResponse.json({ error: "A WhatsApp number is required." }, { status: 400 });
  }

  // Sanitise WhatsApp number — strip non-digits, ensure E.164-ish format
  const phone = whatsapp_number.replace(/[^\d+]/g, "").replace(/^\+?/, "+");
  if (phone.length < 10) {
    return NextResponse.json({ error: "Please enter a valid WhatsApp number with country code." }, { status: 400 });
  }

  // ── Check if user already exists ──────────────────────────────────────────
  const { data: existingUsers } = await db.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === email.toLowerCase());

  if (existingUser) {
    // User already registered — redirect them to /free-training with their session
    // They already get the free training access regardless.
    return NextResponse.json({ ok: true, existing: true, redirect: "/free-training" });
  }

  // ── Create auth user (no password — magic link / social only for funnel) ──
  // We generate a temp password; user logs in via magic link sent below.
  const tempPassword = crypto.randomUUID().replace(/-/g, "") + "Aa1!";

  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email:         email.toLowerCase(),
    password:      tempPassword,
    email_confirm: true, // Pre-confirm — we send our own branded email
    user_metadata: {
      full_name:       full_name.trim(),
      whatsapp_number: phone,
      funnel_source:   "join_page",
    },
  });

  if (authErr) {
    console.error("[funnel/join] createUser error:", authErr);
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }

  const userId = authData.user!.id;

  // ── Workspace ─────────────────────────────────────────────────────────────
  const slug = `${full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36)}`;
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: workspace, error: wsErr } = await db
    .from("workspaces")
    .insert({
      name:              full_name.trim(),
      slug,
      owner_id:          userId,
      plan_id:           "free",
      plan_status:       "trialing",
      max_inboxes:       3,
      trial_ends_at:     trialEndsAt,
      billing_email:     email.toLowerCase(),
      whatsapp_number:   phone,
      utm_source:        body.utm_source  ?? null,
      utm_medium:        body.utm_medium  ?? null,
      utm_campaign:      body.utm_campaign ?? null,
      utm_content:       body.utm_content ?? null,
      utm_term:          body.utm_term    ?? null,
      funnel_entry_at:   new Date().toISOString(),
    })
    .select("id")
    .single();

  if (wsErr || !workspace) {
    // Rollback auth user
    await db.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[funnel/join] workspace creation error:", wsErr);
    return NextResponse.json({ error: "Account setup failed. Please try again." }, { status: 500 });
  }

  // ── Workspace member ──────────────────────────────────────────────────────
  const { error: memErr } = await db.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id:      userId,
    role:         "owner",
  });

  if (memErr) {
    await db.from("workspaces").delete().eq("id", workspace.id).then(undefined, () => {});
    await db.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[funnel/join] workspace_member error:", memErr);
    return NextResponse.json({ error: "Account setup failed. Please try again." }, { status: 500 });
  }

  // ── Default workspace settings ────────────────────────────────────────────
  await db.from("workspace_settings").insert({ workspace_id: workspace.id }).then(undefined, () => {});

  // ── funnel_states ─────────────────────────────────────────────────────────
  await db.from("funnel_states").upsert(
    { user_id: userId },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  // ── Send magic link so user can access /free-training without a password ──
  const { data: linkData } = await db.auth.admin.generateLink({
    type:    "magiclink",
    email:   email.toLowerCase(),
    options: { redirectTo: `${APP_URL}/free-training` },
  });

  const magicLink = linkData?.properties?.action_link;

  if (magicLink) {
    await sendWelcomeEmail(email.toLowerCase(), full_name.trim(), magicLink).catch(err => {
      console.error("[funnel/join] welcome email error:", err);
    });
  }

  // ── Fire automation trigger ───────────────────────────────────────────────
  await enqueueAutomation({
    event:        "user.opted_in",
    workspace_id: workspace.id,
    user_id:      userId,
    payload: {
      email:           email.toLowerCase(),
      full_name:       full_name.trim(),
      whatsapp_number: phone,
      utm_source:      body.utm_source ?? null,
      utm_medium:      body.utm_medium ?? null,
      utm_campaign:    body.utm_campaign ?? null,
    },
  }).catch(err => console.error("[funnel/join] automation enqueue error:", err));

  return NextResponse.json({ ok: true, redirect: "/free-training" });
}

async function sendWelcomeEmail(
  email:     string,
  name:      string,
  magicLink: string,
) {
  if (!API_KEY) return; // Dev mode

  const firstName = name.split(" ")[0];

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:#111;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</p>
        <p style="margin:8px 0 0;color:#f97316;font-size:13px;font-weight:600">× Learn By Mizark</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:36px 32px">
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700">Hey ${firstName}, you're in! 🎉</h2>
        <p style="color:#6b7280;margin-top:4px">You've got free access to the training — just click the button below to watch it now.</p>
        <p style="margin:28px 0">
          <a href="${magicLink}"
             style="display:inline-block;background:#f97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
            Watch the Free Training →
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px">This link is active for 1 hour. After that, just request a new one at leadash.io/login.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">
        <p style="color:#6b7280;font-size:13px;margin:0">
          If you didn't sign up for this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    `Leadash × Learn By Mizark <${FROM_EMAIL}>`,
      to:      [email],
      subject: "Your free training access is ready 🎬",
      html,
    }),
  });
}
