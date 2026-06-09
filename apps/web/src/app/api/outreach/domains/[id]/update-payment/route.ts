import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { sendInboxReactivatedEmail } from "@/lib/email/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { reference } = await req.json() as { reference: string };
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const { data: domain } = await db
    .from("outreach_domains")
    .select("id, domain, status, payment_provider, paystack_billing_email, paystack_inbox_monthly_kobo, inbox_next_billing_date")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (domain.payment_provider !== "paystack") {
    return NextResponse.json({ error: "Domain is not on Paystack billing" }, { status: 400 });
  }

  let authorizationCode: string | null = null;
  let billingEmail = domain.paystack_billing_email as string | null;

  try {
    const result = await verifyPaystackPayment(reference);
    if (!result.paid) {
      return NextResponse.json({ error: "Payment was not successful" }, { status: 402 });
    }
    authorizationCode = result.authorizationCode;
    // Always use the email Paystack tied to this auth code
    if (result.customerEmail) billingEmail = result.customerEmail;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[update-payment] verify failed domain=${id}:`, msg);
    return NextResponse.json({ error: `Payment verification failed: ${msg}` }, { status: 502 });
  }

  const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.from("outreach_domains").update({
    status:                  "active",
    charge_failure_count:    0,
    payment_suspended_at:    null,
    error_message:           null,
    inbox_next_billing_date: nextBillingDate,
    ...(authorizationCode ? { paystack_auth_code: authorizationCode } : {}),
    ...(billingEmail      ? { paystack_billing_email: billingEmail }  : {}),
  }).eq("id", id);

  // Record invoice
  await db.from("billing_invoices").insert({
    workspace_id:       workspaceId,
    type:               "inbox_billing",
    description:        `Inbox domain — ${domain.domain} (card update)`,
    amount_kobo:        domain.paystack_inbox_monthly_kobo as number,
    paystack_reference: reference,
    status:             "paid",
  });

  // Reactivate inboxes that were suspended and resume warmup
  await db.from("outreach_inboxes")
    .update({ status: "active", last_error: null, warmup_enabled: true })
    .eq("domain_id", id)
    .eq("status", "error");

  // Count inboxes for email
  const { count: inboxCount } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", id);

  const emailTo = (billingEmail as string | null) ?? `workspace-${workspaceId}@leadash.com`;
  const amountNgn = Math.round((domain.paystack_inbox_monthly_kobo as number) / 100);

  sendInboxReactivatedEmail({
    userEmail:       emailTo,
    domain:          domain.domain,
    inboxCount:      inboxCount ?? 1,
    amountNgn,
    nextBillingDate,
  }).catch(e => console.error("[update-payment] reactivated email failed:", e));

  return NextResponse.json({ ok: true, nextBillingDate });
}
