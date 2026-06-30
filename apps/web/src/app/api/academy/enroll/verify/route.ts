import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { enqueueAutomation } from "@/lib/queue/client";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId } = auth;

  let body: { reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reference } = body;
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const { data: existing } = await db
    .from("academy_enrollments")
    .select("id, credits_granted, product_id")
    .eq("paystack_reference", reference)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (existing) return NextResponse.json({ status: "already_enrolled", enrollment_id: existing.id });

  const { paid, metadata } = await verifyPaystackPayment(reference);
  if (!paid) return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });

  const productId  = metadata.product_id  as string | undefined;
  const cohortId   = metadata.cohort_id   as string | undefined;
  const userId     = metadata.user_id     as string | undefined;
  const phone      = metadata.phone       as string | undefined;
  const amountKobo = metadata.amount_kobo as number | undefined;

  if (!productId || !userId) return NextResponse.json({ error: "Invalid payment metadata" }, { status: 400 });

  const { data: product } = await db
    .from("academy_products")
    .select("credits_grant, leadash_months, name")
    .eq("id", productId)
    .single();

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const leadashAccessEndsAt = product.leadash_months
    ? new Date(Date.now() + product.leadash_months * 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: enrollment, error: enrollErr } = await db
    .from("academy_enrollments")
    .insert({
      user_id:               userId,
      workspace_id:          workspaceId,
      product_id:            productId,
      cohort_id:             cohortId ?? null,
      status:                "active",
      paystack_reference:    reference,
      amount_kobo:           amountKobo ?? null,
      phone:                 phone ?? null,
      credits_granted:       false,
      leadash_access_ends_at: leadashAccessEndsAt,
    })
    .select("id")
    .single();

  if (enrollErr) {
    if (enrollErr.code === "23505") {
      const { data: dupe } = await db.from("academy_enrollments").select("id").eq("paystack_reference", reference).maybeSingle();
      return NextResponse.json({ status: "already_enrolled", enrollment_id: dupe?.id });
    }
    return NextResponse.json({ error: enrollErr.message }, { status: 500 });
  }

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
          paystack_reference: reference,
        }),
        db.from("academy_enrollments").update({ credits_granted: true }).eq("id", enrollment.id),
      ]);
    }
  }

  await db.from("billing_invoices").insert({
    workspace_id:       workspaceId,
    type:               "academy_enrollment",
    description:        `Academy — ${product.name}`,
    amount_kobo:        amountKobo ?? 0,
    paystack_reference: reference,
    status:             "paid",
  }).throwOnError().then(() => {}).catch(() => {});

  enqueueAutomation({
    event:        "academy.enrollment_created",
    workspace_id: workspaceId,
    user_id:      userId ?? null,
    payload:      { product_id: productId, enrollment_id: enrollment.id, access_type: "paid" },
  }).catch(() => {});

  return NextResponse.json({ status: "enrolled", enrollment_id: enrollment.id });
}
