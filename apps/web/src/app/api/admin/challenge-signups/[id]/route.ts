import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";
import { normalisePhoneNG } from "@/lib/phone";
import { applyChallengeConfirmation } from "@/lib/challenge/confirm";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

/** The "you're in" access email — sent on confirm and re-sendable from admin. */
async function sendChallengeAccessEmail(signup: { email: string | null; full_name: string | null }, cohortWhen: string | null): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "academy@leadash.com";
  if (!resendKey || !signup.email) return false;
  const groupLink = "https://leadash.com/go/7-days-challenge";
  const dashboardLink = "https://leadash.com/academy";
  const first = (signup.full_name ?? "there").split(" ")[0];
  const cohortLine = cohortWhen
    ? `Your cohort goes live <strong>${cohortWhen}</strong> — that's when Day 1 unlocks. See you there!`
    : `We'll let you know the moment your cohort's start date is set — that's when Day 1 unlocks.`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Leadash Academy <${fromEmail}>`,
        to: [signup.email],
        subject: "Payment confirmed 🎉 — you're in the 7-Day Challenge",
        html: `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#374151">
  <img src="https://leadash.com/Logo_Icon_Colored.svg" alt="Leadash" style="width:32px;height:32px;margin-bottom:24px" />
  <h1 style="font-size:24px;font-weight:800;color:#111827;margin-bottom:8px">You're confirmed, ${first}! 🎉</h1>
  <p style="font-size:15px;line-height:1.7;margin-bottom:20px">Your payment has been verified and your spot in the <strong>7-Day Job &amp; Client Acquisition Challenge</strong> is secured. Here's everything you need:</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px">
    <p style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:12px">What to do next:</p>
    <ol style="font-size:14px;color:#78350f;line-height:1.8;margin:0;padding-left:20px">
      <li>Join the WhatsApp group (if you haven't already) so you don't miss the kickoff</li>
      <li>Log in to your Leadash Academy dashboard</li>
      <li>${cohortLine}</li>
    </ol>
  </div>
  <a href="${groupLink}" style="display:inline-block;background:#25d366;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;text-decoration:none;margin-bottom:12px">💬 Join the WhatsApp Group</a>
  <br />
  <a href="${dashboardLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px">Open Your Academy Dashboard →</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px">You're receiving this because you enrolled in the Leadash 7-Day Challenge. Questions? Reply to this email.</p>
</div>`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[challenge-signups] access email error:", e);
    return false;
  }
}

/** Format the signup's enrolled-cohort go-live in WAT, or null. */
async function cohortWhenForSignup(db: ReturnType<typeof createAdminClient>, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const { data: enr } = await db
    .from("academy_enrollments")
    .select("cohort_id")
    .eq("workspace_id", workspaceId)
    .not("cohort_id", "is", null)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enr?.cohort_id) return null;
  const { data: co } = await db.from("academy_cohorts").select("starts_at").eq("id", enr.cohort_id).maybeSingle();
  if (!co?.starts_at) return null;
  return new Date(co.starts_at as string).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos",
  }) + " WAT";
}

// PATCH /api/admin/challenge-signups/[id]
// actions: confirm | reject | add_note
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = auth;
  const { id } = await params;

  const body = await req.json() as {
    action: "confirm" | "reject" | "add_note" | "resend_email";
    rejection_reason?: string;
    note?: string;
  };

  const { data: signup } = await db
    .from("challenge_signups")
    .select("*")
    .eq("id", id)
    .single();

  if (!signup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "confirm") {
    if (signup.status === "confirmed") {
      return NextResponse.json({ error: "Already confirmed" }, { status: 400 });
    }

    // Enroll into the current cohort + set up the dormant-until-go-live
    // sponsored offer (shared with the Paystack auto-confirm path).
    const confirmResult = await applyChallengeConfirmation(db, {
      signup: { user_id: signup.user_id as string | null, workspace_id: signup.workspace_id as string | null },
      createdBy: userId,
      productSlug: "challenge-7day",
    });
    // Exact cohort go-live in WAT for the confirmation email (e.g. "Monday, July 20 at 9:00 PM WAT").
    const cohortWhen = confirmResult.cohortStartsAt
      ? new Date(confirmResult.cohortStartsAt).toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos",
        }) + " WAT"
      : null;

    await db.from("challenge_signups").update({
      status:       "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: userId,
      updated_at:   new Date().toISOString(),
    }).eq("id", id);

    // ── Fire enrollment automation ───────────────────────────────────────
    // Runs on every confirm — including signups that never became workspaces,
    // which is the typical "form filler" case. The payload includes contact_id
    // and a normalised phone so the sendWhatsapp step in the flow can look up
    // the CRM recipient directly (falling back on the crm_contacts row we
    // created via /api/funnels/submit).
    const normalisedPhone = normalisePhoneNG(signup.phone as string | null);
    let signupContactId: string | null = null;
    if (signup.email) {
      const { data: c } = await db.from("crm_contacts")
        .select("id").eq("email", signup.email).maybeSingle();
      signupContactId = (c?.id as string) ?? null;
    }
    if (!signupContactId && normalisedPhone) {
      const { data: c } = await db.from("crm_contacts")
        .select("id").eq("whatsapp_number", normalisedPhone).maybeSingle();
      signupContactId = (c?.id as string) ?? null;
    }

    try {
      await enqueueAutomation({
        event:        "academy.enrollment_created",
        workspace_id: (signup.workspace_id as string | null) ?? null,
        user_id:      (signup.user_id as string | null) ?? null,
        payload: {
          product_slug:   "challenge-7day",
          product_name:   "7-Day Job & Client Acquisition Challenge",
          full_name:      signup.full_name,
          email:          signup.email,
          phone:          normalisedPhone,
          contact_id:     signupContactId,
          payment_method: signup.payment_method,
        },
      });
    } catch (e) {
      console.error("[challenge-signups/confirm] automation error:", e);
    }

    // Send enrollment confirmation / access email
    await sendChallengeAccessEmail(
      { email: signup.email as string | null, full_name: signup.full_name as string | null },
      cohortWhen,
    );

    console.log(`[admin] challenge signup confirmed: ${signup.email} by admin ${userId}`);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resend_email") {
    if (!signup.email) return NextResponse.json({ error: "No email on file" }, { status: 400 });
    const cohortWhen = await cohortWhenForSignup(db, signup.workspace_id as string | null);
    const sent = await sendChallengeAccessEmail(
      { email: signup.email as string | null, full_name: signup.full_name as string | null },
      cohortWhen,
    );
    if (!sent) return NextResponse.json({ error: "Email failed to send (check RESEND config)" }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    await db.from("challenge_signups").update({
      status:           "rejected",
      rejection_reason: body.rejection_reason ?? null,
      confirmed_by:     userId,
      updated_at:       new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_note") {
    await db.from("challenge_signups").update({
      notes:      body.note ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
