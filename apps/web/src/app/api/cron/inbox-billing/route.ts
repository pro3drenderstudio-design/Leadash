/**
 * POST /api/cron/inbox-billing
 *
 * Daily cron — charges Paystack authorization codes for active inbox domains
 * whose billing date has passed. Runs at 02:00 UTC every day.
 *
 * Skips domains that are paused, failed, or not yet due.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { chargePaystackAuthorization } from "@/lib/billing/paystack";
import { sendInboxPaymentSuccess, sendInboxPaymentFailed, sendInboxFinalWarningEmail, sendInboxSuspendedEmail, sendVendorCancellationAlert } from "@/lib/email/notifications";

export async function POST(req: NextRequest) {
  // Allow Vercel cron (no Authorization header) or manual calls with the cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  const { data: domains, error } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, inbox_provider, paystack_auth_code, paystack_billing_email, paystack_inbox_monthly_kobo, charge_failure_count")
    .eq("status", "active")
    .eq("payment_provider", "paystack")
    .not("paystack_auth_code",          "is", null)
    .not("paystack_inbox_monthly_kobo", "is", null)
    .not("paystack_billing_email",      "is", null)
    .lte("inbox_next_billing_date", now);

  if (error) {
    console.error("[inbox-billing] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ domain: string; status: string; reference?: string; error?: string }> = [];

  for (const domain of domains ?? []) {
    try {
      const { reference, status } = await chargePaystackAuthorization({
        authorizationCode: domain.paystack_auth_code as string,
        email:             domain.paystack_billing_email as string,
        amountKobo:        domain.paystack_inbox_monthly_kobo as number,
        metadata:          { domain_id: domain.id, workspace_id: domain.workspace_id, type: "inbox_renewal" },
      });

      if (status !== "success") {
        throw new Error(`Charge returned status: ${status}`);
      }

      const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("outreach_domains")
        .update({ inbox_next_billing_date: nextBillingDate, charge_failure_count: 0 })
        .eq("id", domain.id);

      // Record invoice for revenue tracking (upsert — webhook may also record it)
      await db.from("billing_invoices").upsert({
        workspace_id:       domain.workspace_id,
        type:               "inbox_billing",
        description:        `Inbox domain — ${domain.domain}`,
        amount_kobo:        domain.paystack_inbox_monthly_kobo as number,
        paystack_reference: reference,
        status:             "paid",
      }, { onConflict: "paystack_reference", ignoreDuplicates: true });

      // Notify user of successful charge
      const amountNgn = Math.round((domain.paystack_inbox_monthly_kobo as number) / 100);
      sendInboxPaymentSuccess({
        userEmail: domain.paystack_billing_email as string,
        domain: domain.domain,
        amountNgn,
        nextBillingDate,
      }).catch(e => console.error("[inbox-billing] success email failed:", e));

      results.push({ domain: domain.domain, status, reference });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[inbox-billing] charge failed for ${domain.domain}:`, msg);

      const amountNgn = Math.round((domain.paystack_inbox_monthly_kobo as number) / 100);

      // Increment failure count and pick the right notification
      const newFailureCount = ((domain.charge_failure_count as number | null) ?? 0) + 1;
      if (newFailureCount >= 3) {
        await db.from("outreach_domains").update({
          charge_failure_count: newFailureCount,
          status:               "payment_failed",
          payment_suspended_at: now,
          error_message:        "Suspended after 3 failed payment attempts",
        }).eq("id", domain.id);
        sendInboxSuspendedEmail({
          userEmail: domain.paystack_billing_email as string,
          domain:    domain.domain,
          amountNgn,
        }).catch(e => console.error("[inbox-billing] suspension email failed:", e));

        // Notify vendor if this is a Microsoft 365 domain
        if ((domain as Record<string, unknown>).inbox_provider === "microsoft365") {
          const { data: m365Inboxes } = await db.from("outreach_inboxes")
            .select("email_address, vendor_cancelled_at")
            .eq("domain_id", domain.id);
          const emails = (m365Inboxes ?? []).map((i: { email_address: string }) => i.email_address);
          if (emails.length > 0) {
            await db.from("outreach_inboxes").update({ vendor_cancelled_at: now })
              .eq("domain_id", domain.id).is("vendor_cancelled_at", null);
            sendVendorCancellationAlert({
              domain:      domain.domain,
              inboxEmails: emails,
              reason:      "Payment failed after 3 attempts — subscription suspended",
            }).catch(e => console.error("[inbox-billing] vendor cancellation email failed:", e));
          }
        }
      } else if (newFailureCount === 2) {
        // Final warning — one more failure will suspend the domain
        await db.from("outreach_domains").update({ charge_failure_count: newFailureCount }).eq("id", domain.id);
        sendInboxFinalWarningEmail({
          userEmail: domain.paystack_billing_email as string,
          domain:    domain.domain,
          amountNgn,
        }).catch(e => console.error("[inbox-billing] final warning email failed:", e));
      } else {
        // First failure — generic payment failed notice
        await db.from("outreach_domains").update({ charge_failure_count: newFailureCount }).eq("id", domain.id);
        sendInboxPaymentFailed({
          userEmail:    domain.paystack_billing_email as string,
          domain:       domain.domain,
          amountNgn,
          errorMessage: msg,
        }).catch(e => console.error("[inbox-billing] failure email failed:", e));
      }

      results.push({ domain: domain.domain, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ charged: results.length, results });
}

// Vercel crons call GET — delegate to the same handler
export const GET = POST;
