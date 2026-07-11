import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { enqueueAutomation } from "@/lib/queue/client";
import { normalisePhoneNG } from "@/lib/phone";

export const maxDuration = 30;

const WA_COMMUNITY_MANAGER  = "2349110260332";
const APP_URL               = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const RESEND_API_KEY        = process.env.RESEND_API_KEY;
const RESEND_FROM           = process.env.RESEND_FROM_EMAIL ?? "no-reply@notifications.leadash.com";
const PAYSTACK_SECRET_KEY   = process.env.PAYSTACK_SECRET_KEY ?? "";

async function verifyPaystackPayment(reference: string, expectedKobo: number): Promise<boolean> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const { data } = await res.json() as { data?: { status: string; amount: number; currency: string } };
    return data?.status === "success" && data.currency === "NGN" && data.amount >= expectedKobo;
  } catch {
    return false;
  }
}

// POST /api/challenge/signup
// Creates a Leadash account + challenge_signups record (bank transfer path)
// or records a Paystack reference (Paystack path).
// Returns { wa_url } — client redirects to WhatsApp DM.
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    full_name?: string;
    email?: string;
    phone?: string;
    bank_account_name?: string;
    password?: string;
    payment_method?: "bank_transfer" | "paystack";
    paystack_reference?: string | null;
  };

  const {
    full_name,
    email,
    phone,
    bank_account_name,
    password,
    payment_method = "bank_transfer",
    paystack_reference = null,
  } = body;

  if (!full_name || !email || !phone || !bank_account_name || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const db = createAdminClient();
  const emailNorm = email.toLowerCase().trim();
  // Normalise the phone once and use the normalised form for every write
  // (workspaces.whatsapp_number, challenge_signups.phone, crm_contacts.whatsapp_number).
  // Keeps every downstream lookup — inbound WhatsApp handler, automation
  // sendWhatsapp recipient resolver — pointing at the same row.
  const phoneNorm = normalisePhoneNG(phone) ?? phone;

  // Independent of the auth/workspace chain below — kick it off now so it
  // resolves in parallel instead of adding its own round trip later.
  const pricePromise = db.from("admin_settings").select("value").eq("key", "funnel_challenge_price").maybeSingle();

  // ── Check for duplicate signup (same email, still pending/confirmed) ──────
  const { data: existing } = await db
    .from("challenge_signups")
    .select("id, status")
    .eq("email", emailNorm)
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  if (existing?.status === "confirmed") {
    return NextResponse.json(
      { error: "This email is already enrolled in the challenge. Check your inbox for login details." },
      { status: 409 },
    );
  }

  // ── Create auth account or verify existing user ───────────────────────────
  let userId: string;

  const { data: signUpData, error: signUpError } = await db.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), phone },
  });

  if (signUpError) {
    if (!signUpError.message?.toLowerCase().includes("already registered") &&
        !signUpError.message?.toLowerCase().includes("already been registered")) {
      return NextResponse.json({ error: signUpError.message }, { status: 500 });
    }

    // User already exists — verify the password they supplied is correct
    const anonClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: emailNorm,
      password,
    });

    if (signInError || !signInData.user) {
      return NextResponse.json(
        { error: "An account already exists with this email but the password is incorrect. Please use the correct password, or use a different email address." },
        { status: 401 },
      );
    }

    userId = signInData.user.id;

    // Make sure their workspace exists (it might not if they only used /join before)
    const { data: existingWs } = await db
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!existingWs) {
      const slug = `${full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36)}`;
      const { error: wsEnsureError } = await db.from("workspaces").insert({
        name: full_name.trim(),
        slug,
        owner_id: userId,
        plan_id: "free",
        plan_status: "active",
        billing_email: emailNorm,
        whatsapp_number: phoneNorm,
      });
      if (wsEnsureError) console.error("[challenge/signup] workspace ensure error:", wsEnsureError.message);
    }
  } else {
    userId = signUpData.user.id;

    // Create workspace for brand-new user (select the inserted row directly —
    // avoids a redundant round trip to re-fetch it by owner_id).
    const slug = `${full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36)}`;
    const { data: newWs, error: wsError } = await db.from("workspaces").insert({
      name:            full_name.trim(),
      slug,
      owner_id:        userId,
      plan_id:         "free",
      plan_status:     "active",
      billing_email:   emailNorm,
      whatsapp_number: phone,
    }).select("id").single();
    if (wsError) console.error("[challenge/signup] workspace create error:", wsError.message);

    if (newWs) {
      const { error: memberError } = await db.from("workspace_members").insert({ workspace_id: newWs.id, user_id: userId, role: "owner" });
      if (memberError) console.error("[challenge/signup] workspace_member error:", memberError.message);
    }
  }

  // ── Verify Paystack payment server-side ──────────────────────────────────
  // Read challenge price from admin_settings; fall back to ₦10,000
  const { data: priceRow } = await pricePromise;
  const amountNgn = typeof priceRow?.value === "number" ? priceRow.value : 10_000;

  let paymentConfirmed = false;
  if (payment_method === "paystack" && paystack_reference) {
    paymentConfirmed = await verifyPaystackPayment(paystack_reference, amountNgn * 100);
    if (!paymentConfirmed) {
      return NextResponse.json(
        { error: "We could not verify your Paystack payment. Please contact support if you were charged." },
        { status: 402 },
      );
    }
  }

  // ── Record the signup ─────────────────────────────────────────────────────
  if (existing?.status === "pending") {
    const { error: updErr } = await db.from("challenge_signups").update({
      full_name:          full_name.trim(),
      phone:              phoneNorm,
      bank_account_name,
      payment_method,
      paystack_reference: paystack_reference ?? null,
      user_id:            userId,
      status:             paymentConfirmed ? "confirmed" : "pending",
      updated_at:         new Date().toISOString(),
    }).eq("id", existing.id);

    if (updErr) {
      console.error("[challenge/signup] update error:", updErr.message);
      return NextResponse.json({ error: "Failed to update your signup record. Please try again." }, { status: 500 });
    }
  } else {
    const { error: insErr } = await db.from("challenge_signups").insert({
      full_name:          full_name.trim(),
      email:              emailNorm,
      phone:              phoneNorm,
      bank_account_name,
      payment_method,
      paystack_reference: paystack_reference ?? null,
      user_id:            userId,
      status:             paymentConfirmed ? "confirmed" : "pending",
    });

    if (insErr) {
      console.error("[challenge/signup] insert error:", insErr.message);
      return NextResponse.json({ error: "Failed to save your signup. Please try again." }, { status: 500 });
    }
  }

  // ── Build WhatsApp redirect URL (via our /whatsapp_send/ proxy) ───────────
  const waText = encodeURIComponent(
    `Hi, my name is ${full_name.trim()}. I just paid ₦10,000 to join the 7-Day Job/Client Acquisition Challenge. Please confirm a payment from *${bank_account_name}* and grant me access. My email: ${emailNorm}`,
  );
  const wa_url     = `${APP_URL}/whatsapp_send/?phone=${WA_COMMUNITY_MANAGER}&text=${waText}&type=phone_number&app_absent=0`;
  // Direct wa.me link for the email button (avoids server-proxy roundtrip in email clients)
  const waEmailUrl = `https://wa.me/${WA_COMMUNITY_MANAGER}?text=${waText}`;

  // ── Send registration received email ─────────────────────────────────────
  if (RESEND_API_KEY) {
    const firstName = full_name.trim().split(" ")[0];
    const loginUrl  = `${APP_URL}/login`;

    fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    `Leadash Academy <${RESEND_FROM}>`,
        to:      [emailNorm],
        subject: "You're in! Join the WhatsApp group to get started 🎉",
        html: `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#374151">
  <div style="background:#111827;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff">Leadash Academy</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:36px 32px">
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827">You're registered, ${firstName}! 🎉</h2>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin-bottom:20px">
      We received your signup for the <strong>7-Day Job &amp; Client Acquisition Challenge</strong>.
      Your payment is being confirmed — here's what to do next.
    </p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 20px;margin-bottom:24px">
      <p style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 10px">Next steps:</p>
      <ol style="font-size:13px;color:#78350f;line-height:1.8;margin:0;padding-left:18px">
        <li>Join the WhatsApp group using the button below</li>
        <li>Your payment will be confirmed within 2 hours</li>
        <li>Challenge starts next Monday at 9PM WAT</li>
      </ol>
    </div>
    <p style="text-align:center;margin:0 0 24px">
      <a href="${APP_URL}/go/7-days-challenge"
         style="display:inline-block;background:#25d366;color:#fff;padding:13px 28px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">
        💬 Join WhatsApp Group
      </a>
    </p>
    <p style="font-size:14px;color:#374151;margin-bottom:6px">Your login details:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:13px;color:#374151;margin-bottom:24px">
      <strong>Email:</strong> ${emailNorm}<br />
      <strong>Password:</strong> the one you set during signup<br />
      <strong>Login:</strong> <a href="${loginUrl}" style="color:#f97316">${loginUrl}</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
      If you didn't sign up, you can safely ignore this email. Questions? Reply here.
    </p>
  </div>
</div>`,
      }),
    }).catch(e => console.error("[challenge/signup] email error:", e));
  }

  // Admin notification — fire and forget
  const adminEmail = process.env.CRM_SUPPORT_EMAIL;
  if (RESEND_API_KEY && adminEmail) {
    fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    `Leadash Academy <${RESEND_FROM}>`,
        to:      [adminEmail],
        subject: `New challenge signup: ${full_name.trim()}`,
        html:    `<p><strong>${full_name.trim()}</strong> just signed up for the challenge.</p><ul><li>Email: ${emailNorm}</li><li>Phone: ${phone}</li><li>Bank name: ${bank_account_name}</li></ul><p><a href="${APP_URL}/admin/crm">View in CRM →</a></p>`,
      }),
    }).catch(e => console.error("[challenge/signup] admin notify error:", e));
  }

  // ── CRM contact upsert + automation trigger ─────────────────────────────
  // The challenge form is the closest thing we have to a funnel opt-in, so
  // we treat it as one for CRM purposes:
  //   1. Upsert crm_contacts on email so the same person signing up twice
  //      (bank_transfer → paystack retry, or after a form fix) resolves to
  //      one row.
  //   2. Fire funnel.form_submitted so the "[Challenge 7-day] Form → CRM
  //      lead" seeded automation applies the tag + lifecycle stage.
  // Both are best-effort — a failure here must not block the user's signup.
  let crmContactId: string | null = null;
  try {
    const { data: existingContact } = await db
      .from("crm_contacts")
      .select("id")
      .eq("email", emailNorm)
      .maybeSingle();

    if (existingContact?.id) {
      crmContactId = existingContact.id as string;
      await db.from("crm_contacts").update({
        display_name:    full_name.trim(),
        whatsapp_number: phoneNorm,
        updated_at:      new Date().toISOString(),
      }).eq("id", crmContactId);
    } else {
      const { data: newContact } = await db.from("crm_contacts").insert({
        email:           emailNorm,
        display_name:    full_name.trim(),
        whatsapp_number: phoneNorm,
        user_id:         userId,
        status:          "active",
      }).select("id").single();
      crmContactId = (newContact?.id as string) ?? null;
    }
  } catch (e) {
    console.error("[challenge/signup] crm upsert error:", e);
  }

  await enqueueAutomation({
    event:        "funnel.form_submitted",
    workspace_id: null,
    user_id:      userId,
    payload: {
      funnel_slug:  "challenge-7day",
      page_slug:    "main",
      page_id:      null,
      contact_id:   crmContactId,
      name:         full_name.trim(),
      email:        emailNorm,
      phone:        phoneNorm,
      payment_method,
      form_data:    { full_name: full_name.trim(), email: emailNorm, phone: phoneNorm, bank_account_name, payment_method },
    },
  }).catch(err => console.error("[challenge/signup] automation enqueue error:", err));

  return NextResponse.json({
    ok:           true,
    wa_url,
    redirect_url: `${APP_URL}/challenge/pending?email=${encodeURIComponent(emailNorm)}`,
  });
}
