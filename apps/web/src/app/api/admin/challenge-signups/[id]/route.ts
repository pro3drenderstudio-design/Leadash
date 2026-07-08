import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// PATCH /api/admin/challenge-signups/[id]
// actions: confirm | reject | add_note
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = auth;
  const { id } = await params;

  const body = await req.json() as {
    action: "confirm" | "reject" | "add_note";
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

    // Enroll in 7-day challenge
    if (signup.workspace_id || signup.user_id) {
      const workspaceId = signup.workspace_id as string | null ?? signup.user_id as string;

      // Find the challenge-7day product
      const { data: product } = await db
        .from("academy_products")
        .select("id")
        .eq("slug", "challenge-7day")
        .single();

      if (product) {
        // Find or create active cohort
        const { data: cohort } = await db
          .from("academy_cohorts")
          .select("id")
          .eq("product_id", product.id)
          .eq("is_default", true)
          .maybeSingle();

        const { error: enrollError } = await db.from("academy_enrollments").upsert({
          workspace_id: workspaceId,
          product_id:   product.id,
          cohort_id:    cohort?.id ?? null,
          access_type:  "admin_granted",
          status:       "active",
          enrolled_at:  new Date().toISOString(),
        }, { onConflict: "workspace_id,product_id" });

        if (enrollError) console.error("[challenge-signups/confirm] enroll error:", enrollError.message);

        // Fire enrollment automation
        try {
          await enqueueAutomation({
            event:        "academy.enrollment_created",
            workspace_id: workspaceId,
            user_id:      signup.user_id ?? null,
            payload: {
              product_slug:  "challenge-7day",
              product_name:  "7-Day Job & Client Acquisition Challenge",
              full_name:     signup.full_name,
              email:         signup.email,
              phone:         signup.phone,
              payment_method: signup.payment_method,
            },
          });
        } catch (e) {
          console.error("[challenge-signups/confirm] automation error:", e);
        }
      }
    }

    await db.from("challenge_signups").update({
      status:       "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: userId,
      updated_at:   new Date().toISOString(),
    }).eq("id", id);

    // Send enrollment confirmation email
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "academy@leadash.com";
    if (resendKey && signup.email) {
      const waLink = `https://wa.me/2349110260332?text=${encodeURIComponent(`Hi! I just got confirmed for the 7-Day Challenge. My name is ${signup.full_name}.`)}`;
      const loginLink = "https://leadash.com/login";
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Leadash Academy <${fromEmail}>`,
          to: [signup.email as string],
          subject: "You're in! 🎉 7-Day Challenge starts now",
          html: `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#374151">
  <img src="https://leadash.com/Logo_Icon_Colored.svg" alt="Leadash" style="width:32px;height:32px;margin-bottom:24px" />
  <h1 style="font-size:24px;font-weight:800;color:#111827;margin-bottom:8px">You're confirmed, ${(signup.full_name as string).split(" ")[0]}! 🎉</h1>
  <p style="font-size:15px;line-height:1.7;margin-bottom:20px">Your spot in the <strong>7-Day Job & Client Acquisition Challenge</strong> has been confirmed. Here's everything you need to know:</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px">
    <p style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:12px">Next steps:</p>
    <ol style="font-size:14px;color:#78350f;line-height:1.8;margin:0;padding-left:20px">
      <li>Message us on WhatsApp so we can add you to the private group</li>
      <li>Log in to your Leadash account to access your dashboard</li>
      <li>Day 1 lesson drops tomorrow morning at 8am WAT</li>
    </ol>
  </div>
  <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;text-decoration:none;margin-bottom:12px">💬 Join the WhatsApp Group</a>
  <br />
  <a href="${loginLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px">Access Your Dashboard →</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px">You're receiving this because you enrolled in the Leadash 7-Day Challenge. Questions? Reply to this email.</p>
</div>`,
        }),
      }).catch(e => console.error("[challenge-signups/confirm] email error:", e));
    }

    console.log(`[admin] challenge signup confirmed: ${signup.email} by admin ${userId}`);
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
