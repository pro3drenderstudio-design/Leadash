import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { enqueueAutomation } from "@/lib/queue/client";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId, userId } = auth;

  let body: {
    product_id?: string; cohort_id?: string; phone?: string;
    whatsapp_opted_in?: boolean; discount_code_id?: string; callback_url?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, cohort_id, phone, whatsapp_opted_in, discount_code_id, callback_url } = body;
  if (!product_id)  return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { data: product } = await db
    .from("academy_products").select("*").eq("id", product_id).eq("is_active", true).single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data: existing } = await db
    .from("academy_enrollments").select("id").eq("user_id", userId).eq("product_id", product_id).maybeSingle();
  if (existing) return NextResponse.json({ error: "Already enrolled" }, { status: 409 });

  // Apply discount if code_id provided
  let finalPriceNgn = product.price_ngn;
  if (discount_code_id) {
    const { data: dc } = await db.from("academy_discount_codes").select("*").eq("id", discount_code_id).eq("is_active", true).single();
    if (dc && (!dc.product_id || dc.product_id === product_id)) {
      if (!dc.max_uses || dc.uses_count < dc.max_uses) {
        if (!dc.expires_at || new Date(dc.expires_at) > new Date()) {
          const discount = dc.discount_type === "percent"
            ? Math.round(product.price_ngn * dc.discount_value / 100)
            : dc.discount_value;
          finalPriceNgn = Math.max(0, product.price_ngn - discount);
        }
      }
    }
  }

  // Free enrollment (price is 0, or a discount code brought it to 0) — there's no
  // payment to collect, so enroll immediately instead of routing through Paystack
  // (which rejects zero-amount transactions).
  if (finalPriceNgn === 0) {
    const leadashAccessEndsAt = product.leadash_months
      ? new Date(Date.now() + product.leadash_months * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: enrollment, error: enrollErr } = await db
      .from("academy_enrollments")
      .insert({
        user_id:               userId,
        workspace_id:          workspaceId,
        product_id,
        cohort_id:             cohort_id ?? null,
        status:                "active",
        phone:                 phone ?? null,
        whatsapp_opted_in:     whatsapp_opted_in ?? false,
        discount_code_id:      discount_code_id ?? null,
        credits_granted:       false,
        leadash_access_ends_at: leadashAccessEndsAt,
      })
      .select("id")
      .single();
    if (enrollErr) return NextResponse.json({ error: enrollErr.message }, { status: 500 });

    if (product.credits_grant > 0) {
      const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
      if (ws) {
        await Promise.all([
          db.from("workspaces").update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + product.credits_grant }).eq("id", workspaceId),
          db.from("lead_credit_transactions").insert({
            workspace_id: workspaceId,
            type:         "grant",
            amount:       product.credits_grant,
            description:  `Academy enrollment — ${product.name}`,
          }),
          db.from("academy_enrollments").update({ credits_granted: true }).eq("id", enrollment.id),
        ]);
      }
    }

    enqueueAutomation({
      event:        "academy.enrollment_created",
      workspace_id: workspaceId,
      user_id:      userId,
      payload:      { product_id, enrollment_id: enrollment.id, access_type: "free" },
    }).catch(() => {});

    return NextResponse.json({ enrolled: true, enrollment_id: enrollment.id });
  }

  if (!callback_url) return NextResponse.json({ error: "callback_url required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { authorizationUrl, reference } = await createPaystackCheckout({
    email,
    amountKobo: finalPriceNgn * 100,
    callbackUrl: callback_url,
    metadata: {
      type:              "academy_enrollment",
      workspace_id:      workspaceId,
      user_id:           userId,
      product_id,
      original_amount_ngn: product.price_ngn,
      ...(cohort_id       ? { cohort_id }       : {}),
      ...(phone           ? { phone }            : {}),
      ...(whatsapp_opted_in !== undefined ? { whatsapp_opted_in } : {}),
      ...(discount_code_id ? { discount_code_id } : {}),
    },
  });

  return NextResponse.json({ url: authorizationUrl, reference });
}
