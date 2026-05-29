import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createPaystackCheckout } from "@/lib/billing/paystack";

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
    .select("id, domain, status, payment_provider, paystack_billing_email, paystack_inbox_monthly_kobo, inbox_next_billing_date")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (domain.payment_provider !== "paystack") {
    return NextResponse.json({ error: "Card updates are only supported for Paystack billing. Manage your Stripe subscription from the billing portal." }, { status: 400 });
  }

  const isOverdue = domain.status === "active"
    && domain.inbox_next_billing_date
    && new Date(domain.inbox_next_billing_date as string) < new Date();

  if (domain.status !== "payment_failed" && !isOverdue) {
    return NextResponse.json({ error: "Domain does not have a failed or overdue payment" }, { status: 400 });
  }

  if (!domain.paystack_inbox_monthly_kobo) {
    return NextResponse.json({ error: "Billing amount not configured for this domain" }, { status: 400 });
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email")
    .eq("id", workspaceId)
    .single();

  const billingEmail = (domain.paystack_billing_email as string | null)
    ?? workspace?.billing_email
    ?? `workspace-${workspaceId}@leadash.com`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callbackUrl = `${appUrl}/inboxes?tab=domains&update_payment_domain=${id}`;

  try {
    const { authorizationUrl, reference } = await createPaystackCheckout({
      email:       billingEmail,
      amountKobo:  domain.paystack_inbox_monthly_kobo as number,
      callbackUrl,
      metadata:    { domain_id: id, workspace_id: workspaceId, type: "inbox_update_payment" },
    });

    return NextResponse.json({ checkout_url: authorizationUrl, reference });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[new-payment] checkout init failed domain=${id}:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
