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

export const maxDuration = 60;

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

  // Load workspace entitlements — workspaces with active inbox_credit entitlements have
  // their inbox hosting included in their offer; we skip charging and advance the date.
  // Credits are NOT deducted — the entitlement covers hosting for its full lifetime
  // (expires_at). Renewals refresh the entitlement via the offer-renewals cron.
  const workspaceIds = [...new Set((domains ?? []).map((d: Record<string, unknown>) => d.workspace_id as string).filter(Boolean))];
  const { data: entitlements } = workspaceIds.length > 0
    ? await db.from("workspace_entitlements")
        .select("workspace_id, quantity")
        .in("workspace_id", workspaceIds)
        .eq("entitlement_type", "inbox_credit")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
    : { data: [] };

  // Map of workspace_id → total covered inbox slots
  const coveredByWs = new Map<string, number>();
  for (const e of entitlements ?? []) {
    const wsId = e.workspace_id as string;
    coveredByWs.set(wsId, (coveredByWs.get(wsId) ?? 0) + (e.quantity as number));
  }

  for (const domain of domains ?? []) {
    // Offer subscribers: inbox hosting is included — skip charging, just advance date
    const coveredSlots = coveredByWs.get(domain.workspace_id as string) ?? 0;
    if (coveredSlots > 0) {
      const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.from("outreach_domains")
        .update({ inbox_next_billing_date: nextBillingDate, charge_failure_count: 0 })
        .eq("id", domain.id);

      results.push({ domain: domain.domain, status: "covered_by_offer" });
      console.log(`[inbox-billing] Offer entitlement covers ${domain.domain} (ws=${domain.workspace_id}, slots=${coveredSlots})`);
      continue;
    }

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

        // Mark all inboxes on this domain as error and stop warmup so they
        // don't get added to Postal's suppression list while suspended
        await db.from("outreach_inboxes")
          .update({
            status:         "error",
            last_error:     "Domain suspended — inbox billing failed. Update your payment method to restore.",
            warmup_enabled: false,
          })
          .eq("domain_id", domain.id)
          .in("status", ["active", "paused"]);

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
