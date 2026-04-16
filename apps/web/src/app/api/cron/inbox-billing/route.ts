/**
 * GET /api/cron/inbox-billing
 *
 * Daily cron — charges Paystack authorization codes for active inbox domains
 * whose billing date has passed. Runs at 02:00 UTC every day.
 *
 * Skips domains that are paused, failed, or not yet due.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { chargePaystackAuthorization } from "@/lib/billing/paystack";
import { sendInboxPaymentSuccess, sendInboxPaymentFailed } from "@/lib/email/notifications";

export async function GET(req: NextRequest) {
  // Allow Vercel cron (no Authorization header) or manual calls with the cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  const { data: domains, error } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, paystack_auth_code, paystack_billing_email, paystack_inbox_monthly_kobo")
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

      const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("outreach_domains")
        .update({ inbox_next_billing_date: nextBillingDate })
        .eq("id", domain.id);

      results.push({ domain: domain.domain, status, reference });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[inbox-billing] charge failed for ${domain.domain}:`, msg);

      // If the charge fails (card declined etc.), mark inboxes as suspended
      // after 3 days of non-payment (give a grace period).
      // For now just log — suspension logic can be added later.
      results.push({ domain: domain.domain, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ charged: results.length, results });
}
