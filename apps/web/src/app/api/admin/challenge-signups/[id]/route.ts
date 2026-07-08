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
