import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { chargePaystackAuthorization } from "@/lib/billing/paystack";
import { sendInboxPaymentSuccess } from "@/lib/email/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: domain } = await db
    .from("outreach_domains")
    .select("id, domain, status, inbox_provider, paystack_auth_code, paystack_billing_email, paystack_inbox_monthly_kobo")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (domain.status !== "payment_failed") {
    return NextResponse.json({ error: "Domain is not in a failed payment state" }, { status: 400 });
  }
  if (!domain.paystack_auth_code || !domain.paystack_billing_email || !domain.paystack_inbox_monthly_kobo) {
    return NextResponse.json({ error: "Payment details not configured for this domain" }, { status: 400 });
  }

  try {
    const { reference, status } = await chargePaystackAuthorization({
      authorizationCode: domain.paystack_auth_code as string,
      email:             domain.paystack_billing_email as string,
      amountKobo:        domain.paystack_inbox_monthly_kobo as number,
      metadata:          { domain_id: domain.id, workspace_id: workspaceId, type: "inbox_renewal_retry" },
    });

    if (status !== "success") {
      return NextResponse.json({ error: `Payment returned status: ${status}. Card may have insufficient funds.` }, { status: 402 });
    }

    const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("outreach_domains").update({
      status:                  "active",
      charge_failure_count:    0,
      payment_suspended_at:    null,
      error_message:           null,
      inbox_next_billing_date: nextBillingDate,
    }).eq("id", domain.id);

    // Record invoice for revenue tracking
    await db.from("billing_invoices").upsert({
      workspace_id:       workspaceId,
      type:               "inbox_billing",
      description:        `Inbox domain — ${domain.domain} (retry)`,
      amount_kobo:        domain.paystack_inbox_monthly_kobo as number,
      paystack_reference: reference,
      status:             "paid",
    }, { onConflict: "paystack_reference", ignoreDuplicates: true });

    // For Microsoft 365 domains, clear vendor_cancelled_at so the vendor portal
    // stops treating them as cancelled and the inboxes can be re-enabled
    if ((domain as Record<string, unknown>).inbox_provider === "microsoft365") {
      await db.from("outreach_inboxes")
        .update({ vendor_cancelled_at: null })
        .eq("domain_id", domain.id)
        .not("vendor_cancelled_at", "is", null);
    }

    const amountNgn = Math.round((domain.paystack_inbox_monthly_kobo as number) / 100);
    sendInboxPaymentSuccess({
      userEmail:       domain.paystack_billing_email as string,
      domain:          domain.domain,
      amountNgn,
      nextBillingDate,
    }).catch(e => console.error("[retry-payment] success email failed:", e));

    return NextResponse.json({ ok: true, reference, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[retry-payment] charge failed domain=${id}:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
